"""工作项 ↔ 产品 / 产品模块（RequirementModule）挂靠的领域规则。

工作项上的 `product` / `product_module` 是两个单选外键。规则只有三条，全部
写在这里，序列化器（创建 / PATCH）、批量改属性、Excel 导入、需求关联自动带出
四条路径共用，不要在调用方各写一份：

1. 产品必须在项目关联产品池（ProductProject，`linked_product_ids`）内；
2. 模块必须属于所选产品（库模块永远不合法）；
3. 换产品（含清空）时旧模块跟着清空 —— 服务端兜底，前端也会主动同发。

产品未变时不重查池：产品事后从项目解绑，存量工作项改标题不该因此 400。
"""

from django.utils import timezone
from rest_framework import serializers

from plane.db.models import (
    Issue,
    IssueActivity,
    Product,
    Requirement,
    RequirementModule,
)
from plane.utils.requirement_project import linked_product_ids

ERROR_PRODUCT_NOT_LINKED = "ISSUE_PRODUCT_NOT_LINKED_TO_PROJECT"
ERROR_MODULE_REQUIRES_PRODUCT = "ISSUE_PRODUCT_MODULE_REQUIRES_PRODUCT"
ERROR_MODULE_NOT_IN_PRODUCT = "ISSUE_PRODUCT_MODULE_NOT_IN_PRODUCT"

AUTOFILL_COMMENT = "auto-filled from linked requirement"


def is_product_linked(project_id, product_id, linked_products=None):
    """产品是否在项目产品池内。`linked_products` 是调用方按请求缓存的 id 集合
    （批量 / 导入一个请求只查一次池），不传就直接查。"""
    if product_id is None:
        return True
    if linked_products is not None:
        return str(product_id) in linked_products
    return (
        linked_product_ids(project_id)
        .filter(product_id=product_id, product__deleted_at__isnull=True)
        .exists()
    )


def linked_product_id_set(project_id):
    return {
        str(product_id)
        for product_id in linked_product_ids(project_id).filter(
            product__deleted_at__isnull=True
        )
    }


def resolve_issue_product_fields(
    *,
    project_id,
    current_product_id,
    current_module_id,
    attrs,
    linked_products=None,
):
    """按「本次提到了哪些字段」把产品 / 模块解析成最终应写入的 `(product_id, module_id)`。

    `attrs` 是序列化器 validate 里的 attrs（键为 `product` / `product_module`，
    值是模型实例或 None）。用 `in` 判断「提到」：PATCH 显式传 null 与没传是两回事。
    返回值调用方回写进 attrs；抛 `ValidationError({"product_id": [<CODE>]})`。
    """
    product_touched = "product" in attrs
    module_touched = "product_module" in attrs

    product = attrs.get("product") if product_touched else None
    module = attrs.get("product_module") if module_touched else None

    effective_product_id = (
        (str(product.id) if product else None)
        if product_touched
        else (str(current_product_id) if current_product_id else None)
    )
    effective_module = module if module_touched else None
    effective_module_id = (
        (str(module.id) if module else None)
        if module_touched
        else (str(current_module_id) if current_module_id else None)
    )

    product_changed = product_touched and effective_product_id != (
        str(current_product_id) if current_product_id else None
    )

    if product_changed and effective_product_id is not None:
        if not is_product_linked(project_id, effective_product_id, linked_products):
            raise serializers.ValidationError({"product_id": [ERROR_PRODUCT_NOT_LINKED]})

    if effective_module_id is None:
        return effective_product_id, None

    if effective_product_id is None:
        if module_touched:
            raise serializers.ValidationError(
                {"product_module_id": [ERROR_MODULE_REQUIRES_PRODUCT]}
            )
        # 只清了产品：旧模块跟着清
        return None, None

    module_product_id = (
        str(effective_module.product_id)
        if effective_module is not None
        else _module_product_id(effective_module_id)
    )
    if module_product_id != effective_product_id:
        if module_touched:
            raise serializers.ValidationError(
                {"product_module_id": [ERROR_MODULE_NOT_IN_PRODUCT]}
            )
        # 只换了产品：旧模块不属于新产品，自动清空
        return effective_product_id, None

    return effective_product_id, effective_module_id


def _module_product_id(module_id):
    row = (
        RequirementModule.objects.filter(pk=module_id)
        .values_list("product_id", flat=True)
        .first()
    )
    return str(row) if row else None


def apply_resolved_product_fields(attrs, resolved, *, current_product_id, current_module_id):
    """把 resolve 的结果写回序列化器 attrs。只在「提到过」或「值需要被自动改」时
    写，避免 partial PATCH 把未提到的字段原样覆盖一遍。"""
    product_id, module_id = resolved

    def _id_of(instance):
        return str(instance.id) if instance is not None else None

    if "product" in attrs:
        if _id_of(attrs["product"]) != product_id:
            attrs["product"] = Product.objects.filter(pk=product_id).first() if product_id else None
    elif product_id != (str(current_product_id) if current_product_id else None):
        attrs["product"] = Product.objects.filter(pk=product_id).first() if product_id else None

    if "product_module" in attrs:
        if _id_of(attrs["product_module"]) != module_id:
            attrs["product_module"] = (
                RequirementModule.objects.filter(pk=module_id).first() if module_id else None
            )
    elif module_id != (str(current_module_id) if current_module_id else None):
        attrs["product_module"] = (
            RequirementModule.objects.filter(pk=module_id).first() if module_id else None
        )
    return attrs


def autofill_issue_product_from_requirements(*, project_id, pairs, actor_id, workspace_id):
    """工作项首次关联需求时把需求的产品 / 模块带到工作项上。

    `pairs` 是 `[(issue_id, requirement_id), ...]`，按请求顺序；只处理产品为空的
    工作项，每个取它这批里**第一条**有产品的需求。需求能关联进项目时产品已在池内，
    仍做一次防御过滤。写入是条件化 update（不触 Issue.save 副作用），活动直接
    bulk_create —— 逐个走 celery mapper 要为每条构造 requested/current 两份 JSON，
    不值得。返回带出成功的工作项 id 列表。
    """
    if not pairs:
        return []
    issue_ids = list(dict.fromkeys(str(issue_id) for issue_id, _ in pairs))
    candidates = set(
        str(value)
        for value in Issue.objects.filter(
            id__in=issue_ids, project_id=project_id, product_id__isnull=True
        )
        .order_by()
        .values_list("id", flat=True)
    )
    if not candidates:
        return []

    requirement_ids = list(dict.fromkeys(str(rid) for _, rid in pairs))
    requirement_rows = {
        str(row["id"]): row
        for row in Requirement.objects.filter(
            id__in=requirement_ids, product_id__isnull=False
        ).values("id", "product_id", "module_id")
    }
    if not requirement_rows:
        return []

    linked = linked_product_id_set(project_id)
    picked = {}
    for issue_id, requirement_id in pairs:
        issue_id, requirement_id = str(issue_id), str(requirement_id)
        if issue_id not in candidates or issue_id in picked:
            continue
        row = requirement_rows.get(requirement_id)
        if row is None or str(row["product_id"]) not in linked:
            continue
        picked[issue_id] = (str(row["product_id"]), str(row["module_id"]) if row["module_id"] else None)
    if not picked:
        return []

    product_names = {
        str(pid): name
        for pid, name in Product.objects.filter(
            id__in={product_id for product_id, _ in picked.values()}
        ).values_list("id", "name")
    }
    module_ids = {module_id for _, module_id in picked.values() if module_id}
    module_labels = {module_id: module_path_label(module_id) for module_id in module_ids}

    now = timezone.now()
    epoch = int(now.timestamp())
    activities = []
    for issue_id, (product_id, module_id) in picked.items():
        Issue.objects.filter(pk=issue_id, product_id__isnull=True).update(
            product_id=product_id,
            product_module_id=module_id,
            updated_at=now,
            updated_by_id=actor_id,
        )
        activities.append(
            IssueActivity(
                issue_id=issue_id,
                actor_id=actor_id,
                verb="updated",
                field="product",
                old_value="",
                new_value=product_names.get(product_id, ""),
                old_identifier=None,
                new_identifier=product_id,
                project_id=project_id,
                workspace_id=workspace_id,
                comment=AUTOFILL_COMMENT,
                epoch=epoch,
            )
        )
        if module_id:
            activities.append(
                IssueActivity(
                    issue_id=issue_id,
                    actor_id=actor_id,
                    verb="updated",
                    field="product_module",
                    old_value="",
                    new_value=module_labels.get(module_id, ""),
                    old_identifier=None,
                    new_identifier=module_id,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    comment=AUTOFILL_COMMENT,
                    epoch=epoch,
                )
            )
    IssueActivity.objects.bulk_create(activities, batch_size=100)
    return list(picked.keys())


def module_path_label(module_id):
    """单个模块的名称路径 `A / B / C`；模块已被硬删时返回空串。活动记录 / 导出
    渲染用。整棵树的口径见 utils/requirement_module.module_path_index。"""
    names = []
    visited = set()
    current = str(module_id) if module_id else None
    while current and current not in visited:
        visited.add(current)
        row = (
            RequirementModule.objects.filter(pk=current)
            .values_list("name", "parent_id")
            .first()
        )
        if row is None:
            break
        names.append(row[0])
        current = str(row[1]) if row[1] else None
    return " / ".join(reversed(names))


def product_module_queryset():
    """模块外键字段的候选集：只有产品模块，库模块永远选不到。"""
    return RequirementModule.objects.filter(product__isnull=False)


__all__ = [
    "ERROR_PRODUCT_NOT_LINKED",
    "ERROR_MODULE_REQUIRES_PRODUCT",
    "ERROR_MODULE_NOT_IN_PRODUCT",
    "resolve_issue_product_fields",
    "apply_resolved_product_fields",
    "autofill_issue_product_from_requirements",
    "linked_product_id_set",
    "module_path_label",
    "product_module_queryset",
]
