from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.fields import empty

from plane.db.models import (
    FileAsset,
    Requirement,
    RequirementAttachment,
    RequirementModule,
    User,
    WorkspaceMember,
)
from plane.utils.content_validator import validate_html_content

from .base import BaseSerializer
from .user import UserLiteSerializer


class RequirementModuleLiteSerializer(BaseSerializer):
    class Meta:
        model = RequirementModule
        fields = ["id", "name"]
        read_only_fields = fields


class RequirementModuleSerializer(BaseSerializer):
    requirement_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RequirementModule
        fields = [
            "id",
            "product",
            "name",
            "requirement_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "product",
            "requirement_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("REQUIREMENT_MODULE_NAME_REQUIRED")
        product = self.context["product"]
        queryset = RequirementModule.objects.filter(product=product, name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("REQUIREMENT_MODULE_NAME_ALREADY_EXISTS")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        return RequirementModule.objects.create(
            product=self.context["product"],
            created_by=request.user,
            **validated_data,
        )


class RequirementParentLiteSerializer(BaseSerializer):
    class Meta:
        model = Requirement
        fields = ["id", "name"]
        read_only_fields = fields


class RequirementAttachmentDetailSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="asset_id", read_only=True)
    attributes = serializers.JSONField(source="asset.attributes", read_only=True)
    asset_url = serializers.CharField(source="asset.asset_url", read_only=True)
    created_at = serializers.DateTimeField(source="asset.created_at", read_only=True)
    updated_at = serializers.DateTimeField(source="asset.updated_at", read_only=True)
    created_by = serializers.UUIDField(
        source="asset.created_by_id", read_only=True, allow_null=True
    )

    class Meta:
        model = RequirementAttachment
        fields = [
            "id",
            "attributes",
            "asset_url",
            "created_at",
            "updated_at",
            "created_by",
        ]


class UserRequirementListSerializer(BaseSerializer):
    module_detail = RequirementModuleLiteSerializer(source="module", read_only=True)
    parent_detail = RequirementParentLiteSerializer(source="parent", read_only=True)
    assignee_detail = UserLiteSerializer(source="assignee", read_only=True)
    reviewer_details = UserLiteSerializer(source="reviewers", many=True, read_only=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)
    sub_requirements_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Requirement
        fields = [
            "id",
            "product",
            "name",
            "type",
            "priority",
            "module",
            "module_detail",
            "parent",
            "parent_detail",
            "assignee",
            "assignee_detail",
            "reviewers",
            "reviewer_details",
            "attachment_count",
            "sub_requirements_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class UserRequirementDetailSerializer(UserRequirementListSerializer):
    attachments = RequirementAttachmentDetailSerializer(
        source="requirement_attachments", many=True, read_only=True
    )

    class Meta(UserRequirementListSerializer.Meta):
        fields = UserRequirementListSerializer.Meta.fields + [
            "description_html",
            "acceptance_criteria_html",
            "attachments",
        ]
        read_only_fields = fields


class UserRequirementWriteSerializer(BaseSerializer):
    module = serializers.PrimaryKeyRelatedField(
        queryset=RequirementModule.objects.all(), required=False, allow_null=True
    )
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Requirement.objects.all(), required=False, allow_null=True
    )
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    reviewers = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )
    description_html = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    acceptance_criteria_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, write_only=True
    )

    class Meta:
        model = Requirement
        fields = [
            "name",
            "priority",
            "module",
            "parent",
            "assignee",
            "reviewers",
            "description_html",
            "acceptance_criteria_html",
            "attachment_ids",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("REQUIREMENT_NAME_REQUIRED")
        return value

    def _validate_html(self, value, error_code):
        if not value:
            return value
        is_valid, _error_message, sanitized_html = validate_html_content(str(value))
        if not is_valid:
            raise serializers.ValidationError(error_code)
        return sanitized_html if sanitized_html is not None else value

    def validate_description_html(self, value):
        return self._validate_html(value, "REQUIREMENT_DESCRIPTION_INVALID_HTML")

    def validate_acceptance_criteria_html(self, value):
        return self._validate_html(value, "REQUIREMENT_ACCEPTANCE_CRITERIA_INVALID_HTML")

    def validate_module(self, value):
        if value and value.product_id != self.context["product"].id:
            raise serializers.ValidationError("REQUIREMENT_MODULE_PRODUCT_MISMATCH")
        return value

    def validate_parent(self, value):
        if value is None:
            return None
        product = self.context["product"]
        if value.product_id != product.id or value.type != Requirement.RequirementType.USER:
            raise serializers.ValidationError("REQUIREMENT_PARENT_PRODUCT_MISMATCH")
        if self.instance and value.id == self.instance.id:
            raise serializers.ValidationError("REQUIREMENT_PARENT_SELF_REFERENCE")

        ancestor = value
        visited = set()
        while ancestor is not None:
            if ancestor.id in visited or (self.instance and ancestor.id == self.instance.id):
                raise serializers.ValidationError("REQUIREMENT_PARENT_CYCLE")
            visited.add(ancestor.id)
            ancestor = ancestor.parent
        return value

    def _is_active_workspace_member(self, user):
        return WorkspaceMember.objects.filter(
            workspace=self.context["product"].workspace,
            member=user,
            is_active=True,
        ).exists()

    def validate_assignee(self, value):
        if value and not self._is_active_workspace_member(value):
            raise serializers.ValidationError("REQUIREMENT_ASSIGNEE_INVALID")
        return value

    def validate_reviewers(self, value):
        invalid = [user for user in value if not self._is_active_workspace_member(user)]
        if invalid:
            raise serializers.ValidationError("REQUIREMENT_REVIEWERS_INVALID")
        return value

    def validate_attachment_ids(self, value):
        asset_ids = list(dict.fromkeys(value))
        if not asset_ids:
            return []

        product = self.context["product"]
        request = self.context["request"]
        current_ids = set()
        if self.instance:
            current_ids = set(
                self.instance.requirement_attachments.values_list("asset_id", flat=True)
            )

        assets = FileAsset.objects.filter(
            id__in=asset_ids,
            workspace=product.workspace,
            product=product,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
            is_uploaded=True,
            is_deleted=False,
        )
        matched_ids = set(assets.values_list("id", flat=True))
        if matched_ids != set(asset_ids):
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_INVALID")

        new_assets = assets.exclude(id__in=current_ids)
        if new_assets.exclude(created_by=request.user).exists():
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_NOT_OWNED")
        if RequirementAttachment.objects.filter(asset_id__in=new_assets.values("id")).exists():
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_ALREADY_BOUND")
        return asset_ids

    def _sync_attachments(self, requirement, attachment_ids):
        if attachment_ids is empty:
            return

        requested_ids = set(attachment_ids)
        current_relations = requirement.requirement_attachments.all()
        removed_relations = current_relations.exclude(asset_id__in=requested_ids)
        removed_ids = list(removed_relations.values_list("asset_id", flat=True))
        if removed_ids:
            now = timezone.now()
            removed_relations.update(deleted_at=now, updated_by=self.context["request"].user)
            FileAsset.objects.filter(id__in=removed_ids).update(
                is_deleted=True, deleted_at=now, updated_by=self.context["request"].user
            )

        existing_ids = set(
            requirement.requirement_attachments.filter(asset_id__in=requested_ids).values_list(
                "asset_id", flat=True
            )
        )
        request = self.context["request"]
        for asset_id in requested_ids - existing_ids:
            RequirementAttachment.objects.create(
                requirement=requirement,
                asset_id=asset_id,
                created_by=request.user,
            )
        FileAsset.objects.filter(id__in=requested_ids).update(
            entity_identifier=str(requirement.id)
        )

    @transaction.atomic
    def create(self, validated_data):
        reviewers = validated_data.pop("reviewers", [])
        attachment_ids = validated_data.pop("attachment_ids", [])
        request = self.context["request"]
        requirement = Requirement(
            product=self.context["product"],
            type=Requirement.RequirementType.USER,
            **validated_data,
        )
        requirement.save(created_by_id=request.user.id)
        requirement.reviewers.set(reviewers)
        self._sync_attachments(requirement, attachment_ids)
        return requirement

    @transaction.atomic
    def update(self, instance, validated_data):
        reviewers = validated_data.pop("reviewers", empty)
        attachment_ids = validated_data.pop("attachment_ids", empty)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.type = Requirement.RequirementType.USER
        instance.save()
        if reviewers is not empty:
            instance.reviewers.set(reviewers)
        self._sync_attachments(instance, attachment_ids)
        return instance
