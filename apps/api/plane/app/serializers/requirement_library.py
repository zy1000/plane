from rest_framework import serializers

from plane.app.serializers.product import IDENTIFIER_PATTERN
from plane.db.models import RequirementLibrary, RequirementType

from .base import BaseSerializer


class RequirementLibrarySerializer(BaseSerializer):
    workspace_id = serializers.UUIDField(read_only=True)
    requirement_type_id = serializers.PrimaryKeyRelatedField(
        source="requirement_type",
        queryset=RequirementType.objects.all(),
    )
    requirement_type_detail = serializers.SerializerMethodField()
    name = serializers.CharField(max_length=255, required=False)
    # 与 name 一样 required=False + 在 validate() 里补必填校验，这样 PATCH 只改
    # description 时不用把标识一起传上来
    identifier = serializers.CharField(max_length=12, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    field_count = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = RequirementLibrary
        fields = [
            "id",
            "workspace_id",
            "requirement_type_id",
            "requirement_type_detail",
            "name",
            # 库内条目编号的前缀（SEC-12），也是导入后目标行溯源显示的前缀。
            # 可改 —— 前缀是读时解析的，改完已导入需求的来源编号自动跟随。
            "identifier",
            "description",
            "field_count",
            "item_count",
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
            "requirement_type_detail",
            "field_count",
            "item_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_requirement_type_detail(self, obj):
        return {
            "id": str(obj.requirement_type_id),
            "name": obj.requirement_type.name,
            "logo_props": obj.requirement_type.logo_props or {},
        }

    def get_field_count(self, obj):
        annotated_count = getattr(obj, "field_count", None)
        if annotated_count is not None:
            return annotated_count
        return obj.requirement_type.fields.count()

    def get_item_count(self, obj):
        annotated_count = getattr(obj, "item_count", None)
        if annotated_count is not None:
            return annotated_count
        return obj.items.count()

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Library name cannot be empty.")
        return name

    def validate_identifier(self, value):
        # 归一化排在任何查重之前。这里尤其要紧：create/update 会调 full_clean()，
        # 而 full_clean 的 validate_constraints 跑在 save() 之前 —— 只靠模型 save()
        # 里的 upper() 的话，提交 "sec" 会被放行，然后在 INSERT 时撞已有的 "SEC"。
        identifier = (value or "").strip().upper()
        if not IDENTIFIER_PATTERN.match(identifier):
            raise serializers.ValidationError("REQUIREMENT_LIBRARY_IDENTIFIER_INVALID")
        return identifier

    def validate(self, attrs):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError({"workspace": "Workspace is required."})

        # 库内条目都以需求类型的字段 ID 为 key，换类型会让存量数据全部失效
        if self.instance and "requirement_type_id" in self.initial_data:
            submitted = attrs.pop("requirement_type", None)
            if getattr(submitted, "id", None) != self.instance.requirement_type_id:
                raise serializers.ValidationError(
                    {
                        "requirement_type_id": "This field cannot be changed after creation."
                    }
                )

        requirement_type = attrs.get(
            "requirement_type", getattr(self.instance, "requirement_type", None)
        )
        if requirement_type is not None and requirement_type.workspace_id != workspace.id:
            raise serializers.ValidationError(
                {
                    "requirement_type_id": "Requirement type does not belong to this workspace."
                }
            )

        name = attrs.get("name", getattr(self.instance, "name", None))
        if not name:
            raise serializers.ValidationError({"name": "This field is required."})
        duplicates = RequirementLibrary.objects.filter(
            workspace=workspace,
            name=name,
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                {"name": "A requirement library with this name already exists."}
            )

        identifier = attrs.get(
            "identifier", getattr(self.instance, "identifier", None)
        )
        if not identifier:
            raise serializers.ValidationError(
                {"identifier": "This field is required."}
            )
        identifier_duplicates = RequirementLibrary.objects.filter(
            workspace=workspace,
            identifier=identifier,
        )
        if self.instance:
            identifier_duplicates = identifier_duplicates.exclude(pk=self.instance.pk)
        if identifier_duplicates.exists():
            raise serializers.ValidationError(
                {"identifier": "REQUIREMENT_LIBRARY_IDENTIFIER_ALREADY_EXISTS"}
            )
        return attrs

    def create(self, validated_data):
        library = RequirementLibrary(**validated_data)
        library.full_clean(exclude=["created_by", "updated_by"])
        library.save()
        return library

    def update(self, instance, validated_data):
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)
        instance.full_clean(exclude=["created_by", "updated_by"])
        instance.save()
        return instance
