# Third Party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from .project import ProjectLiteSerializer

# Django imports
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError

from plane.db.models import (
    User,
    Release,
    ReleaseMember,
    ReleaseIssue,
    ReleaseLink,
    ReleaseUserProperties,
)


class ReleaseWriteSerializer(BaseSerializer):
    lead_id = serializers.PrimaryKeyRelatedField(
        source="lead", queryset=User.objects.all(), required=False, allow_null=True
    )
    member_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Release
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "archived_at",
            "deleted_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["member_ids"] = [str(member.id) for member in instance.members.all()]
        return data

    def validate(self, data):
        if (
            data.get("start_date", None) is not None
            and data.get("target_date", None) is not None
            and data.get("start_date", None) > data.get("target_date", None)
        ):
            raise serializers.ValidationError("Start date cannot exceed target date")
        return data

    def create(self, validated_data):
        members = validated_data.pop("member_ids", None)
        project = self.context["project"]

        release_name = validated_data.get("name")
        if release_name:
            if Release.objects.filter(name=release_name, project=project).exists():
                raise serializers.ValidationError({"error": "Release with this name already exists"})

        release = Release.objects.create(**validated_data, project=project)
        if members is not None:
            ReleaseMember.objects.bulk_create(
                [
                    ReleaseMember(
                        release=release,
                        member=member,
                        project=project,
                        workspace=project.workspace,
                        created_by=release.created_by,
                        updated_by=release.updated_by,
                    )
                    for member in members
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        return release

    def update(self, instance, validated_data):
        members = validated_data.pop("member_ids", None)
        release_name = validated_data.get("name")
        if release_name:
            if Release.objects.filter(name=release_name, project=instance.project).exclude(id=instance.id).exists():
                raise serializers.ValidationError({"error": "Release with this name already exists"})

        if members is not None:
            ReleaseMember.objects.filter(release=instance).delete()
            ReleaseMember.objects.bulk_create(
                [
                    ReleaseMember(
                        release=instance,
                        member=member,
                        project=instance.project,
                        workspace=instance.project.workspace,
                        created_by=instance.created_by,
                        updated_by=instance.updated_by,
                    )
                    for member in members
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        return super().update(instance, validated_data)


class ReleaseFlatSerializer(BaseSerializer):
    class Meta:
        model = Release
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class ReleaseIssueSerializer(BaseSerializer):
    release_detail = ReleaseFlatSerializer(read_only=True, source="release")
    issue_detail = ProjectLiteSerializer(read_only=True, source="issue")
    sub_issues_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ReleaseIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "release",
        ]


class ReleaseLinkSerializer(BaseSerializer):
    class Meta:
        model = ReleaseLink
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "release",
        ]

    def to_internal_value(self, data):
        url = data.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            data["url"] = "http://" + url

        return super().to_internal_value(data)

    def validate_url(self, value):
        url_validator = URLValidator()
        try:
            url_validator(value)
        except ValidationError:
            raise serializers.ValidationError({"error": "Invalid URL format."})

        return value

    def create(self, validated_data):
        validated_data["url"] = self.validate_url(validated_data.get("url"))
        if ReleaseLink.objects.filter(url=validated_data.get("url"), release_id=validated_data.get("release_id")).exists():
            raise serializers.ValidationError({"error": "URL already exists."})
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data["url"] = self.validate_url(validated_data.get("url"))
        if (
            ReleaseLink.objects.filter(url=validated_data.get("url"), release_id=instance.release_id)
            .exclude(pk=instance.id)
            .exists()
        ):
            raise serializers.ValidationError({"error": "URL already exists for this Release"})

        return super().update(instance, validated_data)


class ReleaseSerializer(DynamicBaseSerializer):
    member_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_null=True)
    is_favorite = serializers.BooleanField(read_only=True)
    total_issues = serializers.IntegerField(read_only=True)
    cancelled_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    started_issues = serializers.IntegerField(read_only=True)
    unstarted_issues = serializers.IntegerField(read_only=True)
    backlog_issues = serializers.IntegerField(read_only=True)
    total_estimate_points = serializers.FloatField(read_only=True)
    completed_estimate_points = serializers.FloatField(read_only=True)

    class Meta:
        model = Release
        fields = [
            # Required fields
            "id",
            "workspace_id",
            "project_id",
            # Model fields
            "name",
            "description",
            "description_text",
            "description_html",
            "start_date",
            "target_date",
            "status",
            "lead_id",
            "member_ids",
            "view_props",
            "sort_order",
            "external_source",
            "external_id",
            "logo_props",
            # computed fields
            "total_estimate_points",
            "completed_estimate_points",
            "is_favorite",
            "total_issues",
            "cancelled_issues",
            "completed_issues",
            "started_issues",
            "unstarted_issues",
            "backlog_issues",
            "created_at",
            "updated_at",
            "archived_at",
            "note",
        ]
        read_only_fields = fields


class ReleaseDetailSerializer(ReleaseSerializer):
    link_release = ReleaseLinkSerializer(read_only=True, many=True)
    sub_issues = serializers.IntegerField(read_only=True)
    backlog_estimate_points = serializers.FloatField(read_only=True)
    unstarted_estimate_points = serializers.FloatField(read_only=True)
    started_estimate_points = serializers.FloatField(read_only=True)
    cancelled_estimate_points = serializers.FloatField(read_only=True)

    class Meta(ReleaseSerializer.Meta):
        fields = ReleaseSerializer.Meta.fields + [
            "link_release",
            "sub_issues",
            "backlog_estimate_points",
            "unstarted_estimate_points",
            "started_estimate_points",
            "cancelled_estimate_points",
        ]


class ReleaseUserPropertiesSerializer(BaseSerializer):
    class Meta:
        model = ReleaseUserProperties
        fields = "__all__"
        read_only_fields = ["workspace", "project", "release", "user"]
