from django.db import transaction
from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    Product,
    ProductMember,
    ProductMemberRole,
    ProductRole,
    User,
    WorkspaceMember,
)
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


class ProductRoleSerializer(BaseSerializer):
    class Meta:
        model = ProductRole
        fields = [
            "id",
            "product",
            "name",
            "description",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "permissions",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Role name cannot be empty.")

        product = self.context.get("product")
        queryset = ProductRole.objects.filter(product=product, name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Product role name already exists.")
        return name


class ProductMemberSerializer(BaseSerializer):
    member_detail = UserLiteSerializer(source="member", read_only=True)
    custom_role_ids = serializers.SerializerMethodField(read_only=True)
    role_details = ProductRoleSerializer(source="custom_roles", many=True, read_only=True)

    class Meta:
        model = ProductMember
        fields = [
            "id",
            "product",
            "member",
            "custom_role_ids",
            "member_detail",
            "role_details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_custom_role_ids(self, obj):
        return [role.id for role in obj.custom_roles.all()]


class ProductMemberInviteSerializer(BaseSerializer):
    member = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    custom_role_ids = serializers.PrimaryKeyRelatedField(
        source="custom_roles",
        queryset=ProductRole.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = ProductMember
        fields = ["product", "member", "custom_role_ids"]
        validators = []

    def validate_custom_role_ids(self, roles):
        return list({role.id: role for role in roles}.values())

    def validate_product(self, product):
        if product.workspace.slug != self.context.get("workspace_slug"):
            raise serializers.ValidationError(
                "Product does not belong to this workspace."
            )
        return product

    def validate(self, attrs):
        product = attrs.get("product")
        member = attrs.get("member")
        if product is None or member is None:
            return attrs

        if not WorkspaceMember.objects.filter(
            workspace=product.workspace,
            member=member,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError(
                {"member": "Member must be an active member of this workspace."}
            )

        if ProductMember.objects.filter(product=product, member=member).exists():
            raise serializers.ValidationError(
                {"member": "Member already belongs to this product."}
            )

        roles = attrs.get("custom_roles", [])
        if any(role.product_id != product.id for role in roles):
            raise serializers.ValidationError(
                {"custom_role_ids": "Roles must belong to the same product."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        roles = validated_data.pop("custom_roles", [])
        product_member = ProductMember.objects.create(**validated_data)
        ProductMemberRole.objects.bulk_create(
            [ProductMemberRole(member=product_member, role=role) for role in roles],
            ignore_conflicts=True,
        )
        return product_member


class ProductMemberCustomRolesSerializer(serializers.Serializer):
    custom_role_ids = serializers.PrimaryKeyRelatedField(
        source="custom_roles",
        queryset=ProductRole.objects.all(),
        many=True,
    )

    def validate_custom_role_ids(self, roles):
        return list({role.id: role for role in roles}.values())

    def validate(self, attrs):
        roles = attrs.get("custom_roles", [])
        if any(role.product_id != self.instance.product_id for role in roles):
            raise serializers.ValidationError(
                {"custom_role_ids": "Roles must belong to the same product."}
            )
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        roles = validated_data.get("custom_roles", [])
        role_ids = {role.id for role in roles}
        ProductMemberRole.objects.filter(member=instance).exclude(
            role_id__in=role_ids
        ).delete()
        existing_role_ids = set(
            ProductMemberRole.objects.filter(member=instance).values_list("role_id", flat=True)
        )
        ProductMemberRole.objects.bulk_create(
            [
                ProductMemberRole(member=instance, role=role)
                for role in roles
                if role.id not in existing_role_ids
            ],
            ignore_conflicts=True,
        )
        instance._prefetched_objects_cache = {}
        return instance
