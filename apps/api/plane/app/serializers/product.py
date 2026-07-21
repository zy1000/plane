from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import Product, User, WorkspaceMember
from plane.utils.content_validator import validate_html_content

from .base import BaseSerializer


class ProductSerializer(BaseSerializer):
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    reviewers = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    reviewer_details = UserLiteSerializer(source="reviewers", many=True, read_only=True)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Product name cannot be empty.")

        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")

        queryset = Product.objects.filter(workspace=workspace, name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_NAME_ALREADY_EXISTS")
        return name

    def validate_reviewers(self, reviewers):
        workspace = self.context.get("workspace")
        if workspace is None or not reviewers:
            return reviewers

        reviewer_ids = {reviewer.id for reviewer in reviewers}
        workspace_reviewer_ids = set(
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member_id__in=reviewer_ids,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        if reviewer_ids != workspace_reviewer_ids:
            raise serializers.ValidationError(
                "All reviewers must be active members of this workspace."
            )
        return reviewers

    def validate_owner(self, owner):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        if not WorkspaceMember.objects.filter(
            workspace=workspace,
            member=owner,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError(
                "Owner must be an active member of this workspace."
            )
        return owner

    def validate_description_html(self, value):
        if value is None or value == "":
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(
                error_message or "HTML content is not valid."
            )
        return sanitized_html if sanitized_html is not None else value

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description_html",
            "network",
            "workspace",
            "owner",
            "reviewers",
            "owner_detail",
            "reviewer_details",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "owner_detail",
            "reviewer_details",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
