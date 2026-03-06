from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.license.models import ChangeLog


class ChangeLogSerializer(BaseSerializer):
    class Meta:
        model = ChangeLog
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]


class ChangeLogReadRequestSerializer(serializers.Serializer):
    changelog_id = serializers.UUIDField()
