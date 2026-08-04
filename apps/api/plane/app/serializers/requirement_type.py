from django.db import transaction
from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import RequirementField, RequirementFieldType, RequirementType, User
from plane.utils.requirement import (
    ensure_builtin_fields,
    get_requirement_eligible_user_ids,
    sync_requirement_type_fields,
)

from .base import BaseSerializer
from .requirement import (
    RequirementConfigurationConflict,
    RequirementFieldNodeWriteSerializer,
    validate_requirement_leaf_value,
)


class RequirementTypeSerializer(BaseSerializer):
    workspace_id = serializers.UUIDField(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        required=False,
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    field_count = serializers.SerializerMethodField()
    library_count = serializers.SerializerMethodField()

    class Meta:
        model = RequirementType
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "owner_id",
            "owner_detail",
            "field_count",
            "library_count",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "owner_detail",
            "field_count",
            "library_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_field_count(self, obj):
        annotated_count = getattr(obj, "field_count", None)
        return annotated_count if annotated_count is not None else obj.fields.count()

    def get_library_count(self, obj):
        annotated_count = getattr(obj, "library_count", None)
        return annotated_count if annotated_count is not None else obj.libraries.count()

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Requirement type name cannot be empty.")
        return name

    def validate(self, attrs):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError({"workspace": "Workspace is required."})

        name = attrs.get("name", getattr(self.instance, "name", None))
        if not name:
            raise serializers.ValidationError({"name": "This field is required."})
        duplicates = RequirementType.objects.filter(workspace=workspace, name=name)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                {"name": "A requirement type with this name already exists."}
            )

        owner = attrs.get("owner", getattr(self.instance, "owner", None))
        if owner is None:
            request = self.context.get("request")
            owner = getattr(request, "user", None)
            if owner is None or owner.is_anonymous:
                raise serializers.ValidationError({"owner_id": "Owner is required."})
            attrs["owner"] = owner

        # 工作区级资源，没有产品/项目作用域，口径就是「工作区成员」
        eligible_owner_ids = get_requirement_eligible_user_ids(
            workspace_id=workspace.id,
            user_ids=[owner.id],
        )
        if owner.id not in eligible_owner_ids:
            raise serializers.ValidationError(
                {"owner_id": "Owner must be a member of this workspace."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        requirement_type = RequirementType(**validated_data)
        requirement_type.full_clean(exclude=["created_by", "updated_by"])
        requirement_type.save()

        # 标题与描述是每个需求类型的硬性组成，建类型的同时就补上
        ensure_builtin_fields(requirement_type=requirement_type, actor=actor)
        return requirement_type

    def update(self, instance, validated_data):
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)
        instance.full_clean(exclude=["created_by", "updated_by"])
        instance.save()
        return instance


class RequirementTypeConfigurationWriteSerializer(serializers.Serializer):
    """需求类型的字段编辑入口。

    名称/描述与字段在同一次请求、同一把乐观锁下保存 —— 拆成两次请求会出现改名
    成功而字段保存 409 的半截状态。
    """

    expected_updated_at = serializers.DateTimeField()
    requirement_type = serializers.DictField(required=False)
    fields = RequirementFieldNodeWriteSerializer(many=True)
    confirm_data_loss = serializers.BooleanField(required=False, default=False)

    def validate_fields(self, value):
        names = [item["name"].casefold() for item in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError("Root field names must be unique.")

        requirement_type = self.context["requirement_type"]
        existing_ids = set(
            RequirementField.objects.filter(
                requirement_type=requirement_type
            ).values_list("id", flat=True)
        )
        submitted_ids = []
        for root in value:
            if root.get("id"):
                submitted_ids.append(root["id"])
            for child in root.get("children") or []:
                if child.get("id"):
                    submitted_ids.append(child["id"])
        if len(submitted_ids) != len(set(submitted_ids)):
            raise serializers.ValidationError("A field id cannot be submitted twice.")
        invalid_ids = set(submitted_ids).difference(existing_ids)
        if invalid_ids:
            raise serializers.ValidationError(
                "One or more fields do not belong to this requirement type."
            )

        for root in value:
            if root["field_type"] != RequirementFieldType.FORM:
                root["default_value"] = validate_requirement_leaf_value(
                    owner=requirement_type,
                    field=root,
                    value=root.get("default_value"),
                    enforce_required=False,
                )
            for child in root.get("children") or []:
                child["default_value"] = validate_requirement_leaf_value(
                    owner=requirement_type,
                    field=child,
                    value=child.get("default_value"),
                    enforce_required=False,
                )
        return value

    def validate_requirement_type(self, value):
        requirement_type = self.context["requirement_type"]
        serializer = RequirementTypeSerializer(
            requirement_type,
            data=value,
            partial=True,
            context={
                "request": self.context.get("request"),
                "workspace": self.context["workspace"],
            },
        )
        serializer.is_valid(raise_exception=True)
        self._requirement_type_serializer = serializer
        return value

    @transaction.atomic
    def save(self, **kwargs):
        requirement_type = (
            RequirementType.objects.select_for_update()
            .filter(
                id=self.context["requirement_type"].id,
                workspace=self.context["workspace"],
            )
            .first()
        )
        if requirement_type is None:
            raise serializers.ValidationError("Requirement type not found.")
        if requirement_type.updated_at != self.validated_data["expected_updated_at"]:
            raise RequirementConfigurationConflict

        serializer = getattr(self, "_requirement_type_serializer", None)
        if serializer is not None:
            serializer.instance = requirement_type
            requirement_type = serializer.save()

        request = self.context.get("request")
        created_field_ids = sync_requirement_type_fields(
            requirement_type=requirement_type,
            field_payloads=self.validated_data["fields"],
            actor=getattr(request, "user", None),
            confirm_data_loss=self.validated_data["confirm_data_loss"],
        )
        requirement_type.refresh_from_db()
        return requirement_type, created_field_ids
