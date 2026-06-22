from rest_framework.response import Response
from rest_framework import status
from typing import Dict, Any, List
import hashlib
from django.db.models import Q, Count, QuerySet
from django.http import HttpRequest
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    Project,
    Issue,
    Cycle,
    Module,
    CycleIssue,
    ModuleIssue,
    TimeSheet,
    ProjectMember,
)
from django.db import models
from django.db.models import F, Case, When, Value
from django.db.models.functions import Concat
from plane.utils.build_chart import build_analytics_chart
from plane.utils.date_utils import (
    get_analytics_filters,
)

class ProjectAdvanceAnalyticsBaseView(BaseAPIView):
    def initialize_workspace(self, slug: str, type: str) -> None:
        self._workspace_slug = slug
        self.filters = get_analytics_filters(
            slug=slug,
            type=type,
            user=self.request.user,
            date_filter=self.request.GET.get("date_filter", None),
            project_ids=self.request.GET.get("project_ids", None),
        )


class CustomProjectAdvanceAnalyticsEndpoint(ProjectAdvanceAnalyticsBaseView):
    def get_work_items_stats(
            self, project_id, cycle_id=None, module_id=None
    ) -> Dict[str, Dict[str, int]]:
        """
        Returns work item stats for the workspace, or filtered by cycle_id or module_id if provided.
        """
        base_queryset = None
        if cycle_id is not None:
            cycle_issues = CycleIssue.objects.filter(
                **self.filters["base_filters"], cycle_id=cycle_id
            ).values_list("issue_id", flat=True)
            base_queryset = Issue.issue_objects.filter(id__in=cycle_issues)
        elif module_id is not None:
            module_issues = ModuleIssue.objects.filter(
                **self.filters["base_filters"], module_id=module_id
            ).values_list("issue_id", flat=True)
            base_queryset = Issue.issue_objects.filter(id__in=module_issues)
        else:
            base_queryset = Issue.issue_objects.filter(
                **self.filters["base_filters"], project_id=project_id
            )

        total_hours = (
            TimeSheet.objects.filter(project_id=project_id)
            .aggregate(total=models.Sum("hours"))["total"]
            or 0
        )

        # 概览健康指标基于当前作用域的全量工作项（不随 analytics_date_range 收窄），
        # 以反映项目「此刻」的真实状态。
        scope_queryset = base_queryset

        if self.filters["analytics_date_range"]:
            base_queryset = base_queryset.filter(
                created_at__gte=self.filters["analytics_date_range"]["current"]["gte"],
                created_at__lte=self.filters["analytics_date_range"]["current"]["lte"],
            )

        work_item_counts = base_queryset.aggregate(
            total_work_items=Count("id"),
            started_work_items=Count("id", filter=Q(state__group="started")),
            backlog_work_items=Count("id", filter=Q(state__group="backlog")),
            un_started_work_items=Count("id", filter=Q(state__group="unstarted")),
            completed_work_items=Count("id", filter=Q(state__group="completed")),
            cancelled_work_items=Count("id", filter=Q(state__group="cancelled")),
        )

        # 风险指标：逾期 / 临期（未来 7 天到期）的未完成工作项
        today = timezone.now().date()
        open_state = ~Q(state__group__in=["completed", "cancelled"])
        risk_counts = scope_queryset.aggregate(
            overdue_work_items=Count(
                "id",
                filter=Q(target_date__isnull=False, target_date__lt=today) & open_state,
            ),
            due_soon_work_items=Count(
                "id",
                filter=Q(
                    target_date__isnull=False,
                    target_date__gte=today,
                    target_date__lte=today + timedelta(days=7),
                )
                & open_state,
            ),
        )

        # 质量指标：缺陷总数 / 待处理缺陷（缺陷判定方式与成员统计保持一致）
        defect_filter = Q(type__category__name="缺陷")
        defect_counts = scope_queryset.aggregate(
            total_defects=Count("id", filter=defect_filter),
            pending_defects=Count("id", filter=defect_filter & open_state),
        )

        return {
            "total_work_items": {"count": work_item_counts["total_work_items"] or 0},
            "started_work_items": {"count": work_item_counts["started_work_items"] or 0},
            "backlog_work_items": {"count": work_item_counts["backlog_work_items"] or 0},
            "un_started_work_items": {"count": work_item_counts["un_started_work_items"] or 0},
            "completed_work_items": {"count": work_item_counts["completed_work_items"] or 0},
            "cancelled_work_items": {"count": work_item_counts["cancelled_work_items"] or 0},
            "total_timesheet_hours": float(total_hours),
            "overdue_work_items": risk_counts["overdue_work_items"] or 0,
            "due_soon_work_items": risk_counts["due_soon_work_items"] or 0,
            "total_defects": defect_counts["total_defects"] or 0,
            "pending_defects": defect_counts["pending_defects"] or 0,
            "created_completed_trend": self.get_created_completed_trend(scope_queryset),
        }

    def get_created_completed_trend(
            self, scope_queryset, months: int = 6
    ) -> List[Dict[str, Any]]:
        """近 N 个月「新建 vs 完成」节奏趋势。

        新建按 created_at 归月，完成按 completed_at 归月（即「当月真正完成」），
        缺失月份补 0，返回按月份升序排列的列表。
        """
        today = timezone.now().date()
        start_index = (today.year * 12 + (today.month - 1)) - (months - 1)
        month_keys = []
        for offset in range(months):
            index = start_index + offset
            month_keys.append(f"{index // 12:04d}-{index % 12 + 1:02d}")

        created_rows = (
            scope_queryset.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("month")
        )
        completed_rows = (
            scope_queryset.filter(completed_at__isnull=False)
            .annotate(month=TruncMonth("completed_at"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("month")
        )
        created_map = {
            row["month"].strftime("%Y-%m"): row["count"]
            for row in created_rows
            if row["month"]
        }
        completed_map = {
            row["month"].strftime("%Y-%m"): row["count"]
            for row in completed_rows
            if row["month"]
        }

        return [
            {
                "month": key,
                "created": created_map.get(key, 0),
                "completed": completed_map.get(key, 0),
            }
            for key in month_keys
        ]

    def get_member_stats(self, project_id: str) -> List[Dict[str, Any]]:
        members = ProjectMember.objects.filter(
            project_id=project_id,
            is_active=True,
        ).select_related("member")

        hours_by_member = {
            row["member_id"]: float(row["hours"] or 0)
            for row in TimeSheet.objects.filter(project_id=project_id)
            .values("member_id")
            .annotate(hours=models.Sum("hours"))
        }

        issue_counts_by_member = {
            row["assignees__id"]: {
                "total_count": row["total_count"] or 0,
                "defect_count": row["defect_count"] or 0,
            }
            for row in Issue.issue_objects.filter(
                project_id=project_id,
                assignees__isnull=False,
            )
            .values("assignees__id")
            .annotate(
                total_count=Count("id", distinct=True),
                defect_count=Count(
                    "id",
                    filter=Q(type__category__name="缺陷"),
                    distinct=True,
                ),
            )
        }

        result = []
        for pm in members:
            user = pm.member
            if hasattr(user, "avatar_asset") and user.avatar_asset:
                avatar_url = f"/api/assets/v2/static/{user.avatar_asset_id}/"
            else:
                avatar_url = user.avatar or ""
            member_counts = issue_counts_by_member.get(user.id, {})
            defect_count = member_counts.get("defect_count", 0)
            total_count = member_counts.get("total_count", 0)
            work_item_count = max(total_count - defect_count, 0)
            result.append({
                "member_id": str(user.id),
                "display_name": user.display_name or user.email or str(user.id),
                "avatar_url": avatar_url,
                "work_item_count": work_item_count,
                "defect_count": defect_count,
                "timesheet_hours": round(hours_by_member.get(user.id, 0), 2),
            })
        return result

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request: HttpRequest, slug: str, project_id: str) -> Response:
        self.initialize_workspace(slug, type="analytics")
        query_signature = "&".join(
            f"{key}={value}" for key, value in sorted(request.GET.items())
        )
        cache_payload = (
            f"{slug}:{project_id}:{request.user.id}:{query_signature}"
        )
        cache_key = f"project_analytics_v2:{hashlib.md5(cache_payload.encode()).hexdigest()}"
        cached_stats = cache.get(cache_key)
        if cached_stats is not None:
            return Response(cached_stats, status=status.HTTP_200_OK)

        cycle_id = request.GET.get("cycle_id", None)
        module_id = request.GET.get("module_id", None)
        stats = self.get_work_items_stats(
            cycle_id=cycle_id, module_id=module_id, project_id=project_id
        )
        stats["member_stats"] = self.get_member_stats(project_id)
        cache.set(cache_key, stats, timeout=60)
        return Response(stats, status=status.HTTP_200_OK)


class ProjectAdvanceAnalyticsStatsEndpoint(ProjectAdvanceAnalyticsBaseView):
    def get_project_issues_stats(self) -> QuerySet:
        # Get the base queryset with workspace and project filters
        base_queryset = Issue.issue_objects.filter(**self.filters["base_filters"])

        # Apply date range filter if available
        if self.filters["chart_period_range"]:
            start_date, end_date = self.filters["chart_period_range"]
            base_queryset = base_queryset.filter(
                created_at__date__gte=start_date, created_at__date__lte=end_date
            )

        return (
            base_queryset.values("project_id", "project__name")
            .annotate(
                cancelled_work_items=Count("id", filter=Q(state__group="cancelled")),
                completed_work_items=Count("id", filter=Q(state__group="completed")),
                backlog_work_items=Count("id", filter=Q(state__group="backlog")),
                un_started_work_items=Count("id", filter=Q(state__group="unstarted")),
                started_work_items=Count("id", filter=Q(state__group="started")),
            )
            .order_by("project_id")
        )

    def get_work_items_stats(
            self, project_id, cycle_id=None, module_id=None
    ) -> Dict[str, Dict[str, int]]:
        base_queryset = None
        if cycle_id is not None:
            cycle_issues = CycleIssue.objects.filter(
                **self.filters["base_filters"], cycle_id=cycle_id
            ).values_list("issue_id", flat=True)
            base_queryset = Issue.issue_objects.filter(id__in=cycle_issues)
        elif module_id is not None:
            module_issues = ModuleIssue.objects.filter(
                **self.filters["base_filters"], module_id=module_id
            ).values_list("issue_id", flat=True)
            base_queryset = Issue.issue_objects.filter(id__in=module_issues)
        else:
            base_queryset = Issue.issue_objects.filter(
                **self.filters["base_filters"], project_id=project_id
            )
        return (
            base_queryset.annotate(display_name=F("assignees__display_name"))
            .annotate(assignee_id=F("assignees__id"))
            .annotate(avatar=F("assignees__avatar"))
            .annotate(
                avatar_url=Case(
                    # If `avatar_asset` exists, use it to generate the asset URL
                    When(
                        assignees__avatar_asset__isnull=False,
                        then=Concat(
                            Value("/api/assets/v2/static/"),
                            "assignees__avatar_asset",  # Assuming avatar_asset has an id or relevant field
                            Value("/"),
                        ),
                    ),
                    # If `avatar_asset` is None, fall back to using `avatar` field directly
                    When(
                        assignees__avatar_asset__isnull=True, then="assignees__avatar"
                    ),
                    default=Value(None),
                    output_field=models.CharField(),
                )
            )
            .values("display_name", "assignee_id", "avatar_url")
            .annotate(
                cancelled_work_items=Count(
                    "id", filter=Q(state__group="cancelled"), distinct=True
                ),
                completed_work_items=Count(
                    "id", filter=Q(state__group="completed"), distinct=True
                ),
                backlog_work_items=Count(
                    "id", filter=Q(state__group="backlog"), distinct=True
                ),
                un_started_work_items=Count(
                    "id", filter=Q(state__group="unstarted"), distinct=True
                ),
                started_work_items=Count(
                    "id", filter=Q(state__group="started"), distinct=True
                ),
            )
            .order_by("display_name")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request: HttpRequest, slug: str, project_id: str) -> Response:
        self.initialize_workspace(slug, type="chart")
        type = request.GET.get("type", "work-items")

        if type == "work-items":
            # Optionally accept cycle_id or module_id as query params
            cycle_id = request.GET.get("cycle_id", None)
            module_id = request.GET.get("module_id", None)
            return Response(
                self.get_work_items_stats(
                    project_id=project_id, cycle_id=cycle_id, module_id=module_id
                ),
                status=status.HTTP_200_OK,
            )

        return Response({"message": "Invalid type"}, status=status.HTTP_400_BAD_REQUEST)


class ProjectAdvanceAnalyticsChartEndpoint(ProjectAdvanceAnalyticsBaseView):
    def work_item_completion_chart(
            self, project_id, cycle_id=None, module_id=None
    ) -> Dict[str, Any]:
        # Get the base queryset
        queryset = (
            Issue.issue_objects.filter(**self.filters["base_filters"])
            .filter(project_id=project_id)
            .select_related("workspace", "state", "parent")
            .prefetch_related(
                "assignees", "labels", "issue_module__module", "issue_cycle__cycle"
            )
        )

        if cycle_id is not None:
            cycle_issues = CycleIssue.objects.filter(
                **self.filters["base_filters"], cycle_id=cycle_id
            ).values_list("issue_id", flat=True)
            cycle = Cycle.objects.filter(id=cycle_id).first()
            if cycle and cycle.start_date:
                start_date = cycle.start_date.date()
                end_date = cycle.end_date.date()
            else:
                return {"data": [], "schema": {}}
            queryset = cycle_issues

        elif module_id is not None:
            module_issues = ModuleIssue.objects.filter(
                **self.filters["base_filters"], module_id=module_id
            ).values_list("issue_id", flat=True)
            module = Module.objects.filter(id=module_id).first()
            if module and module.start_date:
                start_date = module.start_date
                end_date = module.target_date
            else:
                return {"data": [], "schema": {}}
            queryset = module_issues

        else:
            project = Project.objects.filter(id=project_id).first()
            if project.created_at:
                start_date = project.created_at.date().replace(day=1)
            else:
                return {"data": [], "schema": {}}

        if cycle_id or module_id:
            # Get daily stats with optimized query
            daily_stats = (
                queryset.values("created_at__date")
                .annotate(
                    created_count=Count("id"),
                    completed_count=Count(
                        "id", filter=Q(issue__state__group="completed")
                    ),
                )
                .order_by("created_at__date")
            )

            # Create a dictionary of existing stats with summed counts
            stats_dict = {
                stat["created_at__date"].strftime("%Y-%m-%d"): {
                    "created_count": stat["created_count"],
                    "completed_count": stat["completed_count"],
                }
                for stat in daily_stats
            }

            # Generate data for all days in the range
            data = []
            current_date = start_date
            while current_date <= end_date:
                date_str = current_date.strftime("%Y-%m-%d")
                stats = stats_dict.get(
                    date_str, {"created_count": 0, "completed_count": 0}
                )
                data.append(
                    {
                        "key": date_str,
                        "name": date_str,
                        "count": stats["created_count"] + stats["completed_count"],
                        "completed_issues": stats["completed_count"],
                        "created_issues": stats["created_count"],
                    }
                )
                current_date += timedelta(days=1)
        else:
            # Apply date range filter if available
            if self.filters["chart_period_range"]:
                start_date, end_date = self.filters["chart_period_range"]
                queryset = queryset.filter(
                    created_at__date__gte=start_date, created_at__date__lte=end_date
                )

            # Annotate by month and count
            monthly_stats = (
                queryset.annotate(month=TruncMonth("created_at"))
                .values("month")
                .annotate(
                    created_count=Count("id"),
                    completed_count=Count("id", filter=Q(state__group="completed")),
                )
                .order_by("month")
            )

            # Create dictionary of month -> counts
            stats_dict = {
                stat["month"].strftime("%Y-%m-%d"): {
                    "created_count": stat["created_count"],
                    "completed_count": stat["completed_count"],
                }
                for stat in monthly_stats
            }

            # Generate monthly data (ensure months with 0 count are included)
            data = []
            # include the current date at the end
            end_date = timezone.now().date()
            last_month = end_date.replace(day=1)
            current_month = start_date

            while current_month <= last_month:
                date_str = current_month.strftime("%Y-%m-%d")
                stats = stats_dict.get(
                    date_str, {"created_count": 0, "completed_count": 0}
                )
                data.append(
                    {
                        "key": date_str,
                        "name": date_str,
                        "count": stats["created_count"],
                        "completed_issues": stats["completed_count"],
                        "created_issues": stats["created_count"],
                    }
                )
                # Move to next month
                if current_month.month == 12:
                    current_month = current_month.replace(
                        year=current_month.year + 1, month=1
                    )
                else:
                    current_month = current_month.replace(month=current_month.month + 1)

        schema = {
            "completed_issues": "completed_issues",
            "created_issues": "created_issues",
        }

        return {"data": data, "schema": schema}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request: HttpRequest, slug: str, project_id: str) -> Response:
        self.initialize_workspace(slug, type="chart")
        type = request.GET.get("type", "projects")
        group_by = request.GET.get("group_by", None)
        x_axis = request.GET.get("x_axis", "PRIORITY")
        cycle_id = request.GET.get("cycle_id", None)
        module_id = request.GET.get("module_id", None)

        if type == "custom-work-items":
            queryset = (
                Issue.issue_objects.filter(**self.filters["base_filters"])
                .filter(project_id=project_id)
                .select_related("workspace", "state", "parent")
                .prefetch_related(
                    "assignees", "labels", "issue_module__module", "issue_cycle__cycle"
                )
            )

            # Apply cycle/module filters if present
            if cycle_id is not None:
                cycle_issues = CycleIssue.objects.filter(
                    **self.filters["base_filters"], cycle_id=cycle_id
                ).values_list("issue_id", flat=True)
                queryset = queryset.filter(id__in=cycle_issues)

            elif module_id is not None:
                module_issues = ModuleIssue.objects.filter(
                    **self.filters["base_filters"], module_id=module_id
                ).values_list("issue_id", flat=True)
                queryset = queryset.filter(id__in=module_issues)

            # Apply date range filter if available
            if self.filters["chart_period_range"]:
                start_date, end_date = self.filters["chart_period_range"]
                queryset = queryset.filter(
                    created_at__date__gte=start_date, created_at__date__lte=end_date
                )

            return Response(
                build_analytics_chart(queryset, x_axis, group_by),
                status=status.HTTP_200_OK,
            )

        elif type == "work-items":
            # Optionally accept cycle_id or module_id as query params
            cycle_id = request.GET.get("cycle_id", None)
            module_id = request.GET.get("module_id", None)

            return Response(
                self.work_item_completion_chart(
                    project_id=project_id, cycle_id=cycle_id, module_id=module_id
                ),
                status=status.HTTP_200_OK,
            )

        return Response({"message": "Invalid type"}, status=status.HTTP_400_BAD_REQUEST)


class ProjectDefectAnalyticsEndpoint(CustomProjectAdvanceAnalyticsEndpoint):
    """缺陷专属分析端点。

    所有指标均为「缺陷」口径（type.category.name == 缺陷），用于缺陷页「概览」Tab：
    汇总 / 逾期·临期 / 状态分布 / 优先级分布 / 近6月新建vs解决趋势 / 负责人缺陷 Top。
    指标反映项目「此刻」的真实状态，不随 analytics_date_range 收窄。
    """

    DEFECT_CATEGORY_NAME = "缺陷"

    def _defect_queryset(self, project_id):
        return Issue.issue_objects.filter(
            **self.filters["base_filters"],
            project_id=project_id,
            type__category__name=self.DEFECT_CATEGORY_NAME,
        )

    def get_defect_summary(self, queryset) -> Dict[str, int]:
        today = timezone.now().date()
        open_state = ~Q(state__group__in=["completed", "cancelled"])
        agg = queryset.aggregate(
            total=Count("id"),
            pending=Count("id", filter=open_state),
            overdue=Count(
                "id",
                filter=Q(target_date__isnull=False, target_date__lt=today) & open_state,
            ),
            due_soon=Count(
                "id",
                filter=Q(
                    target_date__isnull=False,
                    target_date__gte=today,
                    target_date__lte=today + timedelta(days=7),
                )
                & open_state,
            ),
        )
        total = agg["total"] or 0
        pending = agg["pending"] or 0
        return {
            "total": total,
            "pending": pending,
            "resolved": max(total - pending, 0),
            "overdue": agg["overdue"] or 0,
            "due_soon": agg["due_soon"] or 0,
        }

    def get_status_distribution(self, queryset) -> List[Dict[str, Any]]:
        rows = queryset.values("state__group").annotate(count=Count("id"))
        counts = {row["state__group"]: row["count"] for row in rows if row["state__group"]}
        groups = ["backlog", "unstarted", "started", "completed", "cancelled"]
        return [{"group": group, "count": counts.get(group, 0)} for group in groups]

    def get_priority_distribution(self, queryset) -> List[Dict[str, Any]]:
        rows = queryset.values("priority").annotate(count=Count("id"))
        counts = {row["priority"]: row["count"] for row in rows if row["priority"]}
        priorities = ["urgent", "high", "medium", "low", "none"]
        return [{"priority": priority, "count": counts.get(priority, 0)} for priority in priorities]

    def get_defect_trend(self, queryset, months: int = 6) -> List[Dict[str, Any]]:
        # 复用父类的「新建 vs 完成」节奏，对缺陷 queryset 计算，并把 completed 语义改为 resolved。
        trend = self.get_created_completed_trend(queryset, months=months)
        return [
            {"month": point["month"], "created": point["created"], "resolved": point["completed"]}
            for point in trend
        ]

    def get_defect_member_stats(self, project_id: str) -> List[Dict[str, Any]]:
        rows = (
            Issue.issue_objects.filter(
                project_id=project_id,
                type__category__name=self.DEFECT_CATEGORY_NAME,
                assignees__isnull=False,
            )
            .values("assignees__id")
            .annotate(defect_count=Count("id", distinct=True))
        )
        defect_counts = {row["assignees__id"]: row["defect_count"] or 0 for row in rows}
        members = ProjectMember.objects.filter(
            project_id=project_id,
            is_active=True,
            member_id__in=list(defect_counts.keys()),
        ).select_related("member")

        result = []
        for pm in members:
            user = pm.member
            if hasattr(user, "avatar_asset") and user.avatar_asset:
                avatar_url = f"/api/assets/v2/static/{user.avatar_asset_id}/"
            else:
                avatar_url = user.avatar or ""
            result.append({
                "member_id": str(user.id),
                "display_name": user.display_name or user.email or str(user.id),
                "avatar_url": avatar_url,
                "defect_count": defect_counts.get(user.id, 0),
            })
        result.sort(key=lambda item: item["defect_count"], reverse=True)
        return result

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request: HttpRequest, slug: str, project_id: str) -> Response:
        self.initialize_workspace(slug, type="analytics")
        cache_payload = f"defect:{slug}:{project_id}:{request.user.id}"
        cache_key = f"project_defect_analytics_v1:{hashlib.md5(cache_payload.encode()).hexdigest()}"
        cached_stats = cache.get(cache_key)
        if cached_stats is not None:
            return Response(cached_stats, status=status.HTTP_200_OK)

        queryset = self._defect_queryset(project_id)
        stats = {
            "summary": self.get_defect_summary(queryset),
            "status_distribution": self.get_status_distribution(queryset),
            "priority_distribution": self.get_priority_distribution(queryset),
            "trend": self.get_defect_trend(queryset),
            "member_stats": self.get_defect_member_stats(project_id),
        }
        cache.set(cache_key, stats, timeout=60)
        return Response(stats, status=status.HTTP_200_OK)
