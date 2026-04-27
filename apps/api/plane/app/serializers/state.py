# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State, StateGroup, IssueType


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)
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
        read_only_fields = ["workspace", "project"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        if attrs.get("issue_type") and str(attrs["issue_type"].project_id) != str(self.context.get("project_id")):
            raise serializers.ValidationError("Issue type is not valid please pass a valid issue_type_id")
        return attrs


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
