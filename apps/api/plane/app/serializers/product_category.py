from rest_framework import serializers

from plane.db.models import ProductCategory, ProductCategoryModule
from plane.db.models.product_category import (
    MODULE_KIND_CHOICES,
    MODULE_KIND_REQUIREMENT,
)


class ProductCategoryWriteSerializer(serializers.Serializer):
    """分类的创建 / 改名。输出不走它：响应由 utils.product_category.build_category_payloads 装配。"""

    name = serializers.CharField(max_length=255)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("PRODUCT_CATEGORY_NAME_REQUIRED")
        queryset = ProductCategory.objects.filter(
            workspace=self.context["workspace"], name=name
        )
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_CATEGORY_NAME_ALREADY_EXISTS")
        return name


class ProductCategoryModuleWriteSerializer(serializers.Serializer):
    """分类一级模块的新增 / 改名。长度与 RequirementModule.name 一致（会同步成库的根模块名）。

    ``kind`` 只在新增时生效（需求 / 用例哪份清单，缺省需求）；改名沿用模块自己的清单。
    同一分类同一份清单内不重名，两份清单之间可以重名。
    """

    name = serializers.CharField(max_length=30)
    kind = serializers.ChoiceField(
        choices=MODULE_KIND_CHOICES, default=MODULE_KIND_REQUIREMENT
    )

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("PRODUCT_CATEGORY_MODULE_NAME_REQUIRED")
        return name

    def validate(self, attrs):
        kind = self.instance.kind if self.instance is not None else attrs["kind"]
        queryset = ProductCategoryModule.objects.filter(
            category=self.context["category"], kind=kind, name=attrs["name"]
        )
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                {"name": ["PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS"]}
            )
        return attrs
