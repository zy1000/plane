# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .issue import IssueStateSerializer
from .user import UserLiteSerializer
from plane.db.models import (
    Cycle,
    CycleActivity,
    CycleComment,
    CycleIssue,
    CycleOverdueRecord,
    CycleUserProperties,
    User,
)
from plane.utils.cycle.rules import check_cycle_state
from plane.utils.timezone_converter import convert_to_utc


class CycleWriteSerializer(BaseSerializer):
    owned_by_id = serializers.PrimaryKeyRelatedField(
        source="owned_by",
        queryset=User.objects.all(),
        required=False,
    )

    def validate(self, data):
        status = data.get("status")
        user = self.context.get("user")
        has_end_date_in_payload = "end_date" in data

        if self.instance and has_end_date_in_payload and data.get("end_date") is None:
            raise serializers.ValidationError("结束时间不可清空")

        if (
            data.get("start_date", None) is not None
            and data.get("end_date", None) is not None
            and data.get("start_date", None) > data.get("end_date", None)
        ):
            raise serializers.ValidationError("Start date cannot exceed end date")
        if data.get("start_date", None) is not None or data.get("end_date", None) is not None:
            project_id = (
                self.initial_data.get("project_id", None)
                or (self.instance and self.instance.project_id)
                or self.context.get("project_id", None)
            )
            if data.get("start_date", None) is not None:
                data["start_date"] = convert_to_utc(
                    date=str(data.get("start_date").date()),
                    project_id=project_id,
                    is_start_date=True,
                )
            if data.get("end_date", None) is not None:
                data["end_date"] = convert_to_utc(
                    date=str(data.get("end_date").date()),
                    project_id=project_id,
                )

        if self.instance and "owned_by" in data:
            requested_owner = data.get("owned_by")
            requested_owner_id = getattr(requested_owner, "id", None)
            if requested_owner_id != self.instance.owned_by_id and self.instance.owned_by_id != getattr(user, "id", None):
                raise serializers.ValidationError(
                    {
                        "error": "仅当前迭代负责人可以修改负责人",
                    }
                )

        if status and self.instance and status != self.instance.status:
            if self.instance.owned_by_id != getattr(user, "id", None):
                raise serializers.ValidationError(
                    {
                        "error": "不符合状态流转规则",
                        "reasons": ["状态只能由负责人修改"],
                    }
                )

            result = check_cycle_state(self.instance, Cycle.Status(status))
            if not result.allowed:
                raise serializers.ValidationError(
                    {
                        "error": "不符合状态流转规则",
                        "reasons": result.reasons,
                    }
                )
        return data

    class Meta:
        model = Cycle
        fields = "__all__"
        read_only_fields = ["workspace", "project", "owned_by", "archived_at"]


class CycleSerializer(BaseSerializer):
    # favorite
    is_favorite = serializers.BooleanField(read_only=True)
    total_issues = serializers.IntegerField(read_only=True)
    # state group wise distribution
    cancelled_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    started_issues = serializers.IntegerField(read_only=True)
    unstarted_issues = serializers.IntegerField(read_only=True)
    backlog_issues = serializers.IntegerField(read_only=True)

    # active | draft | upcoming | completed
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Cycle
        fields = [
            # necessary fields
            "id",
            "workspace_id",
            "project_id",
            # model fields
            "name",
            "description",
            "suggested_test_scope",
            "start_date",
            "end_date",
            "owned_by_id",
            "view_props",
            "sort_order",
            "external_source",
            "external_id",
            "progress_snapshot",
            "logo_props",
            "release_id",
            # meta fields
            "is_favorite",
            "total_issues",
            "cancelled_issues",
            "completed_issues",
            "started_issues",
            "unstarted_issues",
            "backlog_issues",
            "status",
        ]
        read_only_fields = fields

class CycleSimpleFieldSerializer(BaseSerializer):
    class Meta:
        model = Cycle
        fields = ['id','name','start_date','end_date']

class CycleIssueSerializer(BaseSerializer):
    issue_detail = IssueStateSerializer(read_only=True, source="issue")
    sub_issues_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CycleIssue
        fields = "__all__"
        read_only_fields = ["workspace", "project", "cycle"]


class CycleUserPropertiesSerializer(BaseSerializer):
    class Meta:
        model = CycleUserProperties
        fields = "__all__"
        read_only_fields = ["workspace", "project", "cycle", "user"]


class CycleOverdueRecordSerializer(BaseSerializer):
    class Meta:
        model = CycleOverdueRecord
        fields = [
            "id",
            "cycle",
            "started_at",
            "ended_at",
            "triggered_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CycleCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = CycleComment
        fields = [
            "id",
            "workspace",
            "project",
            "cycle",
            "actor",
            "actor_detail",
            "comment_stripped",
            "comment_json",
            "comment_html",
            "parent",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "project",
            "cycle",
            "actor",
            "comment_stripped",
            "edited_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class CycleActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = CycleActivity
        fields = [
            "id",
            "workspace",
            "project",
            "cycle",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "old_identifier",
            "new_identifier",
            "comment",
            "cycle_comment",
            "epoch",
            "extra",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
