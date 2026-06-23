import io
import json
from collections import defaultdict
from datetime import timedelta, timezone as dt_timezone
from urllib.parse import quote
from uuid import UUID

from django.db.models import Prefetch
from django.http import FileResponse
from django.utils import timezone
from openpyxl import Workbook
from rest_framework import serializers
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseAPIView
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    TypeExtraFieldValue,
    User,
)


class PublicBugReportExportQuerySerializer(serializers.Serializer):
    workspace_slug = serializers.CharField(required=False, default="kfcd")
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        if start_date is None:
            start_date = timezone.localdate() - timedelta(days=7)
            attrs["start_date"] = start_date

        end_date = attrs.get("end_date")
        if end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "结束日期不能早于开始日期。"})
        return attrs


class PublicBugReportExportAPIView(BaseAPIView):
    """
    公开缺陷导出接口（无需鉴权）：
    按 workspace + 时间范围导出缺陷报告为 Excel。
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    bug_type_names = ("缺陷", "缺陷(软件)")
    STATE_TRACE_FROM_ASSIGNEE = ("Closed", "Pending-Reject")
    TRACE_ACTIVITY_FIELDS = ("state", "assignees")
    TECH_REASON_FIELD_NAME = "技术原因及解决方案"
    export_columns = [
        "序号",
        "ID",
        "标题",
        "技术原因及解决方案",
        "项目",
        "创建时间",
        "当前负责人",
        "创建人",
        "产品类型",
        "状态",
        "地址",
        "缺陷级别",
    ]
    export_widths = {
        "标题": 40,
        "技术原因及解决方案": 80,
        "项目": 30,
        "创建时间": 20,
        "当前负责人": 20,
        "创建人": 16,
        "产品类型": 16,
        "状态": 15,
        "ID": 20,
        "地址": 60,
    }

    @staticmethod
    def _to_utc8_string(dt_value):
        if not dt_value:
            return ""

        if timezone.is_naive(dt_value):
            dt_value = timezone.make_aware(dt_value, dt_timezone.utc)

        utc8_tz = dt_timezone(timedelta(hours=8))
        return dt_value.astimezone(utc8_tz).strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _resolve_user_name(user):
        if not user:
            return ""

        display_name = (getattr(user, "display_name", "") or "").strip()
        if display_name:
            return display_name

        email = (getattr(user, "email", "") or "").strip()
        if "@" in email:
            return email.split("@")[0]
        return email

    @staticmethod
    def _build_issue_url(request, issue):
        workspace_slug = issue.workspace.slug if issue.workspace_id and issue.workspace else ""
        project_identifier = issue.project.identifier if issue.project_id and issue.project else ""
        return request.build_absolute_uri(
            f"/{workspace_slug}/browse/{project_identifier}-{issue.sequence_id}/"
        )

    @staticmethod
    def _build_issue_key(issue):
        if issue.project_id and issue.project and issue.sequence_id:
            return f"{issue.project.identifier}-{issue.sequence_id}"
        return str(issue.id)

    @staticmethod
    def _stringify_extra_field_value(raw_value):
        if raw_value is None:
            return ""

        if isinstance(raw_value, list):
            return ",".join(str(item) for item in raw_value if item not in (None, ""))

        if isinstance(raw_value, dict):
            return json.dumps(raw_value, ensure_ascii=False)

        return str(raw_value)

    def _get_tech_reason(self, issue):
        for item in getattr(issue, "tech_reason_values", []):
            value = self._stringify_extra_field_value(item.value)
            if value:
                return value
        return ""

    @staticmethod
    def _normalize_identifier(raw_identifier):
        if raw_identifier is None:
            return ""

        identifier = str(raw_identifier).strip()
        if not identifier:
            return ""

        try:
            return str(UUID(identifier))
        except (ValueError, TypeError, AttributeError):
            return ""

    def _parse_assignee_snapshot_ids(self, raw_snapshot):
        if not raw_snapshot:
            return []

        values = str(raw_snapshot).split(",")
        assignee_ids = []
        seen = set()

        for value in values:
            normalized_id = self._normalize_identifier(value)
            if not normalized_id or normalized_id in seen:
                continue

            assignee_ids.append(normalized_id)
            seen.add(normalized_id)

        return assignee_ids

    def _reconstruct_assignee_before_state(self, issue_activities, target_state_name):
        transition_at = None
        for activity in reversed(issue_activities):
            if activity.get("field") != "state":
                continue

            state_name = (activity.get("new_value") or "").strip()
            if state_name == target_state_name:
                transition_at = activity.get("created_at")
                break

        if transition_at is None:
            return None

        assignee_ids = []
        for activity in issue_activities:
            if activity.get("field") != "assignees":
                continue

            activity_time = activity.get("created_at")
            if activity_time is None or activity_time >= transition_at:
                continue

            old_identifier = self._normalize_identifier(activity.get("old_identifier"))
            new_identifier = self._normalize_identifier(activity.get("new_identifier"))

            # 工作流审批通过后的负责人活动是“整体快照替换”，仅在 new_value 里存 id 串
            if not old_identifier and not new_identifier:
                assignee_ids = self._parse_assignee_snapshot_ids(activity.get("new_value"))
                continue

            if new_identifier and new_identifier not in assignee_ids:
                assignee_ids.append(new_identifier)

            if old_identifier and old_identifier in assignee_ids:
                assignee_ids.remove(old_identifier)

        return assignee_ids

    @staticmethod
    def _get_current_assignee_names(issue):
        assignee_names = []
        for link in getattr(issue, "active_issue_assignees", []):
            assignee = getattr(link, "assignee", None)
            if not assignee:
                continue

            display_name = (getattr(assignee, "display_name", "") or "").strip()
            if display_name:
                assignee_names.append(display_name)
                continue

            email = (getattr(assignee, "email", "") or "").strip()
            if "@" in email:
                assignee_names.append(email.split("@")[0])
            elif email:
                assignee_names.append(email)

        return [name for name in assignee_names if name]

    def _prepare_state_assignee_context(self, issues):
        trace_issues = [
            issue
            for issue in issues
            if issue.state_id
            and issue.state
            and issue.state.name in self.STATE_TRACE_FROM_ASSIGNEE
        ]
        if not trace_issues:
            return {}, {}

        activities = (
            IssueActivity.objects.filter(
                issue_id__in=[issue.id for issue in trace_issues],
                field__in=self.TRACE_ACTIVITY_FIELDS,
                deleted_at__isnull=True,
            )
            .values(
                "issue_id",
                "field",
                "old_value",
                "new_value",
                "old_identifier",
                "new_identifier",
                "created_at",
            )
            .order_by("created_at", "id")
        )

        activity_map = defaultdict(list)
        for activity in activities:
            activity_map[str(activity["issue_id"])].append(activity)

        history_assignee_ids_map = {}
        all_history_assignee_ids = set()
        for issue in trace_issues:
            issue_id = str(issue.id)
            assignee_ids = self._reconstruct_assignee_before_state(
                issue_activities=activity_map.get(issue_id, []),
                target_state_name=issue.state.name,
            )
            history_assignee_ids_map[issue_id] = assignee_ids
            if assignee_ids:
                all_history_assignee_ids.update(assignee_ids)

        history_assignee_name_map = {}
        if all_history_assignee_ids:
            users = User.objects.filter(id__in=all_history_assignee_ids).only(
                "id", "display_name", "email"
            )
            history_assignee_name_map = {
                str(user.id): self._resolve_user_name(user) for user in users
            }

        return history_assignee_ids_map, history_assignee_name_map

    def _get_queryset(self, workspace_slug, start_date, end_date):
        queryset = (
            Issue.objects.filter(
                deleted_at__isnull=True,
                type__name__in=self.bug_type_names,
                workspace__slug=workspace_slug,
                created_at__date__gte=start_date,
            )
            .select_related("workspace", "project", "state", "created_by")
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("assignee"),
                    to_attr="active_issue_assignees",
                ),
                Prefetch(
                    "type_extra_field_values",
                    queryset=TypeExtraFieldValue.objects.filter(
                        deleted_at__isnull=True,
                        extra_field__name=self.TECH_REASON_FIELD_NAME,
                    )
                    .select_related("extra_field")
                    .order_by("-created_at"),
                    to_attr="tech_reason_values",
                ),
            )
            .order_by("-created_at")
        )

        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)

        return queryset

    def _serialize_issue_rows(
        self,
        request,
        issues,
        history_assignee_ids_map=None,
        history_assignee_name_map=None,
    ):
        history_assignee_ids_map = history_assignee_ids_map or {}
        history_assignee_name_map = history_assignee_name_map or {}
        rows = []
        for index, issue in enumerate(issues, start=1):
            assignees = self._get_current_assignee_names(issue)

            issue_state_name = issue.state.name if issue.state_id and issue.state else ""
            if issue_state_name in self.STATE_TRACE_FROM_ASSIGNEE:
                issue_id = str(issue.id)
                history_assignee_ids = history_assignee_ids_map.get(issue_id)
                if history_assignee_ids is not None:
                    assignees = [
                        history_assignee_name_map.get(assignee_id, "")
                        for assignee_id in history_assignee_ids
                    ]
                    assignees = [name for name in assignees if name]

            rows.append(
                {
                    "序号": index,
                    "ID": self._build_issue_key(issue),
                    "标题": issue.name or "",
                    "技术原因及解决方案": self._get_tech_reason(issue),
                    "项目": issue.project.name if issue.project_id else "",
                    "创建时间": self._to_utc8_string(issue.created_at),
                    "当前负责人": ",".join(assignees),
                    "创建人": self._resolve_user_name(getattr(issue, "created_by", None)),
                    "产品类型": issue.project.product_type if issue.project_id else "",
                    "状态": issue.state.name if issue.state_id else "",
                    "地址": self._build_issue_url(request, issue),
                    "缺陷级别": issue.priority or "",
                }
            )
        return rows

    def _build_workbook(self, rows):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "缺陷报告"

        worksheet.append(self.export_columns)

        for row in rows:
            worksheet.append([row.get(column, "") for column in self.export_columns])

        for col_idx, header in enumerate(self.export_columns, start=1):
            width = self.export_widths.get(header)
            if width is None:
                max_length = max(
                    len(str(worksheet.cell(row=row_idx, column=col_idx).value or ""))
                    for row_idx in range(1, worksheet.max_row + 1)
                )
                width = min(max(max_length + 2, 10), 50)

            column_letter = worksheet.cell(row=1, column=col_idx).column_letter
            worksheet.column_dimensions[column_letter].width = width

        return workbook

    @staticmethod
    def _build_excel_response(workbook):
        output = io.BytesIO()
        workbook.save(output)
        output.seek(0)

        filename = f"缺陷报告-{timezone.now().strftime('%Y%m%d%H%M%S')}.xlsx"
        response = FileResponse(
            output,
            as_attachment=True,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = (
            f"attachment; filename*=UTF-8''{quote(filename)}"
        )
        return response

    def get(self, request):
        serializer = PublicBugReportExportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        query_params = serializer.validated_data

        issues = list(
            self._get_queryset(
                workspace_slug=query_params["workspace_slug"],
                start_date=query_params["start_date"],
                end_date=query_params.get("end_date"),
            )
        )
        history_assignee_ids_map, history_assignee_name_map = (
            self._prepare_state_assignee_context(issues)
        )
        rows = self._serialize_issue_rows(
            request,
            issues,
            history_assignee_ids_map=history_assignee_ids_map,
            history_assignee_name_map=history_assignee_name_map,
        )
        workbook = self._build_workbook(rows)

        return self._build_excel_response(workbook)
