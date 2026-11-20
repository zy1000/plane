# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import Notification, UserNotificationPreference

# Third Party imports
from rest_framework import serializers


class NotificationSerializer(BaseSerializer):
    triggered_by_details = UserLiteSerializer(read_only=True, source="triggered_by")
    is_inbox_issue = serializers.BooleanField(read_only=True)
    is_intake_issue = serializers.BooleanField(read_only=True)
    is_mentioned_notification = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = "__all__"


class UserNotificationPreferenceSerializer(BaseSerializer):
    # 「待我审批」固定即时，不在这里；每一类能选的方式不同
    assign_mode = serializers.ChoiceField(choices=["instant", "digest"], required=False)
    result_mode = serializers.ChoiceField(choices=["instant", "digest", "none"], required=False)
    inform_mode = serializers.ChoiceField(choices=["digest", "none"], required=False)

    class Meta:
        model = UserNotificationPreference
        fields = [
            "id",
            "property_change",
            "state_change",
            "comment",
            "mention",
            "issue_completed",
            "assign_mode",
            "result_mode",
            "inform_mode",
        ]
        read_only_fields = ["id"]
