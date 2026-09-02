# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import ProductProject, RequirementItemStatus

from .base import BaseSerializer
from .project import ProjectLiteSerializer


class ProductProjectSerializer(BaseSerializer):
    """产品 ↔ 项目关联行。

    两端各自的详情都平铺出来：项目侧的「关联产品」列表要产品名与标识，产品侧的
    「关联项目」tab 要项目名与图标，一个序列化器两边都够用。
    """

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_identifier = serializers.CharField(
        source="product.identifier", read_only=True
    )
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_logo_props = serializers.JSONField(
        source="product.logo_props", read_only=True
    )
    project_detail = ProjectLiteSerializer(source="project", read_only=True)
    status_counts = serializers.SerializerMethodField()
    requirement_count = serializers.SerializerMethodField()

    class Meta:
        model = ProductProject
        fields = [
            "id",
            "product",
            "project",
            "workspace",
            "product_name",
            "product_identifier",
            "product_code",
            "product_logo_props",
            "project_detail",
            "requirement_count",
            "status_counts",
            "created_at",
            "created_by",
        ]
        # 关联行没有可改的属性 —— 建立与解除就是它的全部生命周期，
        # 写入一律走批量端点的 {products, removed_products} 数组。
        read_only_fields = fields

    def _counts(self, obj):
        """这条关联上有多少需求、各状态各多少（需求级状态，跨项目共享）。

        context["status_counts"] 由视图一次分组查询喂进来。产品侧按 project_id 分桶
        （utils/requirement_project.status_counts_by_project），项目侧按 product_id
        分桶（status_counts_by_product），用 context["status_counts_by"] = "product"
        切换取桶的键。拿不到就返回全 0 而不是报错。
        """
        counts = self.context.get("status_counts") or {}
        key = (
            obj.product_id
            if self.context.get("status_counts_by") == "product"
            else obj.project_id
        )
        return counts.get(str(key))

    def get_status_counts(self, obj):
        return self._counts(obj) or {}

    def get_requirement_count(self, obj):
        counts = self._counts(obj)
        if not counts:
            return 0
        # 只累计五个状态键：bucket 里另有 issue_total 等工作项聚合键（见
        # status_counts_by_project），对整个 dict 求和会把工作项数算进需求数
        return sum(counts.get(value, 0) for value in RequirementItemStatus.values)
