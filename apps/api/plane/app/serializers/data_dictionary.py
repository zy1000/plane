import re

from rest_framework import serializers

from plane.db.models import DataDictionary, DataDictionaryItem

from .base import BaseSerializer

# 小写字母开头，仅小写字母 / 数字 / 下划线，≤64。与前端 DATA_DICTIONARY_KEY_PATTERN 一致。
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class DataDictionaryItemLiteSerializer(BaseSerializer):
    """产品表单 / 列表用：只要 id / label / dictionary。"""

    class Meta:
        model = DataDictionaryItem
        fields = ["id", "label", "dictionary"]
        read_only_fields = fields


class DataDictionaryItemSerializer(BaseSerializer):
    label = serializers.CharField(max_length=255)
    sort_order = serializers.FloatField(required=False)

    class Meta:
        model = DataDictionaryItem
        fields = [
            "id",
            "dictionary",
            "workspace",
            "label",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "dictionary", "workspace", "created_at", "updated_at"]

    def validate_label(self, value):
        label = value.strip()
        if not label:
            raise serializers.ValidationError("Label cannot be empty.")
        dictionary = self.context.get("dictionary")
        if dictionary is None and self.instance is not None:
            dictionary = self.instance.dictionary
        queryset = DataDictionaryItem.objects.filter(dictionary=dictionary, label=label)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("DATA_DICTIONARY_ITEM_ALREADY_EXISTS")
        return label


class DataDictionarySerializer(BaseSerializer):
    key = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    sort_order = serializers.FloatField(required=False)
    items = DataDictionaryItemSerializer(many=True, read_only=True)

    class Meta:
        model = DataDictionary
        fields = [
            "id",
            "workspace",
            "key",
            "name",
            "description",
            "is_system",
            "sort_order",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "is_system", "items", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # key 创建后不可改（系统 / 自定义一视同仁）：产品字段靠 key 找字典
        if self.instance is not None:
            self.fields["key"].read_only = True

    def _workspace(self):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        return workspace

    def validate_key(self, value):
        key = value.strip()
        if not KEY_PATTERN.match(key):
            raise serializers.ValidationError("DATA_DICTIONARY_KEY_INVALID")
        if DataDictionary.objects.filter(workspace=self._workspace(), key=key).exists():
            raise serializers.ValidationError("DATA_DICTIONARY_KEY_ALREADY_EXISTS")
        return key

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        queryset = DataDictionary.objects.filter(workspace=self._workspace(), name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("DATA_DICTIONARY_NAME_ALREADY_EXISTS")
        return name
