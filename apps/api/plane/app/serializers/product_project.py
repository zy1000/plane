# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import ProductProject

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
    project_detail = ProjectLiteSerializer(source="project", read_only=True)
    stage_counts = serializers.SerializerMethodField()
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
            "project_detail",
            "requirement_count",
            "stage_counts",
            "created_at",
            "created_by",
        ]
        # 关联行没有可改的属性 —— 建立与解除就是它的全部生命周期，
        # 写入一律走批量端点的 {products, removed_products} 数组。
        read_only_fields = fields

    def _counts(self, obj):
        """本产品有多少需求进了这个项目，各阶段各多少。

        context["stage_counts"] 由视图一次分组查询喂进来（见
        utils/requirement_project.stage_counts_by_project）。拿不到就返回全 0 而不是
        报错 —— 项目侧那份 ProductProjectSerializer 不需要统计，不该被这两个字段拖着
        多打一次查询。
        """
        return (self.context.get("stage_counts") or {}).get(str(obj.project_id))

    def get_stage_counts(self, obj):
        return self._counts(obj) or {}

    def get_requirement_count(self, obj):
        counts = self._counts(obj)
        return sum(counts.values()) if counts else 0
