from rest_framework import serializers

from plane.db.models import IssueScheme

from .base import BaseSerializer


class IssueSchemeLiteSerializer(BaseSerializer):
    """挂在项目上的只读方案信息。

    ``is_project_owned`` 为 false 即「跟随研发模式」：项目设置的类型 / 状态 / 工作流三页
    据此决定能不能编辑（批次 4）。批次 1 起所有存量项目都是 true。
    """

    is_project_owned = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueScheme
        fields = ["id", "name", "is_project_owned"]
        read_only_fields = fields
