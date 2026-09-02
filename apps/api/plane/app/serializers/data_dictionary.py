import re

from rest_framework import serializers

from plane.db.models import DataDictionary, DataDictionaryItem

from .base import BaseSerializer

# 小写字母开头，仅小写字母 / 数字 / 下划线，≤64。与前端 DATA_DICTIONARY_KEY_PATTERN 一致。
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
# 字典值颜色：预设色 key 或 #rrggbb。与前端 DATA_DICTIONARY_COLOR_KEYS（packages/constants）一致。
DATA_DICTIONARY_COLOR_KEYS = ("gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink")
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


class DataDictionaryItemLiteSerializer(BaseSerializer):
    """产品 / 项目表单与列表用：id / label / dictionary / color，外加所属字典的彩色开关。"""

    # 消费方只拿到 *_detail、没有字典头，把开关冗余进来。
    # 调用方 queryset 需 select_related("xxx__dictionary")，否则每行多一条查询。
    is_colored = serializers.BooleanField(source="dictionary.is_colored", read_only=True)

    class Meta:
        model = DataDictionaryItem
        fields = ["id", "label", "dictionary", "color", "is_colored"]
        read_only_fields = ["id", "label", "dictionary", "color"]


class DataDictionaryItemSerializer(BaseSerializer):
    label = serializers.CharField(max_length=255)
    color = serializers.CharField(max_length=255, required=False, allow_blank=True)
    sort_order = serializers.FloatField(required=False)

    class Meta:
        model = DataDictionaryItem
        fields = [
            "id",
            "dictionary",
            "workspace",
            "label",
            "color",
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

    def validate_color(self, value):
        color = value.strip()
        if not color or color in DATA_DICTIONARY_COLOR_KEYS:
            return color
        if HEX_COLOR_PATTERN.match(color):
            return color.lower()
        raise serializers.ValidationError("DATA_DICTIONARY_ITEM_COLOR_INVALID")


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
            "is_colored",
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
