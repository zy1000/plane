from rest_framework import serializers

from plane.db.models import CaseRepositoryModule
from plane.utils.case_repository_module import expand_repository_module_subtree_ids


class CaseRepositoryModuleSerializer(serializers.ModelSerializer):
    """模块的平铺输出（创建 / 更新 / 移动的响应）。树形读取走 build_repository_module_tree_payload。"""

    class Meta:
        model = CaseRepositoryModule
        fields = ["id", "name", "parent", "sort_order", "created_at", "updated_at"]
        read_only_fields = fields


class CaseRepositoryModuleWriteSerializer(serializers.ModelSerializer):
    """模块的创建 / 重命名 / 换父 / 排序。

    产品由视图注入 save()，不信任请求体；context["product_id"] 划定父模块的可选范围。
    同级重名由 DB 条件唯一约束兜底（视图捕 IntegrityError）。
    """

    class Meta:
        model = CaseRepositoryModule
        fields = ["name", "parent", "sort_order"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("模块名称不能为空。")
        return value

    def validate_parent(self, value):
        if value is None:
            return value
        if value.product_id != self.context["product_id"]:
            raise serializers.ValidationError("父模块必须属于同一个产品。")
        # 换父防环：新父不能落在自己（含自身）的子树里
        if self.instance is not None and str(value.id) in set(
            expand_repository_module_subtree_ids(self.instance.id)
        ):
            raise serializers.ValidationError("父模块不能是自身或自己的子模块。")
        return value


class CaseRepositoryModuleMoveSerializer(serializers.Serializer):
    """拖拽移动模块：改父级，并按锚点插到同级的前 / 后（无锚点追加到末尾）。

    校验通过后 validated_data 里是模型实例：module / target_parent / anchor。
    """

    module_id = serializers.UUIDField()
    target_parent_id = serializers.UUIDField(required=False, allow_null=True)
    anchor_id = serializers.UUIDField(required=False, allow_null=True)
    placement = serializers.ChoiceField(choices=["before", "after"], required=False, default="after")

    def _get_module(self, module_id, error):
        module = CaseRepositoryModule.objects.filter(id=module_id, product_id=self.context["product_id"]).first()
        if module is None:
            raise serializers.ValidationError({"error": error})
        return module

    def validate(self, attrs):
        module = self._get_module(attrs["module_id"], "模块不存在。")
        target_parent = None
        if attrs.get("target_parent_id"):
            target_parent = self._get_module(attrs["target_parent_id"], "目标模块不存在。")
            if str(target_parent.id) in set(expand_repository_module_subtree_ids(module.id)):
                raise serializers.ValidationError({"error": "不能移动到自身或自己的子模块下。"})
        anchor = None
        if attrs.get("anchor_id"):
            anchor = self._get_module(attrs["anchor_id"], "参照模块不存在。")
            if anchor.id == module.id or anchor.parent_id != (target_parent.id if target_parent else None):
                raise serializers.ValidationError({"error": "参照模块必须与目标位置同级。"})
        attrs.update(module=module, target_parent=target_parent, anchor=anchor)
        return attrs
