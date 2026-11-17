from types import SimpleNamespace

from rest_framework import serializers

from plane.db.models import (
    RequirementField,
    RequirementFieldDefinition,
    RequirementFieldType,
)

from .requirement import (
    RequirementFieldNodeWriteSerializer,
    validate_requirement_leaf_value,
)


class RequirementFieldDefinitionWriteSerializer(RequirementFieldNodeWriteSerializer):
    """通用字段的写入口：一个根字段 + 可选的一层子字段（表单）。

    节点本身的规则（选项归一化、只有表单能带子字段、子字段不重名）继承自需求类型配置页
    用的同一个节点序列化器，两边的定义才不会各验各的。这里只补库自己的规则。

    context: workspace（必填）、definition（更新时）。
    """

    confirm_data_loss = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        workspace = self.context["workspace"]
        definition = self.context.get("definition")
        children = attrs.get("children") or []

        # 大小写不敏感：两个只差大小写的库字段绑进同一个类型会撞上类型内的重名校验
        duplicates = RequirementFieldDefinition.objects.filter(
            workspace=workspace, parent__isnull=True, name__iexact=attrs["name"]
        )
        if definition is not None:
            duplicates = duplicates.exclude(pk=definition.pk)
        if duplicates.exists():
            raise serializers.ValidationError({"name": "已有同名的通用字段。"})

        if definition is None:
            for child in children:
                child.pop("id", None)
        else:
            if (
                attrs["field_type"] != definition.field_type
                and RequirementField.objects.filter(library_field=definition).exists()
            ):
                raise serializers.ValidationError(
                    {"field_type": "该字段已被需求类型使用，不能更改字段类型。"}
                )
            child_ids = set(definition.children.values_list("id", flat=True))
            if any(child.get("id") and child["id"] not in child_ids for child in children):
                raise serializers.ValidationError({"children": "子字段不属于该通用字段。"})

        # 成员默认值要按工作区校验成员资格，owner 只需要带 workspace_id
        owner = SimpleNamespace(workspace_id=workspace.id)
        if attrs["field_type"] != RequirementFieldType.FORM:
            attrs["default_value"] = validate_requirement_leaf_value(
                owner=owner,
                field=attrs,
                value=attrs.get("default_value"),
                enforce_required=False,
            )
        for child in children:
            child["default_value"] = validate_requirement_leaf_value(
                owner=owner,
                field=child,
                value=child.get("default_value"),
                enforce_required=False,
            )
        return attrs
