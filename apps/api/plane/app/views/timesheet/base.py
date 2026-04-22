from datetime import timedelta

from django.db import IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.serializers.timesheet import (
    TimeSheetCopyPreviousWeekSerializer,
    TimeSheetSerializer,
    TimesheetCategorySerializer,
)
from plane.app.views import BaseViewSet
from plane.app.views.base import BaseAPIView
from plane.db.models import TimeSheet, TimesheetCategory


class TimeSheetViewSet(BaseViewSet):
    duplicate_error = {
        "non_field_errors": [
            "同一成员在同一项目/任务的同一时间段已存在工时记录，请勿重复登记。"
        ]
    }

    model = TimeSheet
    serializer_class = TimeSheetSerializer
    filterset_fields = {
        "issue_id": ["exact"],
        "test_case_id": ["exact"],
        "member_id": ["exact"],
        "date": ["exact", "gte", "lte"],
        "category_id": ["exact"],
        "category__key": ["exact"],
    }

    def _format_validation_error(self, error: DjangoValidationError):
        if hasattr(error, "message_dict"):
            return error.message_dict
        if hasattr(error, "messages"):
            return error.messages
        return {"non_field_errors": [str(error)]}

    def get_queryset(self):
        qs = TimeSheet.objects.filter(
            project__workspace__slug=self.kwargs.get("slug"),
        ).select_related("member", "project", "issue", "test_case", "category")

        project_id = self.kwargs.get("project_id")
        if project_id:
            qs = qs.filter(project_id=project_id)

        return qs.order_by("-date", "-start_time")

    def list(self, request, slug, project_id=None):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = TimeSheetSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id):
        serializer = TimeSheetSerializer(
            data={
                **request.data,
                "member": str(request.user.id),
                "project": str(project_id),
            }
        )
        if serializer.is_valid():
            try:
                serializer.save()
            except DjangoValidationError as exc:
                return Response(
                    self._format_validation_error(exc),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except IntegrityError:
                return Response(
                    self.duplicate_error, status=status.HTTP_400_BAD_REQUEST
                )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id, pk):
        instance = self.get_object()
        serializer = TimeSheetSerializer(instance, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                serializer.save()
            except DjangoValidationError as exc:
                return Response(
                    self._format_validation_error(exc),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except IntegrityError:
                return Response(
                    self.duplicate_error, status=status.HTTP_400_BAD_REQUEST
                )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, pk):
        instance = self.get_object()
        instance.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _copy_previous_week_timesheets(self, request, target_week_start):
        source_week_start = target_week_start - timedelta(days=7)
        source_week_end = source_week_start + timedelta(days=6)

        source_timesheets = list(
            self.get_queryset()
            .filter(
                member=request.user,
                date__gte=source_week_start,
                date__lte=source_week_end,
            )
            .order_by("date", "start_time", "id")
        )

        created_timesheets = []
        skipped_count = 0

        for source in source_timesheets:
            target_date = source.date + timedelta(days=7)
            copied_timesheet = TimeSheet(
                member=request.user,
                project=source.project,
                issue=source.issue,
                test_case=source.test_case,
                category=source.category,
                date=target_date,
                start_time=source.start_time,
                end_time=source.end_time,
                hours=source.hours,
                description=source.description,
                created_by=request.user,
                updated_by=request.user,
            )

            try:
                copied_timesheet.save()
            except (DjangoValidationError, IntegrityError):
                skipped_count += 1
                continue

            created_timesheets.append(copied_timesheet)

        return {
            "week_start": target_week_start,
            "source_week_start": source_week_start,
            "source_count": len(source_timesheets),
            "created_count": len(created_timesheets),
            "skipped_count": skipped_count,
            "timesheets": TimeSheetSerializer(created_timesheets, many=True).data,
        }

    @action(detail=False, methods=["post"], url_path="copy-previous-week")
    def copy_previous_week(self, request, slug, project_id=None):
        serializer = TimeSheetCopyPreviousWeekSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = self._copy_previous_week_timesheets(
            request=request,
            target_week_start=serializer.validated_data["week_start"],
        )
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="workspace-list")
    def workspace_list(self, request, slug, project_id=None):
        """工作区级别工时列表，不限定 project_id（供工作区级工时页面使用）"""
        queryset = self.filter_queryset(self.get_queryset())
        serializer = TimeSheetSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="workspace-copy-previous-week")
    def workspace_copy_previous_week(self, request, slug, project_id=None):
        """工作区级别复制上一周工时，不限定 project_id"""
        serializer = TimeSheetCopyPreviousWeekSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = self._copy_previous_week_timesheets(
            request=request,
            target_week_start=serializer.validated_data["week_start"],
        )
        return Response(payload, status=status.HTTP_200_OK)


class TimesheetCategoryListView(BaseAPIView):
    """工时类别字典下发接口（全局只读）。

    前端用来渲染填报弹窗左侧的类别菜单。当前仅下发 is_active 的记录。
    """

    def get(self, request):
        categories = TimesheetCategory.objects.filter(is_active=True).order_by(
            "sort_order", "key"
        )
        serializer = TimesheetCategorySerializer(categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
