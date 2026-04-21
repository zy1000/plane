# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import datetime

from rest_framework import serializers

from plane.db.models import Issue, Project, TestCase, TimeSheet, TimesheetCategory
from plane.db.models.timesheet import (
    CATEGORY_KEYS_REQUIRE_ISSUE,
    CATEGORY_KEYS_REQUIRE_TEST_CASE,
    TIMESHEET_CATEGORY_PROJECT,
    TIMESHEET_CATEGORY_TEST_CASE,
    resolve_issue_category_key,
)

from .base import BaseSerializer
from .user import UserLiteSerializer

MIDNIGHT_END_SENTINEL = datetime.time(23, 59, 0)


class EndTimeField(serializers.TimeField):
    """Accept '24:00' / '24:00:00' as end-of-day, stored as 23:59:00."""

    def to_internal_value(self, value):
        if isinstance(value, str) and value.strip() in ("24:00", "24:00:00"):
            return MIDNIGHT_END_SENTINEL
        return super().to_internal_value(value)

    def to_representation(self, value):
        if value == MIDNIGHT_END_SENTINEL:
            return "24:00:00"
        return super().to_representation(value)


class IssueLiteSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    sequence_id = serializers.IntegerField(read_only=True)
    type_id = serializers.UUIDField(read_only=True, allow_null=True)
    type_name = serializers.CharField(read_only=True, source="type.name", allow_null=True)


class TestCaseLiteSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)


class TimesheetCategorySerializer(BaseSerializer):
    class Meta:
        model = TimesheetCategory
        fields = [
            "id",
            "key",
            "name",
            "description",
            "sort_order",
            "is_active",
            "is_system",
        ]
        read_only_fields = fields


class TimeSheetSerializer(BaseSerializer):
    member_detail = UserLiteSerializer(source="member", read_only=True)
    end_time = EndTimeField()
    # project 由视图层从 URL project_id 注入，调用方通常无需手动传入
    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all()
    )
    issue = serializers.PrimaryKeyRelatedField(
        queryset=Issue.objects.all(),
        required=False,
        allow_null=True,
    )
    test_case = serializers.PrimaryKeyRelatedField(
        queryset=TestCase.objects.all(),
        required=False,
        allow_null=True,
    )
    # category 可选：前端新版本传入 id；旧客户端不传时由 create() 按 issue/test_case 兜底推断。
    category = serializers.PrimaryKeyRelatedField(
        queryset=TimesheetCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    issue_detail = IssueLiteSerializer(source="issue", read_only=True)
    test_case_detail = TestCaseLiteSerializer(source="test_case", read_only=True)
    category_detail = TimesheetCategorySerializer(source="category", read_only=True)

    class Meta:
        model = TimeSheet
        fields = [
            "id",
            "member",
            "member_detail",
            "date",
            "start_time",
            "end_time",
            "hours",
            "description",
            "project",
            "issue",
            "issue_detail",
            "test_case",
            "test_case_detail",
            "category",
            "category_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "member_detail",
            "issue_detail",
            "test_case_detail",
            "category_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        # 避免 DRF 根据模型 UniqueConstraint 自动生成 UniqueTogetherValidator，
        # 否则会把 issue/test_case 重新视为必填字段。
        validators = []

    def _resolve_fallback_category_key(self, attrs, instance=None):
        """当前端未传 category 时，按 issue / test_case 兜底推断类别 key。

        工作项工时会进一步按 issue.type.name 路由到 REQUIREMENT / TASK / BUG；
        无法识别的类型名保持为 ISSUE，保证老数据/新类型始终有落点。
        """
        issue = attrs.get("issue", getattr(instance, "issue", None))
        test_case = attrs.get("test_case", getattr(instance, "test_case", None))
        if test_case is not None:
            return TIMESHEET_CATEGORY_TEST_CASE
        if issue is not None:
            return resolve_issue_category_key(issue)
        return TIMESHEET_CATEGORY_PROJECT

    def validate(self, attrs):
        attrs = super().validate(attrs)

        category = attrs.get("category")
        # 创建时兜底：缺省 category 按 issue/test_case 反推
        if category is None and self.instance is None and "category" not in attrs:
            fallback_key = self._resolve_fallback_category_key(attrs)
            # 优先取启用项；若目标 key 被停用（如拆分后被停用的 ISSUE），
            # 放开 is_active 以保证兜底仍能命中。
            fallback_category = (
                TimesheetCategory.objects.filter(key=fallback_key, is_active=True).first()
                or TimesheetCategory.objects.filter(key=fallback_key).first()
            )
            if fallback_category is not None:
                attrs["category"] = fallback_category
                category = fallback_category

        # 如显式传 category，则与 issue / test_case 的组合按模型 clean() 校验
        if category is not None:
            if category.key in CATEGORY_KEYS_REQUIRE_ISSUE and not attrs.get("issue"):
                raise serializers.ValidationError({"issue": ["该工时类别必须挂靠工作项。"]})
            if category.key in CATEGORY_KEYS_REQUIRE_TEST_CASE and not attrs.get("test_case"):
                raise serializers.ValidationError({"test_case": ["该工时类别必须挂靠测试用例。"]})

        return attrs


class TimeSheetCopyPreviousWeekSerializer(serializers.Serializer):
    week_start = serializers.DateField()

    def validate_week_start(self, value):
        if value.weekday() != 0:
            raise serializers.ValidationError("week_start 必须是周一。")
        return value
