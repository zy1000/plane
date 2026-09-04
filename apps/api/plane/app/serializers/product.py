import re

from django.db import transaction
from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    DataDictionaryItem,
    Product,
    ProductMember,
    ProductMemberRole,
    ProductRole,
    User,
    WorkspaceMember,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.data_dictionary import PRODUCT_DICTIONARY_FIELD_KEYS

from .base import BaseSerializer
from .data_dictionary import DataDictionaryItemLiteSerializer


# 首位必须是字母，且不含连字符 —— 展示编号是 "{identifier}-{sequence_id}"，
# 标识里再出现连字符就没法反解（"A-B-1" 有两种读法）。
IDENTIFIER_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,11}$")


def _dictionary_item_field():
    # 必须显式声明：模型列 null=True，ModelSerializer 会自动生成 required=False / allow_null=True。
    # 这里要的是「创建必填、PATCH 可省略、显式 null 拒绝」—— required=True + allow_null 默认 False 正好。
    return serializers.PrimaryKeyRelatedField(
        queryset=DataDictionaryItem.objects.select_related("dictionary"), required=True
    )


class ProductSerializer(BaseSerializer):
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    stage = _dictionary_item_field()
    category = _dictionary_item_field()
    status = _dictionary_item_field()
    hardware_level = _dictionary_item_field()
    structure_level = _dictionary_item_field()
    software_level = _dictionary_item_field()
    stage_detail = DataDictionaryItemLiteSerializer(source="stage", read_only=True)
    category_detail = DataDictionaryItemLiteSerializer(source="category", read_only=True)
    status_detail = DataDictionaryItemLiteSerializer(source="status", read_only=True)
    hardware_level_detail = DataDictionaryItemLiteSerializer(
        source="hardware_level", read_only=True
    )
    structure_level_detail = DataDictionaryItemLiteSerializer(
        source="structure_level", read_only=True
    )
    software_level_detail = DataDictionaryItemLiteSerializer(
        source="software_level", read_only=True
    )
    start_date = serializers.DateField(required=True)
    project_lead = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=True
    )
    test_lead = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=True
    )
    project_lead_detail = UserLiteSerializer(source="project_lead", read_only=True)
    test_lead_detail = UserLiteSerializer(source="test_lead", read_only=True)
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

    def validate_identifier(self, value):
        # 归一化必须排在查重之前：先查后转的话，提交 "ecom" 会绕过这里的查重，
        # 然后在 Product.save() 里变成 "ECOM" 撞上 DB 唯一约束 —— 用户拿到 500 而不是 400。
        identifier = (value or "").strip().upper()
        if not IDENTIFIER_PATTERN.match(identifier):
            raise serializers.ValidationError("PRODUCT_IDENTIFIER_INVALID")

        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")

        queryset = Product.objects.filter(workspace=workspace, identifier=identifier)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_IDENTIFIER_ALREADY_EXISTS")
        return identifier

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

    def _require_workspace_member(self, user, message):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        if not WorkspaceMember.objects.filter(
            workspace=workspace,
            member=user,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError(message)
        return user

    # 两位负责人只要求是工作区成员，不像 owner 那样要求已在产品成员表里
    def validate_project_lead(self, user):
        return self._require_workspace_member(
            user, "Project lead must be an active member of this workspace."
        )

    def validate_test_lead(self, user):
        return self._require_workspace_member(
            user, "Test lead must be an active member of this workspace."
        )

    def validate_code(self, value):
        code = (value or "").strip()
        if not code:
            raise serializers.ValidationError("Product code cannot be empty.")
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        queryset = Product.objects.filter(workspace=workspace, code=code)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_CODE_ALREADY_EXISTS")
        return code

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # 字典值必须属于本工作区、且来自对应的系统字典（阶段字段不能塞一个「产品状态」的值）
        workspace = self.context.get("workspace")
        errors = {}
        for field, key in PRODUCT_DICTIONARY_FIELD_KEYS.items():
            item = attrs.get(field)
            if item is None:
                continue
            if (
                workspace is None
                or item.workspace_id != workspace.id
                or item.dictionary.key != key
            ):
                errors[field] = ["PRODUCT_DICTIONARY_ITEM_INVALID"]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

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
        # 创建时产品还不存在、成员表必然为空，负责人由 ViewSet.create 落成首个产品成员；
        # 编辑时负责人必须已经在成员里，否则产品成员这层就形同虚设。
        if self.instance is not None and not ProductMember.objects.filter(
            product=self.instance, member=owner
        ).exists():
            raise serializers.ValidationError("PRODUCT_OWNER_NOT_MEMBER")
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
            # 需求编号的前缀（ECOM-1）。可以 PATCH 改 —— 编号是读时拼的，
            # 改完所有已有需求的展示编号自动跟随，没有第二份真相要同步。
            "identifier",
            "code",
            "description_html",
            "network",
            "workspace",
            "owner",
            "reviewers",
            "owner_detail",
            "reviewer_details",
            "stage",
            "category",
            "status",
            "hardware_level",
            "structure_level",
            "software_level",
            "stage_detail",
            "category_detail",
            "status_detail",
            "hardware_level_detail",
            "structure_level_detail",
            "software_level_detail",
            "start_date",
            "project_lead",
            "test_lead",
            "project_lead_detail",
            "test_lead_detail",
            "model_number",
            "external_model",
            "o_phase_close_date",
            "v_phase_close_date",
            "logo_props",
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
            "stage_detail",
            "category_detail",
            "status_detail",
            "hardware_level_detail",
            "structure_level_detail",
            "software_level_detail",
            "project_lead_detail",
            "test_lead_detail",
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
