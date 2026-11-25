"""工作项 ↔ 产品 / 产品模块（RequirementModule）挂靠的领域规则。

关联的真值是 `IssueProduct` 行（每行一个产品 + 该产品下可选的一个模块）；
`Issue.product / product_module` 是「第一个关联产品」的镜像，旧的单值读路径照用。
规则全部写在这里，序列化器（创建 / PATCH）、批量改属性、Excel 导入、需求关联
自动带出、详情页「产品」区块的增删改共用，不要在调用方各写一份：

1. 产品必须在项目关联产品池（ProductProject，`linked_product_ids`）内；
2. 模块必须属于所选产品（库模块永远不合法）；
3. 换产品（含清空）时旧模块跟着清空 —— 服务端兜底，前端也会主动同发；
4. 缺陷（类型分类名为「缺陷」）可关联多个产品、至少一个；其余类型至多一个。
   「至少一个」只拦新建和改产品本身：存量缺陷没产品，改其他属性照常保存。

产品未变时不重查池：产品事后从项目解绑，存量工作项改标题不该因此 400。
单值写入（`product_id` / `product_module_id`）落到缺陷上时等于「整组换成这一个」。
"""

import functools

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProduct,
    IssueType,
    Product,
    Requirement,
    RequirementModule,
)
from plane.utils.requirement_project import linked_product_ids

ERROR_PRODUCT_NOT_LINKED = "ISSUE_PRODUCT_NOT_LINKED_TO_PROJECT"
ERROR_MODULE_REQUIRES_PRODUCT = "ISSUE_PRODUCT_MODULE_REQUIRES_PRODUCT"
ERROR_MODULE_NOT_IN_PRODUCT = "ISSUE_PRODUCT_MODULE_NOT_IN_PRODUCT"
ERROR_DEFECT_PRODUCT_REQUIRED = "ISSUE_DEFECT_PRODUCT_REQUIRED"
ERROR_SINGLE_PRODUCT_ONLY = "ISSUE_PRODUCT_SINGLE_ONLY"
ERROR_PRODUCT_NOT_FOUND = "ISSUE_PRODUCT_NOT_FOUND"

#: 判定「缺陷」看工作项类型的分类名，口径同 utils/risk.py / 缺陷页
DEFECT_CATEGORY_NAME = "缺陷"

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
    sync_links_from_primary(picked.keys())
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


# ---------------------------------------------------------------------------
# 多产品关联（IssueProduct）
# ---------------------------------------------------------------------------


def _lock_issue(issue_id):
    """在当前事务里锁住工作项行：关联的「读 → 算 → 写」串行，并发追加不会互相覆盖。"""
    Issue.all_objects.select_for_update().filter(pk=issue_id).values_list("id", flat=True).first()


def _with_issue_lock(func):
    @functools.wraps(func)
    def wrapper(issue, *args, **kwargs):
        with transaction.atomic():
            _lock_issue(issue.id)
            return func(issue, *args, **kwargs)

    return wrapper


def is_defect_type(type_id):
    """类型分类名为「缺陷」即缺陷；没有类型的工作项不是缺陷。"""
    if not type_id:
        return False
    return IssueType.objects.filter(pk=type_id, category__name=DEFECT_CATEGORY_NAME).exists()


def normalize_product_entries(raw, current_entries=None):
    """把请求里的 `products` 统一成 `[(product_id, module_id|None), ...]`，按产品去重保序。

    每项可以是 `{"product_id": ..., "product_module_id": ...}`，或只给产品 id 字符串 ——
    后者表示「这个产品，模块不动」：已关联的沿用它现在的模块（列表拖拽换组用）。"""
    if raw is None:
        return None
    current_modules = dict(current_entries or [])
    if not isinstance(raw, (list, tuple)):
        raise serializers.ValidationError({"products": ["INVALID"]})
    entries = []
    seen = set()
    for item in raw:
        if isinstance(item, dict):
            product_id = item.get("product_id")
            module_id = item.get("product_module_id") or None
        else:
            product_id = item
            module_id = current_modules.get(str(item)) if item else None
        if not product_id:
            continue
        product_id = str(product_id)
        if product_id in seen:
            continue
        seen.add(product_id)
        entries.append((product_id, str(module_id) if module_id else None))
    return entries


def current_product_entries(issue_id):
    return [
        (str(product_id), str(module_id) if module_id else None)
        for product_id, module_id in IssueProduct.objects.filter(issue_id=issue_id)
        .order_by("sort_order", "created_at")
        .values_list("product_id", "product_module_id")
    ]


def validate_product_entries(
    *, project_id, is_defect, entries, current_entries=(), linked_products=None
):
    """校验一整组产品关联；抛 `ValidationError({"products": [<CODE>]})`。

    已关联的产品不重查项目产品池（同单值规则：事后解绑不该让存量操作 400）。"""
    if not is_defect and len(entries) > 1:
        raise serializers.ValidationError({"products": [ERROR_SINGLE_PRODUCT_ONLY]})
    if is_defect and not entries:
        raise serializers.ValidationError({"products": [ERROR_DEFECT_PRODUCT_REQUIRED]})

    current_ids = {product_id for product_id, _ in current_entries}
    pool = linked_products
    for product_id, _ in entries:
        if product_id in current_ids:
            continue
        if pool is None:
            pool = linked_product_id_set(project_id)
        if product_id not in pool:
            raise serializers.ValidationError({"products": [ERROR_PRODUCT_NOT_LINKED]})

    module_ids = {module_id for _, module_id in entries if module_id}
    if module_ids:
        module_products = {
            str(module_id): str(product_id)
            for module_id, product_id in RequirementModule.objects.filter(
                pk__in=module_ids
            ).values_list("id", "product_id")
        }
        for product_id, module_id in entries:
            if module_id and module_products.get(module_id) != product_id:
                raise serializers.ValidationError({"products": [ERROR_MODULE_NOT_IN_PRODUCT]})


@_with_issue_lock
def write_product_entries(issue, entries, *, actor_id=None, activity=True, epoch=None):
    """把关联行写成 `entries`（已校验），同步 `Issue.product / product_module` 镜像，
    按差异写活动（产品增删各一条、模块变更一条）。返回是否有变化。

    不触发 Issue.save()：镜像用条件 update，避免 save 副作用（描述版本、通知等）。"""
    current = current_product_entries(issue.id)
    if current == list(entries):
        return False

    current_map = dict(current)
    target_map = dict(entries)
    rows = {
        str(row.product_id): row
        for row in IssueProduct.objects.filter(issue_id=issue.id)
    }

    removed = [pid for pid in current_map if pid not in target_map]
    if removed:
        IssueProduct.objects.filter(issue_id=issue.id, product_id__in=removed).delete(soft=False)

    module_changes = []
    for index, (product_id, module_id) in enumerate(entries):
        sort_order = float((index + 1) * 1000)
        row = rows.get(product_id)
        if row is None:
            IssueProduct.objects.create(
                issue_id=issue.id,
                product_id=product_id,
                product_module_id=module_id,
                sort_order=sort_order,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
            )
            if module_id:
                module_changes.append((product_id, None, module_id))
            continue
        old_module = str(row.product_module_id) if row.product_module_id else None
        if old_module != module_id or row.sort_order != sort_order:
            IssueProduct.objects.filter(pk=row.pk).update(
                product_module_id=module_id, sort_order=sort_order, updated_at=timezone.now()
            )
        if old_module != module_id:
            module_changes.append((product_id, old_module, module_id))

    primary_product, primary_module = entries[0] if entries else (None, None)
    Issue.objects.filter(pk=issue.id).update(
        product_id=primary_product, product_module_id=primary_module, updated_at=timezone.now()
    )
    issue.product_id = primary_product
    issue.product_module_id = primary_module

    if activity:
        _write_product_activities(
            issue,
            added=[pid for pid, _ in entries if pid not in current_map],
            removed=removed,
            module_changes=module_changes,
            actor_id=actor_id,
            epoch=epoch,
        )
    return True


def _write_product_activities(issue, *, added, removed, module_changes, actor_id, epoch=None):
    product_ids = set(added) | set(removed) | {pid for pid, _, _ in module_changes}
    if not product_ids:
        return
    names = {
        str(pid): name
        for pid, name in Product.all_objects.filter(id__in=product_ids).values_list("id", "name")
    }
    epoch = epoch or int(timezone.now().timestamp())
    common = dict(
        issue_id=issue.id,
        actor_id=actor_id,
        verb="updated",
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        epoch=epoch,
    )
    activities = []
    for product_id in added:
        activities.append(
            IssueActivity(
                field="product",
                old_value="",
                new_value=names.get(product_id, ""),
                old_identifier=None,
                new_identifier=product_id,
                **common,
            )
        )
    for product_id in removed:
        activities.append(
            IssueActivity(
                field="product",
                old_value=names.get(product_id, ""),
                new_value="",
                old_identifier=product_id,
                new_identifier=None,
                **common,
            )
        )
    for product_id, old_module, new_module in module_changes:
        prefix = names.get(product_id, "")
        activities.append(
            IssueActivity(
                field="product_module",
                old_value=f"{prefix} / {module_path_label(old_module)}" if old_module else "",
                new_value=f"{prefix} / {module_path_label(new_module)}" if new_module else "",
                old_identifier=old_module,
                new_identifier=new_module,
                **common,
            )
        )
    IssueActivity.objects.bulk_create(activities, batch_size=100)


@_with_issue_lock
def set_issue_products(issue, raw_entries, *, actor_id=None, linked_products=None):
    """整组设置（新建弹窗 / 列表多选 / 批量）：校验 + 写入。"""
    current = current_product_entries(issue.id)
    entries = normalize_product_entries(raw_entries, current) or []
    validate_product_entries(
        project_id=issue.project_id,
        is_defect=is_defect_type(issue.type_id),
        entries=entries,
        current_entries=current,
        linked_products=linked_products,
    )
    return write_product_entries(issue, entries, actor_id=actor_id)


@_with_issue_lock
def add_issue_products(issue, product_ids, *, actor_id=None):
    """详情页「关联产品」：在现有关联后追加。"""
    current = current_product_entries(issue.id)
    existing = {pid for pid, _ in current}
    entries = current + [
        (str(pid), None) for pid in dict.fromkeys(str(p) for p in product_ids) if str(pid) not in existing
    ]
    validate_product_entries(
        project_id=issue.project_id,
        is_defect=is_defect_type(issue.type_id),
        entries=entries,
        current_entries=current,
    )
    return write_product_entries(issue, entries, actor_id=actor_id)


@_with_issue_lock
def remove_issue_product(issue, product_id, *, actor_id=None):
    """详情页解除关联：缺陷至少保留一个。"""
    current = current_product_entries(issue.id)
    product_id = str(product_id)
    if product_id not in {pid for pid, _ in current}:
        raise serializers.ValidationError({"products": [ERROR_PRODUCT_NOT_FOUND]})
    entries = [(pid, mid) for pid, mid in current if pid != product_id]
    if not entries and is_defect_type(issue.type_id):
        raise serializers.ValidationError({"products": [ERROR_DEFECT_PRODUCT_REQUIRED]})
    return write_product_entries(issue, entries, actor_id=actor_id)


@_with_issue_lock
def set_issue_product_module(issue, product_id, module_id, *, actor_id=None):
    """详情页某一行改产品模块。"""
    current = current_product_entries(issue.id)
    product_id = str(product_id)
    if product_id not in {pid for pid, _ in current}:
        raise serializers.ValidationError({"products": [ERROR_PRODUCT_NOT_FOUND]})
    module_id = str(module_id) if module_id else None
    entries = [(pid, module_id if pid == product_id else mid) for pid, mid in current]
    validate_product_entries(
        project_id=issue.project_id,
        is_defect=is_defect_type(issue.type_id),
        entries=entries,
        current_entries=current,
    )
    return write_product_entries(issue, entries, actor_id=actor_id)


def sync_links_from_primary(issue_ids):
    """单值路径（product_id / product_module_id 写入）之后，把关联行对齐到镜像列：
    有产品 → 只剩这一行；无产品 → 清空。活动由单值路径自己写，这里不写。"""
    issue_ids = [str(i) for i in issue_ids]
    if not issue_ids:
        return
    rows = Issue.all_objects.filter(pk__in=issue_ids).values(
        "id", "product_id", "product_module_id", "project_id", "workspace_id"
    )
    for row in rows:
        issue = Issue(
            id=row["id"],
            project_id=row["project_id"],
            workspace_id=row["workspace_id"],
        )
        entries = (
            [(str(row["product_id"]), str(row["product_module_id"]) if row["product_module_id"] else None)]
            if row["product_id"]
            else []
        )
        write_product_entries(issue, entries, activity=False)


def apply_product_move(current, is_defect, move):
    """列表按产品 / 产品模块分组时拖拽换组：只给「从哪组到哪组」，在库里的完整关联上算出新的一组。

    `move` 键：from_product / to_product（产品分组）、from_module / to_module（模块分组），值为 id 或 None（「无」组）。
    非缺陷至多一个产品，拖进别的产品（或别的产品的模块）就是整体换掉。"""
    entries = list(current)
    if "from_product" in move or "to_product" in move:
        source, target = move.get("from_product"), move.get("to_product")
        source = str(source) if source else None
        target = str(target) if target else None
        entries = [(pid, mid) for pid, mid in entries if pid != source]
        if target:
            if not is_defect:
                entries = [(target, dict(current).get(target))]
            elif target not in {pid for pid, _ in entries}:
                entries.append((target, None))
    if "from_module" in move or "to_module" in move:
        source, target = move.get("from_module"), move.get("to_module")
        source = str(source) if source else None
        target = str(target) if target else None
        target_product = _module_product_id(target) if target else None
        entries = [
            (pid, None if source and mid == source and pid != target_product else mid) for pid, mid in entries
        ]
        if target_product:
            if target_product in {pid for pid, _ in entries}:
                entries = [(pid, target if pid == target_product else mid) for pid, mid in entries]
                if not is_defect:
                    entries = [(pid, mid) for pid, mid in entries if pid == target_product]
            elif is_defect:
                entries.append((target_product, target))
            else:
                entries = [(target_product, target)]
    return entries


@_with_issue_lock
def move_issue_products(issue, move, *, actor_id=None, is_defect=None):
    """拖拽换组落库：锁住工作项后按库里当前关联计算、校验、写入。"""
    current = current_product_entries(issue.id)
    is_defect = is_defect_type(issue.type_id) if is_defect is None else is_defect
    entries = apply_product_move(current, is_defect, move)
    validate_product_entries(
        project_id=issue.project_id, is_defect=is_defect, entries=entries, current_entries=current
    )
    return write_product_entries(issue, entries, actor_id=actor_id)


def resync_primary_mirror(issue_ids):
    """镜像列对齐到当前第一个关联产品（产品被删、关联行被级联软删后用）。"""
    for issue_id in {str(i) for i in issue_ids}:
        entries = current_product_entries(issue_id)
        product_id, module_id = entries[0] if entries else (None, None)
        Issue.all_objects.filter(pk=issue_id).update(product_id=product_id, product_module_id=module_id)


def issue_products_payload(issue_ids):
    """详情 / 列表随行带出的关联产品：`{issue_id: [{product_id, product_name, ...}]}`。"""
    issue_ids = [str(i) for i in issue_ids]
    result = {issue_id: [] for issue_id in issue_ids}
    if not issue_ids:
        return result
    rows = (
        IssueProduct.objects.filter(issue_id__in=issue_ids)
        .order_by("sort_order", "created_at")
        .values(
            "issue_id",
            "product_id",
            "product__name",
            "product__identifier",
            "product__code",
            "product__is_set",
            "product_module_id",
            "product_module__name",
        )
    )
    for row in rows:
        result.setdefault(str(row["issue_id"]), []).append(
            {
                "product_id": str(row["product_id"]),
                "product_name": row["product__name"],
                "product_identifier": row["product__identifier"],
                "product_code": row["product__code"],
                "product_is_set": row["product__is_set"],
                "product_module_id": str(row["product_module_id"]) if row["product_module_id"] else None,
                "product_module_name": row["product_module__name"],
            }
        )
    return result


__all__ = [
    "ERROR_PRODUCT_NOT_LINKED",
    "ERROR_MODULE_REQUIRES_PRODUCT",
    "ERROR_MODULE_NOT_IN_PRODUCT",
    "ERROR_DEFECT_PRODUCT_REQUIRED",
    "ERROR_SINGLE_PRODUCT_ONLY",
    "DEFECT_CATEGORY_NAME",
    "is_defect_type",
    "normalize_product_entries",
    "current_product_entries",
    "validate_product_entries",
    "write_product_entries",
    "set_issue_products",
    "add_issue_products",
    "remove_issue_product",
    "set_issue_product_module",
    "sync_links_from_primary",
    "issue_products_payload",
    "resync_primary_mirror",
    "apply_product_move",
    "move_issue_products",
    "resolve_issue_product_fields",
    "apply_resolved_product_fields",
    "autofill_issue_product_from_requirements",
    "linked_product_id_set",
    "module_path_label",
    "product_module_queryset",
]
