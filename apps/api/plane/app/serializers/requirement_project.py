# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import RequirementItemStatus

from .requirement import ROW_FIELDS, RequirementSerializer


class RequirementProjectLinkWriteSerializer(serializers.Serializer):
    """PATCH 项目侧的一条需求：关联行的排序 + 需求级交付状态。

    sort_order 写在关联行上（项目内排序）；status 写在需求本体上（跨项目共享一份，
    经 utils/requirement_project.set_requirement_status），五值任意方向可改，
    closed → 任意非 closed 值即重开。
    """

    sort_order = serializers.FloatField(required=False)
    status = serializers.ChoiceField(
        choices=RequirementItemStatus.choices, required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide sort_order or status.")
        return attrs


class MultiProductRequirementSerializer(RequirementSerializer):
    """一批可能横跨多个产品的需求行。

    基类的 `display_id` 从 `context["scope_identifier"]` 取一个**常量**前缀 —— 那对
    产品页成立（一个 RowLayer 只服务一个产品），对项目页不成立：一个项目可以同时引用
    多个产品的需求，同一页里混着 ECOM-1 和 PAY-3。所以这里改成按 product_id 逐行查
    映射表，映射表由视图按当前页的行批量解析（见 project.py::scope_identifier_map）。
    """

    def get_display_id(self, obj):
        # scope_identifiers: {product_id: identifier}
        prefix = (self.context.get("scope_identifiers") or {}).get(str(obj.product_id))
        if not prefix or obj.sequence_id is None:
            return None
        return f"{prefix}-{obj.sequence_id}"


class ProjectRequirementSerializer(MultiProductRequirementSerializer):
    """项目侧看到的一条需求：需求内容（含需求级 status）+ 本项目内的关联信息。

    继承 RequirementSerializer 而不是另起一份，是为了让项目页与产品页拿到**同一份**
    行结构 —— 前端的网格、详情抽屉、内置列注册表可以原样复用。多出来的是来自
    关联行的注解：`link_sort_order`、`latest_release_name`（目标发布 chip）、
    工作项三元组（工作项数 + 完成率）、`linked_cycle_ids`，以及所属产品的名字。
    """

    link_sort_order = serializers.SerializerMethodField()
    latest_release_name = serializers.SerializerMethodField()
    issue_count = serializers.SerializerMethodField()
    completed_issue_count = serializers.SerializerMethodField()
    cancelled_issue_count = serializers.SerializerMethodField()
    linked_cycle_ids = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)
    # 标识（ECOM）与名字一起给：项目页把所属产品渲染成 chip，光有名字画不出徽标
    product_identifier = serializers.CharField(source="product.identifier", read_only=True)

    class Meta(RequirementSerializer.Meta):
        fields = ROW_FIELDS + [
            "link_sort_order",
            "latest_release_name",
            "issue_count",
            "completed_issue_count",
            "cancelled_issue_count",
            "linked_cycle_ids",
            "product_name",
            "product_identifier",
        ]
        read_only_fields = fields

    def get_link_sort_order(self, obj):
        return getattr(obj, "link_sort_order", None)

    def get_latest_release_name(self, obj):
        return getattr(obj, "latest_release_name", None)

    def get_issue_count(self, obj):
        # 工作项三元组由 linked_requirements_queryset 注解提供，完成率 =
        # completed / (issue_count − cancelled) 由前端算，这里只给分子分母。
        return getattr(obj, "issue_count", 0) or 0

    def get_completed_issue_count(self, obj):
        return getattr(obj, "completed_issue_count", 0) or 0

    def get_cancelled_issue_count(self, obj):
        return getattr(obj, "cancelled_issue_count", 0) or 0

    def get_linked_cycle_ids(self, obj):
        # 「拆分工作项」弹窗恰好一个未取消迭代时预填；多个不猜。注解给的是
        # UUID 列表，响应里统一转字符串
        return [str(item) for item in (getattr(obj, "linked_cycle_ids", None) or [])]
