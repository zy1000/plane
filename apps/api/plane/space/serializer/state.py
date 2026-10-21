# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State


class StateSerializer(BaseSerializer):
    # 状态归方案，没有 project 列；对外仍给 project（方案的归属项目，模式方案为空）
    project = serializers.UUIDField(source="scheme.project_id", read_only=True)

    class Meta:
        model = State
        fields = "__all__"
        read_only_fields = ["workspace", "scheme"]


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
