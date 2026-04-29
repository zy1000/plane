# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType


class IssueTypeSerializer(BaseSerializer):
    project_id = serializers.UUIDField(source="project.id", read_only=True)

    class Meta:
        model = IssueType
        fields = [
            "id",
            "project",
            "project_id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "external_source",
            "external_id",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "workspace", "created_at", "updated_at"]
