# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Issue, Project, TestCase, TimeSheet

from .base import BaseSerializer
from .user import UserLiteSerializer


class IssueLiteSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    sequence_id = serializers.IntegerField(read_only=True)
    type_id = serializers.UUIDField(read_only=True, allow_null=True)


class TestCaseLiteSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)


class TimeSheetSerializer(BaseSerializer):
    member_detail = UserLiteSerializer(source="member", read_only=True)
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
    issue_detail = IssueLiteSerializer(source="issue", read_only=True)
    test_case_detail = TestCaseLiteSerializer(source="test_case", read_only=True)

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
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        # 避免 DRF 根据模型 UniqueConstraint 自动生成 UniqueTogetherValidator，
        # 否则会把 issue/test_case 重新视为必填字段。
        validators = []


class TimeSheetCopyPreviousWeekSerializer(serializers.Serializer):
    week_start = serializers.DateField()

    def validate_week_start(self, value):
        if value.weekday() != 0:
            raise serializers.ValidationError("week_start 必须是周一。")
        return value
