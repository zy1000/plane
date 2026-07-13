from django.db import IntegrityError, transaction
from rest_framework import serializers

from plane.app.permissions import can_manage_product
from plane.db.models import FileAsset, Product, ProductMember, User, WorkspaceMember
from plane.utils.content_validator import validate_html_content

from .base import BaseSerializer
from .user import UserLiteSerializer


class ProductSerializer(BaseSerializer):
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    can_manage = serializers.SerializerMethodField(read_only=True)
    description_html = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description_asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
        allow_empty=True,
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description_html",
            "description_asset_ids",
            "network",
            "owner",
            "owner_detail",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "can_manage",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "owner_detail",
            "can_manage",
        ]

    def get_can_manage(self, obj):
        request = self.context.get("request")
        return bool(request and can_manage_product(request.user, obj))

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("PRODUCT_NAME_REQUIRED")

        workspace = self.context["workspace"]
        queryset = Product.objects.filter(name=value, workspace=workspace)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_NAME_ALREADY_EXIST")
        return value

    def validate_owner(self, value):
        if value is None:
            return None
        workspace = self.context["workspace"]
        if not WorkspaceMember.objects.filter(
            workspace=workspace,
            member=value,
            is_active=True,
        ).exists():
            raise serializers.ValidationError("PRODUCT_OWNER_MUST_BE_WORKSPACE_MEMBER")
        return value

    def validate_description_html(self, value):
        if not value:
            return value
        is_valid, _error_msg, sanitized_html = validate_html_content(str(value))
        if not is_valid:
            raise serializers.ValidationError("PRODUCT_DESCRIPTION_INVALID_HTML")
        return sanitized_html if sanitized_html is not None else value

    def validate_description_asset_ids(self, value):
        if self.instance and value:
            raise serializers.ValidationError("PRODUCT_ASSETS_ONLY_ALLOWED_ON_CREATE")
        if not value:
            return []

        request = self.context["request"]
        workspace = self.context["workspace"]
        asset_ids = list(dict.fromkeys(value))
        matched_ids = set(
            FileAsset.objects.filter(
                id__in=asset_ids,
                workspace=workspace,
                entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                product__isnull=True,
                created_by=request.user,
                is_uploaded=True,
            ).values_list("id", flat=True)
        )
        if matched_ids != set(asset_ids):
            raise serializers.ValidationError("PRODUCT_DESCRIPTION_ASSETS_INVALID")
        return asset_ids

    def validate(self, attrs):
        if self.instance is None and not attrs.get("owner"):
            raise serializers.ValidationError({"owner": "PRODUCT_OWNER_REQUIRED"})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        asset_ids = validated_data.pop("description_asset_ids", [])
        workspace = self.context["workspace"]
        request = self.context["request"]

        try:
            product = Product(
                workspace=workspace,
                **validated_data,
            )
            product.save(created_by_id=request.user.id)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "PRODUCT_NAME_ALREADY_EXIST"}
            ) from exc
        for member_id in {request.user.id, product.owner_id} - {None}:
            ProductMember.objects.get_or_create(product=product, member_id=member_id)

        if asset_ids:
            assets = FileAsset.objects.select_for_update().filter(
                id__in=asset_ids,
                workspace=workspace,
                entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                product__isnull=True,
                created_by=request.user,
                is_uploaded=True,
            )
            locked_asset_ids = set(assets.values_list("id", flat=True))
            if locked_asset_ids != set(asset_ids):
                raise serializers.ValidationError(
                    {"description_asset_ids": "PRODUCT_DESCRIPTION_ASSETS_INVALID"}
                )
            FileAsset.objects.filter(id__in=locked_asset_ids).update(product=product)
        self.bound_description_asset_ids = asset_ids
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        validated_data.pop("description_asset_ids", None)
        product = super().update(instance, validated_data)
        if "owner" in validated_data and product.owner_id:
            ProductMember.objects.get_or_create(product=product, member_id=product.owner_id)
        return product
