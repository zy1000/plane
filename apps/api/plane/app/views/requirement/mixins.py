"""需求行的读写入口与字段来源解析。

以前这里的主要工作是「正式表 / 工作副本」的分派 —— 那套东西随影子表一起没了。
现在只有一层：`requirements` 的行就是唯一的可变副本。RowLayer 保留是因为它还有两个
真正不同的消费者（产品需求 / 标准库条目），它们在 queryset、插入与批量保存、字段来源、
权限模型上都不一样。

只读也不再是产品级的闸门：一条需求能不能写，只看它自己在不在评审中
（Requirement.pending_change_item），见 row_base.py 的逐端点闸门。
"""

from typing import NamedTuple

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from plane.db.models import (
    Product,
    Requirement,
    RequirementApprovalPolicy,
    RequirementType,
)
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement import (
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


def resolve_row_layer(policy):
    """产品/项目作用域下的需求行入口。

    字段一律实时取自被引用的需求类型 —— 字段结构变更立即生效，正式表里再没有任何
    东西是冻结的。历史版本的渲染依据由 RequirementTypeSchemaRevision 保住。
    """
    scope = scope_row_filter(policy)
    requirement_type_ids = get_referenced_requirement_type_ids(
        model=Requirement, scope=scope
    )
    fields, fields_by_requirement_type = field_specs_for_requirement_types(
        requirement_type_ids
    )
    return RowLayer(
        queryset=Requirement.objects.filter(**scope).order_by(
            "sort_order", "created_at", "id"
        ),
        serializer_context={
            "product_id": policy.product_id,
            "project_id": policy.project_id,
            # 这一批行的展示编号前缀（ECOM-1 里的 ECOM）。作用域内是常量，
            # policy 已经 select_related 了 product/project，取它零查询。
            "scope_identifier": (
                policy.product.identifier
                if policy.product_id
                else policy.project.identifier
            ),
        },
        requirement_type_ids=requirement_type_ids,
        fields=fields,
        fields_by_requirement_type=fields_by_requirement_type,
        requirement_type_resolver=RequirementTypeResolver(
            workspace_id=policy.workspace_id
        ),
        default_requirement_type_id=None,
        insert=lambda **kwargs: insert_baseline_requirement(policy=policy, **kwargs),
        save_batch=lambda **kwargs: save_baseline_requirement_batch(
            policy=policy, **kwargs
        ),
        import_items=lambda **kwargs: import_library_items(policy=policy, **kwargs),
    )


def get_scoped_product(user, *, slug, product_id):
    """按工作区与可见性解析产品；不存在或不可见都返回 None。"""
    try:
        product = (
            Product.objects.filter(id=product_id, workspace__slug=slug)
            .select_related("workspace")
            .prefetch_related("reviewers")
            .first()
        )
    except (ValidationError, ValueError):
        return None
    if product is None or not can_view_product(user, product):
        return None
    return product


def get_scoped_policy(user, *, slug, product_id, for_update=False, create=False):
    """解析产品的需求审批配置。

    配置是惰性创建的：产品刚建出来时并没有配置行，第一次打开需求页（GET 配置）或第一次
    提交评审时才落库。create=False 时返回 (product, None)，调用方按需决定是报 404 还是
    给一份空态 —— 没有配置不影响录入需求，只影响提交评审。
    """
    product = get_scoped_product(user, slug=slug, product_id=product_id)
    if product is None:
        return None, None

    queryset = RequirementApprovalPolicy.objects.filter(product=product).select_related(
        "workspace", "product", "project", "owner"
    )
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    policy = queryset.first()
    if policy is None and create:
        # 配置行还不存在时 for_update 锁不住任何东西，两个并发的「产品第一条需求」
        # 会同时走到这里。谁先 INSERT 谁赢，输的那个吞掉 IntegrityError 再回头把
        # 赢家的行锁住 —— 否则两条需求会各自取到 sequence_id=1。
        # 内层 atomic 是必需的：不开 savepoint 的话 IntegrityError 会把外层事务
        # 标记成 broken，后面一句查询都发不出去。
        try:
            with transaction.atomic():
                policy = RequirementApprovalPolicy.objects.create(
                    product=product,
                    workspace_id=product.workspace_id,
                    owner=user,
                    created_by=user,
                )
        except IntegrityError:
            policy = None
        policy = queryset.first() or policy
    return product, policy


def can_write_requirements(user, product):
    """能不能录入/修改需求条目。产品成员即可。"""
    return can_edit_product_requirements(user, product)


def can_manage_policy(user, product):
    """能不能改审批配置（谁是审批人、几个人通过）。

    必须比 can_write_requirements 更窄：配置本身不再受审批保护，两者相同的话，任何
    能提交的人都可以先把审批人改成自己再批自己的单。
    """
    from plane.utils.product import can_manage_product

    return can_manage_product(user, product)
