# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import State, StateGroup
from rest_framework import serializers


class StateSerializer(BaseSerializer):
    """
    Serializer for work item states with default state management.

    Handles state creation and updates including default state validation
    and automatic default state switching for workflow management.
    """

    # 状态归方案，没有 project 列。对外仍给 project（方案的归属项目，模式方案为空），保持契约不变
    project = serializers.UUIDField(source="scheme.project_id", read_only=True)

    def validate(self, data):
        # If the default is being provided then make all other states default False
        if data.get("default", False):
            State.objects.filter(scheme__projects=self.context.get("project_id")).update(default=False)

        if data.get("group", None) == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        return data

    class Meta:
        model = State
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            # 工作项方案由接口按项目带出，外部调用方不能指定
            "scheme",
            "deleted_at",
            "slug",
        ]


class StateLiteSerializer(BaseSerializer):
    """
    Lightweight state serializer for minimal data transfer.

    Provides essential state information including visual properties
    and grouping data optimized for UI display and filtering.
    """

    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
