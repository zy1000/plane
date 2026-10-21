# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State, StateGroup, IssueType
from plane.utils.issue_scheme import project_scheme_id


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)
    # 状态归方案。project_id 取方案的归属项目（模式方案为空），前端按 scheme_id 归属状态
    project_id = serializers.UUIDField(source="scheme.project_id", read_only=True)
    scheme_id = serializers.UUIDField(read_only=True)
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueType.objects.all(),
        source="issue_type",
        required=False,
        allow_null=False,
    )

    class Meta:
        model = State
        fields = [
            "id",
            "project_id",
            "scheme_id",
            "workspace_id",
            "name",
            "color",
            "group",
            "default",
            "description",
            "sequence",
            "order",
            'issue_type_id',
        ]
        read_only_fields = ["workspace"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        # 类型必须在当前方案里（方案级路由直接给 scheme_id，项目级路由按项目所用的方案）
        scheme_id = self.context.get("scheme_id") or project_scheme_id(self.context.get("project_id"))
        if attrs.get("issue_type") and str(attrs["issue_type"].scheme_id) != str(scheme_id):
            raise serializers.ValidationError("Issue type is not valid please pass a valid issue_type_id")
        return attrs


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
