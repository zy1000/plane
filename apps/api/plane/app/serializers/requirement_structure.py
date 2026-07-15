from rest_framework import serializers

from plane.db.models import (
    RequirementFieldTemplate,
    RequirementStructuredDiffEntry,
    RequirementStructuredRevision,
)
from plane.utils.requirement_structure import (
    serialize_structured_field,
    serialize_structured_row,
    serialize_template_field,
)

from .base import BaseSerializer


class RequirementFieldTemplateSerializer(BaseSerializer):
    field_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RequirementFieldTemplate
        fields = [
            "id",
            "product",
            "name",
            "description",
            "template_type",
            "revision",
            "is_active",
            "field_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "product",
            "revision",
            "field_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_name(self, value):
        value = str(value or "").strip()
        if not value:
            raise serializers.ValidationError("REQUIREMENT_TEMPLATE_NAME_REQUIRED")
        product = self.context["product"]
        queryset = RequirementFieldTemplate.objects.filter(product=product, name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("REQUIREMENT_TEMPLATE_NAME_EXISTS")
        return value


class RequirementTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    template_type = serializers.ChoiceField(
        choices=RequirementFieldTemplate.TemplateType.choices,
        required=False,
        default=RequirementFieldTemplate.TemplateType.STRUCTURED,
    )
    is_active = serializers.BooleanField(required=False, default=True)
    revision = serializers.IntegerField(min_value=1, required=False)
    fields = serializers.ListField(child=serializers.JSONField(), allow_empty=True, required=False, default=list)

    def validate_name(self, value):
        product = self.context["product"]
        queryset = RequirementFieldTemplate.objects.filter(product=product, name=value)
        template = self.context.get("template")
        if template:
            queryset = queryset.exclude(pk=template.pk)
        if queryset.exists():
            raise serializers.ValidationError("REQUIREMENT_TEMPLATE_NAME_EXISTS")
        return value


class RequirementTemplateStatusSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=1)
    is_active = serializers.BooleanField()


class RequirementTemplateSchemaSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=1)
    fields = serializers.ListField(child=serializers.JSONField(), allow_empty=True)


class RequirementStructuredSchemaSerializer(serializers.Serializer):
    lock_version = serializers.IntegerField(min_value=1)
    fields = serializers.ListField(child=serializers.JSONField(), allow_empty=True)


class RequirementStructuredRowCreateSerializer(serializers.Serializer):
    lock_version = serializers.IntegerField(min_value=1)
    parent_row_key = serializers.UUIDField(required=False, allow_null=True)
    table_field_key = serializers.UUIDField(required=False, allow_null=True)
    before_row_key = serializers.UUIDField(required=False, allow_null=True)
    after_row_key = serializers.UUIDField(required=False, allow_null=True)
    values = serializers.DictField(child=serializers.JSONField(allow_null=True), required=False, default=dict)


class RequirementStructuredRowUpdateSerializer(serializers.Serializer):
    lock_version = serializers.IntegerField(min_value=1)
    values = serializers.DictField(child=serializers.JSONField(allow_null=True), required=True)


class RequirementStructuredRowReorderSerializer(serializers.Serializer):
    lock_version = serializers.IntegerField(min_value=1)
    before_row_key = serializers.UUIDField(required=False, allow_null=True)
    after_row_key = serializers.UUIDField(required=False, allow_null=True)


class RequirementStructuredRevisionSerializer(BaseSerializer):
    fields = serializers.SerializerMethodField(method_name="get_serialized_fields")

    class Meta:
        model = RequirementStructuredRevision
        fields = [
            "id",
            "requirement",
            "change",
            "source_revision",
            "source_template",
            "source_template_revision",
            "status",
            "lock_version",
            "schema_hash",
            "content_hash",
            "root_row_count",
            "child_row_count",
            "locked_at",
            "fields",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_serialized_fields(self, obj):
        fields = getattr(obj, "prefetched_fields", None)
        if fields is None:
            fields = obj.fields.select_related("parent_field").order_by("sort_key", "created_at")
        return [serialize_structured_field(field) for field in fields]


class RequirementStructuredRowSerializer(serializers.Serializer):
    def to_representation(self, instance):
        return serialize_structured_row(instance)


class RequirementStructuredDiffEntrySerializer(BaseSerializer):
    class Meta:
        model = RequirementStructuredDiffEntry
        fields = [
            "id",
            "scope",
            "change_type",
            "field_key",
            "row_key",
            "parent_row_key",
            "label",
            "before_value",
            "after_value",
            "sort_key",
        ]
        read_only_fields = fields


def serialize_template_schema(template):
    fields = template.fields.select_related("parent_field").order_by("sort_key", "created_at")
    return {
        "template_id": str(template.id),
        "revision": template.revision,
        "fields": [serialize_template_field(field) for field in fields],
    }
