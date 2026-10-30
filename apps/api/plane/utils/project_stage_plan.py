"""阶段页「规划」视图的只读数据：项目里的迭代和工作项，只取画甘特要的几列。

阶段本身走阶段列表接口，这里不重复返回。归属规则（工作项跟所在迭代显示、不在迭代里的按自己的
阶段显示）在前端组树时决定，这里只把两边各自的 ``stage_id`` 原样带出去。

- 迭代：未归档、未删除。起止是带时区的时间，按项目时区折成日期，免得东八区的 0 点被显示成前一天。
- 工作项：``Issue.issue_objects``（去掉草稿、归档、分诊）；``cycle_id`` 只认未归档的迭代，
  归档迭代里的工作项按「不在迭代中」处理。访客且项目没开「访客可见全部」时只给自己创建的，
  与工作项列表同一口径。
"""

import pytz
from django.db.models import OuterRef, Subquery

from plane.db.models import Cycle, CycleIssue, Issue, IssueAssignee, ProjectMember

GUEST_ROLE = 5


def _local_date(value, tz):
    if value is None:
        return None
    return value.astimezone(tz).date().isoformat()


def _is_restricted_guest(project, user):
    if project.guest_view_all_features:
        return False
    return ProjectMember.objects.filter(
        project_id=project.id, member=user, role=GUEST_ROLE, is_active=True
    ).exists()


def build_plan_data(project, user):
    try:
        tz = pytz.timezone(project.timezone or "UTC")
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC

    cycles = [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "start_date": _local_date(row["start_date"], tz),
            "end_date": _local_date(row["end_date"], tz),
            "test_handoff_date": _local_date(row["test_handoff_date"], tz),
            "stage_id": str(row["stage_id"]) if row["stage_id"] else None,
            "owned_by_id": str(row["owned_by_id"]) if row["owned_by_id"] else None,
        }
        for row in Cycle.objects.filter(
            project_id=project.id,
            workspace_id=project.workspace_id,
            archived_at__isnull=True,
            deleted_at__isnull=True,
        )
        .order_by("start_date", "sort_order", "created_at")
        .values("id", "name", "start_date", "end_date", "test_handoff_date", "stage_id", "owned_by_id")
    ]

    active_cycle = (
        CycleIssue.objects.filter(
            issue_id=OuterRef("pk"),
            deleted_at__isnull=True,
            cycle__archived_at__isnull=True,
            cycle__deleted_at__isnull=True,
        )
        .order_by("-created_at")
        .values("cycle_id")[:1]
    )
    issue_queryset = Issue.issue_objects.filter(
        project_id=project.id, workspace_id=project.workspace_id
    )
    if _is_restricted_guest(project, user):
        issue_queryset = issue_queryset.filter(created_by=user)
    issue_rows = list(
        issue_queryset.annotate(cycle_id=Subquery(active_cycle))
        .order_by("sequence_id")
        .values(
            "id",
            "name",
            "sequence_id",
            "stage_id",
            "cycle_id",
            "start_date",
            "target_date",
            "state__group",
        )
    )

    # 负责人按指定先后；单独查一次，比在主查询上 ArrayAgg 再分组便宜
    assignees = {}
    for issue_id, assignee_id in (
        IssueAssignee.objects.filter(project_id=project.id, deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("issue_id", "assignee_id")
    ):
        assignees.setdefault(issue_id, []).append(str(assignee_id))

    issues = [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "sequence_id": row["sequence_id"],
            "stage_id": str(row["stage_id"]) if row["stage_id"] else None,
            "cycle_id": str(row["cycle_id"]) if row["cycle_id"] else None,
            "start_date": row["start_date"].isoformat() if row["start_date"] else None,
            "target_date": row["target_date"].isoformat() if row["target_date"] else None,
            "state_group": row["state__group"],
            "assignee_ids": assignees.get(row["id"], []),
        }
        for row in issue_rows
    ]

    return {"cycles": cycles, "issues": issues}
