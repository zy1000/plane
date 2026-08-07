"""打基线：把一组需求的当前已批准版本冻结成一份不可变命名快照。

基线只收录**通过过审批**的需求。三种情况要分清楚，否则用户会以为自己基线了一份并不
存在的内容：

- 从未通过审批的草稿   -> 不收录，报告为 skipped
- 正在评审中的需求     -> 按**上一个已通过**的版本收录（评审结果还不存在）
- 已通过后又改过的需求 -> 同样按上一个已通过版本收录

后两种都收录了，但收录的不是行上此刻的内容，所以单独报告为 stale —— 「你基线的是 v2，
而这条需求现在已经不是 v2 了」。这件事必须在打基线**之前**就告诉用户，所以创建接口
支持 dry-run。
"""

from django.db.models import Count

from plane.db.models import (
    Requirement,
    RequirementBaseline,
    RequirementBaselineEntry,
    RequirementChangeType,
    RequirementVersion,
)


SKIP_NO_APPROVED_VERSION = "no_approved_version"
STALE_IN_REVIEW = "in_review"
STALE_MODIFIED = "modified"

ENTRY_BATCH_SIZE = 500


def _scope_filter(policy):
    if policy.product_id:
        return {"product_id": policy.product_id}
    return {"project_id": policy.project_id}


def collect_baseline_entries(policy, *, requirement_type_ids=None, requirement_ids=None):
    """返回 (可收录的 (需求, 版本) 列表, skipped, stale)。

    不写库 —— 创建与 dry-run 预览共用这一份判定，保证「预览说会纳入 128 条」与实际
    落库的 128 条永远是同一批。
    """
    queryset = Requirement.objects.filter(**_scope_filter(policy)).order_by(
        "sort_order", "created_at", "id"
    )
    if requirement_type_ids:
        queryset = queryset.filter(requirement_type_id__in=requirement_type_ids)
    if requirement_ids:
        queryset = queryset.filter(id__in=requirement_ids)

    # pending_change_item_id / approved_row_version 都是行上的真实列，不需要注解
    rows = list(queryset)

    includable = [row for row in rows if row.approved_version is not None]
    skipped = [
        {"requirement_id": str(row.id), "title": row.title, "reason": SKIP_NO_APPROVED_VERSION}
        for row in rows
        if row.approved_version is None
    ]

    # 一次取全要收录的版本行，逐条查会在几百条需求上退化成几百次查询
    version_by_target = {}
    if includable:
        pairs = {(row.id, row.approved_version) for row in includable}
        for version in RequirementVersion.objects.filter(
            target_id__in=[row.id for row in includable]
        ).only("id", "target_id", "version"):
            if (version.target_id, version.version) in pairs:
                version_by_target[version.target_id] = version

    entries = []
    stale = []
    for row in includable:
        version = version_by_target.get(row.id)
        if version is None:
            # 版本行缺失只可能是数据被手工动过；宁可漏收也不要挂一个解不开的引用
            skipped.append(
                {
                    "requirement_id": str(row.id),
                    "title": row.title,
                    "reason": SKIP_NO_APPROVED_VERSION,
                }
            )
            continue
        entries.append((row, version))
        if row.pending_change_item_id:
            reason = STALE_IN_REVIEW
        elif row.version != row.approved_row_version:
            reason = STALE_MODIFIED
        else:
            continue
        stale.append(
            {
                "requirement_id": str(row.id),
                "title": row.title,
                "version": version.version,
                "reason": reason,
            }
        )

    return entries, skipped, stale


def create_baseline(
    policy,
    *,
    name,
    description="",
    requirement_type_ids=None,
    requirement_ids=None,
    actor=None,
):
    """建一份基线并落库。返回 (baseline, skipped, stale)。"""
    entries, skipped, stale = collect_baseline_entries(
        policy,
        requirement_type_ids=requirement_type_ids,
        requirement_ids=requirement_ids,
    )

    baseline = RequirementBaseline(
        workspace_id=policy.workspace_id,
        product_id=policy.product_id,
        project_id=policy.project_id,
        name=name,
        description=description or "",
        entry_count=len(entries),
        created_by=actor,
        updated_by=actor,
    )
    baseline.save()

    RequirementBaselineEntry.objects.bulk_create(
        [
            RequirementBaselineEntry(
                baseline=baseline,
                requirement_id=row.id,
                version=version,
                sort_order=row.sort_order,
                created_by=actor,
                updated_by=actor,
            )
            for row, version in entries
        ],
        batch_size=ENTRY_BATCH_SIZE,
    )
    return baseline, skipped, stale


def baseline_type_stats(baseline):
    """基线里各需求类型收录了几条。DB 侧分组，不把条目拉进内存。"""
    rows = (
        RequirementBaselineEntry.objects.filter(baseline=baseline)
        # 清掉 Meta.ordering，否则它会混进 GROUP BY
        .order_by()
        .values(
            "version__requirement_type_id",
            "version__requirement_type__name",
            "version__requirement_type__logo_props",
        )
        .annotate(requirement_count=Count("id"))
    )
    return [
        {
            "id": str(row["version__requirement_type_id"]),
            "name": row["version__requirement_type__name"] or "",
            "logo_props": row["version__requirement_type__logo_props"] or {},
            "requirement_count": row["requirement_count"],
        }
        for row in rows
    ]


def compare_baselines(from_baseline, to_baseline):
    """两个基线之间的差异，形状与变更项一致，前端的 diff 组件可以直接吃。"""

    def entries_by_requirement(baseline):
        return {
            entry.requirement_id: entry
            for entry in RequirementBaselineEntry.objects.filter(
                baseline=baseline
            ).select_related("version", "version__requirement_type")
        }

    before = entries_by_requirement(from_baseline)
    after = entries_by_requirement(to_baseline)

    def describe(entry):
        """diff 渲染器要的那几个身份字段，与变更项同名同义。"""
        return {
            "requirement_type_id": str(entry.version.requirement_type_id),
            "requirement_type_name": entry.version.requirement_type.name
            if entry.version.requirement_type_id
            else "",
            "title": (entry.version.snapshot or {}).get("title") or "",
        }

    items = []
    for requirement_id, entry in after.items():
        previous = before.get(requirement_id)
        if previous is None:
            items.append(
                {
                    "id": str(entry.id),
                    "change_type": RequirementChangeType.CREATE,
                    "target_id": str(requirement_id),
                    **describe(entry),
                    "before_snapshot": None,
                    "proposed_snapshot": entry.version.snapshot,
                    "base_version": None,
                    "proposed_sort_order": entry.sort_order,
                }
            )
        elif previous.version_id != entry.version_id:
            items.append(
                {
                    "id": str(entry.id),
                    "change_type": RequirementChangeType.UPDATE,
                    "target_id": str(requirement_id),
                    **describe(entry),
                    "before_snapshot": previous.version.snapshot,
                    "proposed_snapshot": entry.version.snapshot,
                    "base_version": previous.version.version,
                    "proposed_sort_order": entry.sort_order,
                }
            )
    for requirement_id, entry in before.items():
        if requirement_id in after:
            continue
        items.append(
            {
                "id": str(entry.id),
                "change_type": RequirementChangeType.DELETE,
                "target_id": str(requirement_id),
                **describe(entry),
                "before_snapshot": entry.version.snapshot,
                "proposed_snapshot": None,
                "base_version": entry.version.version,
                "proposed_sort_order": entry.sort_order,
            }
        )
    items.sort(key=lambda item: (item["proposed_sort_order"] or 0, item["target_id"]))
    return items
