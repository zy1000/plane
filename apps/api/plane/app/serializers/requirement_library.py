from rest_framework import serializers

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
