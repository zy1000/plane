from rest_framework import serializers

from plane.db.models import RequirementModule
from plane.utils.requirement_module import expand_requirement_module_subtree_ids


class RequirementModuleSerializer(serializers.ModelSerializer):
    """模块的平铺输出（创建 / 更新的响应）。树形读取不走它 ——
    树 + 子树计数由 utils.requirement_module.build_module_tree_payload 一次装配。"""

    class Meta:
        model = RequirementModule
        fields = ["id", "name", "parent", "sort_order", "created_at", "updated_at"]
        read_only_fields = fields


class RequirementModuleWriteSerializer(serializers.ModelSerializer):
    """模块的创建 / 重命名 / 换父 / 排序。

    归属（库或产品）由视图注入 save()，不信任请求体；context["scope_filter"]
    划定父模块的可选范围。同级重名由 DB 条件唯一约束兜底（视图捕 IntegrityError）。
    """

    class Meta:
        model = RequirementModule
        fields = ["name", "parent", "sort_order"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("模块名称不能为空。")
        return value

    def validate_parent(self, value):
        if value is None:
            return value
        scope_filter = self.context["scope_filter"]
        if not RequirementModule.objects.filter(id=value.id, **scope_filter).exists():
            raise serializers.ValidationError("父模块必须属于同一个标准库或产品。")
        # 换父防环：新父不能落在自己（含自身）的子树里
        if self.instance is not None and str(value.id) in set(
            expand_requirement_module_subtree_ids(self.instance.id)
        ):
            raise serializers.ValidationError("父模块不能是自身或自己的子模块。")
        return value
