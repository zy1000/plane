from rest_framework import serializers

from plane.db.models import ProductCategory, ProductCategoryModule


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
    """分类一级模块的新增 / 改名。长度与 RequirementModule.name 一致（会同步成库的根模块名）。"""

    name = serializers.CharField(max_length=30)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("PRODUCT_CATEGORY_MODULE_NAME_REQUIRED")
        queryset = ProductCategoryModule.objects.filter(
            category=self.context["category"], name=name
        )
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                "PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS"
            )
        return name
