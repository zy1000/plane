"""需求行的读写入口与字段来源解析。

以前这里的主要工作是「正式表 / 工作副本」的分派 —— 那套东西随影子表一起没了。
现在只有一层：`requirements` 的行就是唯一的可变副本。RowLayer 保留是因为它还有两个
真正不同的消费者（产品需求 / 标准库条目），它们在 queryset、插入与批量保存、字段来源、
权限模型上都不一样。

只读也不再是产品级的闸门：一条需求能不能写，只看它自己在不在评审中
（Requirement.pending_change_item），见 row_base.py 的逐端点闸门。

作用域句柄是 RequirementScopeHandle（product / project 二选一）；产品级的取号写锁
就是 Product 行本身 —— 审批人与规则已经下沉到每张变更单，产品上没有配置行可锁了。
"""

from typing import NamedTuple

from django.core.exceptions import ValidationError

from plane.db.models import (
    Product,
    Requirement,
    RequirementType,
)
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement import (
    RequirementScopeHandle,
    field_specs_for_requirement_types,
    get_referenced_requirement_type_ids,
    get_requirement_type_field_specs,
    import_library_items,
    insert_baseline_requirement,
    save_baseline_requirement_batch,
    scope_row_filter,
)


class RequirementTypeResolver:
    """按 requirement_type_id 解析需求类型并缓存它的字段 spec。

    只在**新增行**时用得到 —— 更新走行上已存的 requirement_type_id，绑定创建后
    不可变。变更轨迹的「字段结构变更」并入逻辑也依赖这个不可变性，见
    plane.app.views.requirement.change.RequirementChangeTrailViewSet。
    """

    def __init__(self, *, workspace_id, allowed_requirement_type_id=None):
        self.workspace_id = workspace_id
        self.allowed_requirement_type_id = (
            str(allowed_requirement_type_id) if allowed_requirement_type_id else None
        )
        self._requirement_types = {}
        self._specs = {}

    def resolve(self, requirement_type_id):
        key = str(requirement_type_id)
        if (
            self.allowed_requirement_type_id
            and key != self.allowed_requirement_type_id
        ):
            return None
        if key not in self._requirement_types:
            self._requirement_types[key] = RequirementType.objects.filter(
                id=requirement_type_id,
                workspace_id=self.workspace_id,
                is_active=True,
            ).first()
        return self._requirement_types[key]

    def specs(self, requirement_type_id):
        key = str(requirement_type_id)
        if key not in self._specs:
            requirement_type = self.resolve(requirement_type_id)
            self._specs[key] = (
                get_requirement_type_field_specs(requirement_type)
                if requirement_type is not None
                else []
            )
        return self._specs[key]


class RowLayer(NamedTuple):
    """一批需求行的读写入口。产品需求与标准库条目各给一份。"""

    queryset: object
    serializer_context: dict
    requirement_type_ids: list
    fields: list
    fields_by_requirement_type: dict
    requirement_type_resolver: object
    default_requirement_type_id: object
    insert: object
    save_batch: object
    import_items: object


def resolve_row_layer(scope):
    """产品/项目作用域下的需求行入口。

    字段一律实时取自被引用的需求类型 —— 字段结构变更立即生效，正式表里再没有任何
    东西是冻结的。历史版本的渲染依据由 RequirementTypeSchemaRevision 保住。
    """
    row_scope = scope_row_filter(scope)
    requirement_type_ids = get_referenced_requirement_type_ids(
        model=Requirement, scope=row_scope
    )
    fields, fields_by_requirement_type = field_specs_for_requirement_types(
        requirement_type_ids
    )
    return RowLayer(
        # 不要在这条 queryset 上 select_related("module")：module 可空，会引入
        # LEFT OUTER JOIN，而 partial_update / rollback 直接在 layer.queryset 上
        # select_for_update()，Postgres 拒绝对 outer join 的可空侧加锁。
        # 模块名由 _row_context 的 module_names 批量映射解析，不靠 FK 穿透。
        queryset=Requirement.objects.filter(**row_scope).order_by(
            "sort_order", "created_at", "id"
        ),
        serializer_context={
            "product_id": scope.product_id,
            "project_id": scope.project_id,
            # 这一批行的展示编号前缀（ECOM-1 里的 ECOM）。作用域内是常量，
            # 句柄上挂的就是已加载的 product/project 实例，取它零查询。
            "scope_identifier": (
                scope.product.identifier
                if scope.product_id
                else scope.project.identifier
            ),
        },
        requirement_type_ids=requirement_type_ids,
        fields=fields,
        fields_by_requirement_type=fields_by_requirement_type,
        requirement_type_resolver=RequirementTypeResolver(
            workspace_id=scope.workspace_id
        ),
        default_requirement_type_id=None,
        insert=lambda **kwargs: insert_baseline_requirement(scope=scope, **kwargs),
        save_batch=lambda **kwargs: save_baseline_requirement_batch(
            scope=scope, **kwargs
        ),
        import_items=lambda **kwargs: import_library_items(scope=scope, **kwargs),
    )


def get_scoped_product(user, *, slug, product_id, for_update=False):
    """按工作区与可见性解析产品；不存在或不可见都返回 None。

    for_update 锁 Product 行：它是产品内取号（需求 sequence_id、变更单 sequence_id
    都是 Max+1）的互斥锁，只在 transaction.atomic() 内传 True。
    """
    queryset = (
        Product.objects.filter(id=product_id, workspace__slug=slug)
        .select_related("workspace")
        .prefetch_related("reviewers")
    )
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    try:
        product = queryset.first()
    except (ValidationError, ValueError):
        return None
    if product is None or not can_view_product(user, product):
        return None
    return product


def get_requirement_scope(user, *, slug, product_id, for_update=False):
    """解析产品并给出它的作用域句柄，返回 (product, scope)；产品不存在或不可见时
    两者都是 None。写路径传 for_update=True 拿产品级写锁（见 get_scoped_product）。
    """
    product = get_scoped_product(
        user, slug=slug, product_id=product_id, for_update=for_update
    )
    if product is None:
        return None, None
    return product, RequirementScopeHandle.for_product(product)


def can_write_requirements(user, product):
    """能不能录入/修改需求条目。产品成员即可。"""
    return can_edit_product_requirements(user, product)
