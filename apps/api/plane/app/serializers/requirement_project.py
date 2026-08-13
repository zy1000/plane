# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import (
    MANUAL_STAGES,
    RequirementProject,
    RequirementProjectStage,
)

from .base import BaseSerializer
from .requirement import ROW_FIELDS, RequirementSerializer


class RequirementProjectSerializer(BaseSerializer):
    """需求 ↔ 项目关联行本身。响应用，全行只读 —— stage 的写入走
    RequirementProjectStageWriteSerializer + utils.set_manual_stage，不在这里改。"""

    class Meta:
        model = RequirementProject
        fields = [
            "id",
            "requirement",
            "project",
            "workspace",
            "stage",
            "sort_order",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "requirement",
            "project",
            "workspace",
            "stage",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class RequirementProjectStageWriteSerializer(serializers.Serializer):
    """PATCH 关联行：排序 + 人工设档。

    stage 白名单只有三个值。linked 与 released 刻意不在里面：前者是零事实时的
    基线、后者由发布单是否已发布决定，都不该手填。planned 收下不是因为它可以
    手填，而是它承担「撤销人工标记」—— set_manual_stage 写完立刻归一，没有迭代
    关联的会落回 linked。
    """

    sort_order = serializers.FloatField(required=False)
    stage = serializers.ChoiceField(
        choices=[*MANUAL_STAGES, RequirementProjectStage.PLANNED], required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide sort_order or stage.")
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
    """项目侧看到的一条需求：需求内容 + 本项目内的阶段。

    继承 RequirementSerializer 而不是另起一份，是为了让项目页与产品页拿到**同一份**
    行结构 —— 前端的网格、详情抽屉、内置列注册表可以原样复用。多出来的是来自
    关联行的注解：`stage` / `link_sort_order`，阶段推导依据
    （`latest_cycle_name` / `latest_release_name`，胶囊 tooltip 用）、
    `carryover`（已排期但迭代已结束 —— 顺延信号）、`stage_locked`（挂在在途发布单
    上，阶段下拉该禁用），以及所属产品的名字。
    """

    stage = serializers.SerializerMethodField()
    link_sort_order = serializers.SerializerMethodField()
    latest_cycle_name = serializers.SerializerMethodField()
    latest_release_name = serializers.SerializerMethodField()
    carryover = serializers.SerializerMethodField()
    stage_locked = serializers.SerializerMethodField()
    issue_count = serializers.SerializerMethodField()
    completed_issue_count = serializers.SerializerMethodField()
    cancelled_issue_count = serializers.SerializerMethodField()
    linked_cycle_ids = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)
    # 标识（ECOM）与名字一起给：项目页把所属产品渲染成 chip，光有名字画不出徽标
    product_identifier = serializers.CharField(source="product.identifier", read_only=True)

    class Meta(RequirementSerializer.Meta):
        fields = ROW_FIELDS + [
            "stage",
            "link_sort_order",
            "latest_cycle_name",
            "latest_release_name",
            "carryover",
            "stage_locked",
            "issue_count",
            "completed_issue_count",
            "cancelled_issue_count",
            "linked_cycle_ids",
            "product_name",
            "product_identifier",
        ]
        read_only_fields = fields

    def get_stage(self, obj):
        return getattr(obj, "stage", None)

    def get_link_sort_order(self, obj):
        return getattr(obj, "link_sort_order", None)

    def get_latest_cycle_name(self, obj):
        return getattr(obj, "latest_cycle_name", None)

    def get_latest_release_name(self, obj):
        return getattr(obj, "latest_release_name", None)

    def get_carryover(self, obj):
        # 顺延 = 排了期、迭代结束了、却还没标研发完毕。阶段值刻意不动
        # （时间盒到期不是进度事实），黄标是给人看的排期信号
        return bool(
            getattr(obj, "stage", None) == RequirementProjectStage.PLANNED
            and getattr(obj, "has_completed_cycle", False)
        )

    def get_stage_locked(self, obj):
        # 缺注解时按「未锁」返回：容器列表等不带这个注解的场景本来也不给编辑入口，
        # 真要越过前端写进来，set_manual_stage 还会再挡一道
        return bool(getattr(obj, "stage_locked", False))

    def get_issue_count(self, obj):
        # 工作项三元组由 linked_requirements_queryset 注解提供，完成率 =
        # completed / (issue_count − cancelled) 由前端算，这里只给分子分母。
        # 缺注解按零回落 —— 零工作项语义恰好是「研发段仍手填」，下拉不被误禁
        return getattr(obj, "issue_count", 0) or 0

    def get_completed_issue_count(self, obj):
        return getattr(obj, "completed_issue_count", 0) or 0

    def get_cancelled_issue_count(self, obj):
        return getattr(obj, "cancelled_issue_count", 0) or 0

    def get_linked_cycle_ids(self, obj):
        # 「拆分工作项」弹窗恰好一个未取消迭代时预填；多个不猜。注解给的是
        # UUID 列表，响应里统一转字符串
        return [str(item) for item in (getattr(obj, "linked_cycle_ids", None) or [])]
