# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
「添加工作项」弹窗（迭代 / 发布 / 模块）的表格数据：排序 + 按页组装行。

搜索接口带 paginated=true 时走这里，返回 {results, total_count}；不带时仍是旧的列表响应。
"""

# Django imports
from django.db.models import Case, F, IntegerField, QuerySet, Value, When

# Module imports
from plane.db.models import CycleIssue, Issue, IssueAssignee, ReleaseIssue, ReleaseStatus

PRIORITY_RANK = {"urgent": 4, "high": 3, "medium": 2, "low": 1, "none": 0}

ORDER_FIELDS = {"priority", "sequence_id", "target_date", "created_at", "updated_at"}

ROW_FIELDS = (
    "id",
    "name",
    "sequence_id",
    "project_id",
    "project__identifier",
    "project__name",
    "workspace__slug",
    "type_id",
    "state_id",
    "state__name",
    "state__group",
    "state__color",
    "priority",
    "start_date",
    "target_date",
    "created_at",
    "updated_at",
)


def order_picker_issues(issues: QuerySet, order_by: str, order: str) -> QuerySet:
    """
    order_by 不在白名单时按创建时间倒序（与旧接口一致）。
    优先级 desc = 紧急在前；日期为空的始终排在最后。
    """
    if order_by not in ORDER_FIELDS:
        order_by, order = "created_at", "desc"
    descending = order != "asc"

    if order_by == "priority":
        issues = issues.annotate(
            priority_rank=Case(
                *[When(priority=key, then=Value(rank)) for key, rank in PRIORITY_RANK.items()],
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        primary = F("priority_rank").desc() if descending else F("priority_rank").asc()
    elif order_by == "target_date":
        primary = F("target_date").desc(nulls_last=True) if descending else F("target_date").asc(nulls_last=True)
    else:
        primary = F(order_by).desc() if descending else F(order_by).asc()

    return issues.order_by(primary, "-created_at", "id")


def build_picker_rows(issue_ids: list) -> list:
    """按 issue_ids 的顺序返回行，附负责人、所在迭代、所在发布。"""
    if not issue_ids:
        return []

    rows = {row["id"]: row for row in Issue.issue_objects.filter(id__in=issue_ids).values(*ROW_FIELDS)}

    assignees = {}
    for issue_id, assignee_id in IssueAssignee.objects.filter(
        issue_id__in=issue_ids, assignee__is_active=True
    ).values_list("issue_id", "assignee_id"):
        assignees.setdefault(issue_id, []).append(assignee_id)

    # 一个工作项只会挂在一个迭代上（加入新迭代会改挂）
    cycles = {
        item["issue_id"]: {"id": item["cycle_id"], "name": item["cycle__name"], "status": item["cycle__status"]}
        for item in CycleIssue.objects.filter(issue_id__in=issue_ids, cycle__deleted_at__isnull=True).values(
            "issue_id", "cycle_id", "cycle__name", "cycle__status"
        )
    }

    # 发布可以多个
    releases = {}
    for item in (
        ReleaseIssue.objects.filter(issue_id__in=issue_ids, release__deleted_at__isnull=True)
        .order_by("release__created_at")
        .values("issue_id", "release_id", "release__name", "release__status")
    ):
        status_key = item["release__status"]
        releases.setdefault(item["issue_id"], []).append(
            {
                "id": item["release_id"],
                "name": item["release__name"],
                "status": ReleaseStatus(status_key).label if status_key in ReleaseStatus.values else status_key,
            }
        )

    result = []
    for issue_id in issue_ids:
        row = rows.get(issue_id)
        if row is None:
            continue
        row["assignee_ids"] = assignees.get(issue_id, [])
        row["cycle"] = cycles.get(issue_id)
        row["releases"] = releases.get(issue_id, [])
        result.append(row)
    return result
