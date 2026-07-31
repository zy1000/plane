# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone

from plane.db.models import (
    CaseReviewRecord,
    CaseReviewThrough,
    Cycle,
    Issue,
    IssueTransitionRecord,
    PlanCase,
    ProjectMember,
    Release,
    ReleaseStatus,
    TransitionRecordStatus,
)


CLOSED_ISSUE_STATE_GROUPS = ("completed", "cancelled")
CLOSED_CYCLE_STATUSES = (Cycle.Status.COMPLETED, Cycle.Status.CANCELLED, "completed", "cancelled")
CLOSED_RELEASE_STATUSES = (ReleaseStatus.COMPLETED, ReleaseStatus.CANCELLED)
DEFECT_TYPE_CATEGORY_NAME = "缺陷"


PROFILE_METRIC_KEYS = frozenset(
    {
        "today_pending_issues",
        "week_pending_issues",
        "overdue_issues",
        "unscheduled_pending_issues",
        "pending_approval_issues",
        "pending_execution_cases",
        "pending_review_cases",
        "responsible_cycles",
        "responsible_releases",
        "assigned_issues",
        "created_issues",
        "subscribed_issues",
        "open_assigned_issues",
        "open_created_issues",
        "open_subscribed_issues",
        "open_defect_issues",
        "open_assigned_non_defect_issues",
    }
)

ISSUE_PROFILE_METRICS = frozenset(
    {
        "today_pending_issues",
        "week_pending_issues",
        "overdue_issues",
        "unscheduled_pending_issues",
        "pending_approval_issues",
        "assigned_issues",
        "created_issues",
        "subscribed_issues",
        "open_assigned_issues",
        "open_created_issues",
        "open_subscribed_issues",
        "open_defect_issues",
        "open_assigned_non_defect_issues",
    }
)


def _accessible_project_ids(slug, viewer):
    return ProjectMember.objects.filter(
        workspace__slug=slug,
        member=viewer,
        is_active=True,
        deleted_at__isnull=True,
        project__archived_at__isnull=True,
        project__deleted_at__isnull=True,
    ).values("project_id")


def _base_issue_queryset(slug, viewer):
    return Issue.issue_objects.filter(
        workspace__slug=slug,
        project_id__in=_accessible_project_ids(slug, viewer),
    )


def _open_issue_queryset(queryset):
    return queryset.exclude(state__group__in=CLOSED_ISSUE_STATE_GROUPS)


def get_profile_metric_queryset(metric, slug, user_id, viewer):
    if metric not in PROFILE_METRIC_KEYS:
        raise ValueError("Unsupported profile metric")

    today = timezone.now().date()
    week_end = today + timedelta(days=6 - today.weekday())
    accessible_project_ids = _accessible_project_ids(slug, viewer)

    if metric in ISSUE_PROFILE_METRICS:
        queryset = _base_issue_queryset(slug, viewer)

        if metric in {"created_issues", "open_created_issues"}:
            queryset = queryset.filter(created_by_id=user_id)
            if metric == "open_created_issues":
                queryset = _open_issue_queryset(queryset)
            return queryset.select_related("project", "state")

        if metric in {"subscribed_issues", "open_subscribed_issues"}:
            queryset = queryset.filter(
                issue_subscribers__subscriber_id=user_id,
                issue_subscribers__deleted_at__isnull=True,
            )
            if metric == "open_subscribed_issues":
                queryset = _open_issue_queryset(queryset)
            return queryset.select_related("project", "state").distinct()

        if metric == "pending_approval_issues":
            pending_transition = IssueTransitionRecord.objects.filter(
                issue_id=OuterRef("pk"),
                status=TransitionRecordStatus.PENDING,
                approval_records__approver_id=user_id,
                approval_records__action__isnull=True,
                approval_records__deleted_at__isnull=True,
            ).order_by("-created_at")
            return (
                queryset.filter(
                    transition_records__status=TransitionRecordStatus.PENDING,
                    transition_records__deleted_at__isnull=True,
                    transition_records__approval_records__approver_id=user_id,
                    transition_records__approval_records__action__isnull=True,
                    transition_records__approval_records__deleted_at__isnull=True,
                )
                .annotate(
                    approval_to_state_id=Subquery(pending_transition.values("to_state_id")[:1]),
                    approval_to_state_name=Subquery(pending_transition.values("to_state__name")[:1]),
                    approval_to_state_color=Subquery(pending_transition.values("to_state__color")[:1]),
                )
                .select_related("project", "state")
                .distinct()
            )

        queryset = queryset.filter(
            issue_assignee__assignee_id=user_id,
            issue_assignee__deleted_at__isnull=True,
        )
        if metric == "assigned_issues":
            return queryset.select_related("project", "state").distinct()

        queryset = _open_issue_queryset(queryset)
        if metric == "open_assigned_issues":
            return queryset.select_related("project", "state").distinct()

        if metric == "open_defect_issues":
            return queryset.filter(type__category__name=DEFECT_TYPE_CATEGORY_NAME).select_related(
                "project", "state"
            ).distinct()

        if metric == "open_assigned_non_defect_issues":
            return queryset.exclude(type__category__name=DEFECT_TYPE_CATEGORY_NAME).select_related(
                "project", "state"
            ).distinct()

        if metric == "today_pending_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lte=today)
        elif metric == "week_pending_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lte=week_end)
        elif metric == "overdue_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lt=today)
        elif metric == "unscheduled_pending_issues":
            queryset = queryset.filter(target_date__isnull=True)

        return queryset.select_related("project", "state").distinct()

    if metric == "responsible_cycles":
        return (
            Cycle.objects.filter(
                Q(created_by_id=user_id) | Q(owned_by_id=user_id),
                workspace__slug=slug,
                project_id__in=accessible_project_ids,
                archived_at__isnull=True,
            )
            .exclude(status__in=CLOSED_CYCLE_STATUSES)
            .select_related("project", "owned_by")
            .distinct()
        )

    if metric == "responsible_releases":
        return (
            Release.objects.filter(
                Q(created_by_id=user_id) | Q(lead_id=user_id),
                workspace__slug=slug,
                project_id__in=accessible_project_ids,
                archived_at__isnull=True,
            )
            .exclude(status__in=CLOSED_RELEASE_STATUSES)
            .select_related("project", "lead")
            .distinct()
        )

    if metric == "pending_execution_cases":
        return (
            PlanCase.objects.filter(
                assignee_id=user_id,
                result=PlanCase.Result.NOT_START,
                case__deleted_at__isnull=True,
                case__repository__deleted_at__isnull=True,
                plan__deleted_at__isnull=True,
                plan__project__workspace__slug=slug,
                plan__project_id__in=accessible_project_ids,
            )
            .select_related("case", "plan", "plan__project", "assignee")
            .distinct()
        )

    latest_review_result = (
        CaseReviewRecord.objects.filter(
            crt_id=OuterRef("pk"),
            assignee_id=user_id,
        )
        .exclude(result=CaseReviewRecord.Result.SUGGEST)
        .order_by("-created_at")
    )
    return (
        CaseReviewThrough.objects.filter(
            review__assignees__id=user_id,
            case__deleted_at__isnull=True,
            case__repository__deleted_at__isnull=True,
            review__deleted_at__isnull=True,
            review__project__workspace__slug=slug,
            review__project_id__in=accessible_project_ids,
        )
        .annotate(
            personal_review_status=Subquery(latest_review_result.values("result")[:1])
        )
        .filter(
            Q(personal_review_status__isnull=True)
            | Q(personal_review_status=CaseReviewRecord.Result.RE_REVIEW)
        )
        .select_related("case", "review", "review__project")
        .distinct()
    )


def apply_profile_metric_filters(queryset, metric, project_id=None, plan_id=None, review_id=None):
    if metric == "pending_execution_cases":
        if project_id:
            queryset = queryset.filter(plan__project_id=project_id)
        if plan_id:
            queryset = queryset.filter(plan_id=plan_id)
        return queryset

    if metric == "pending_review_cases":
        if project_id:
            queryset = queryset.filter(review__project_id=project_id)
        if review_id:
            queryset = queryset.filter(review_id=review_id)
        return queryset

    if project_id:
        queryset = queryset.filter(project_id=project_id)
    return queryset


def build_profile_metric_tree(queryset, metric):
    if metric == "pending_execution_cases":
        project_fields = ("plan__project_id", "plan__project__name")
        child_fields = ("plan_id", "plan__name")
        child_type = "plan"
    elif metric == "pending_review_cases":
        project_fields = ("review__project_id", "review__project__name")
        child_fields = ("review_id", "review__name")
        child_type = "review"
    else:
        project_fields = ("project_id", "project__name")
        child_fields = None
        child_type = None

    project_rows = queryset.order_by().values(*project_fields).annotate(count=Count("id", distinct=True))
    children_by_project = {}
    if child_fields:
        child_rows = (
            queryset.order_by()
            .values(*project_fields, *child_fields)
            .annotate(count=Count("id", distinct=True))
        )
        for row in child_rows:
            project_id = str(row[project_fields[0]])
            children_by_project.setdefault(project_id, []).append(
                {
                    "id": str(row[child_fields[0]]),
                    "type": child_type,
                    "name": row[child_fields[1]],
                    "count": row["count"],
                    "project_id": project_id,
                }
            )

    nodes = []
    for row in project_rows:
        project_id = str(row[project_fields[0]])
        node = {
            "id": project_id,
            "type": "project",
            "name": row[project_fields[1]],
            "count": row["count"],
            "project_id": project_id,
        }
        if child_fields:
            node["children"] = sorted(children_by_project.get(project_id, []), key=lambda item: item["name"])
        nodes.append(node)

    return sorted(nodes, key=lambda item: item["name"])
