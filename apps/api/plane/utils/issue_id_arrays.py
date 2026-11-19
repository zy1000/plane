"""工作项的四个关联 id 数组（label_ids / assignee_ids / module_ids / release_ids）。

每个数组一条关联子查询，主查询保持一行一个工作项、不分组。
旧写法把四张关联表一起 LEFT JOIN 再 ArrayAgg + GROUP BY：行数按「标签数 × 负责人数 ×
负责人参与的项目数 × 模块数 × 发布数」相乘，统计信息缺失时规划器会把一行估成上百万行
（部署库实测估算成本 1400 万），触发 PostgreSQL JIT，单次跳转详情要编译 3 秒。

口径与旧写法逐条一致：只取未软删的关联行；负责人要求在任一项目有有效成员身份
（project_members 不看软删，照旧）；模块 / 发布排除已归档；数组去重、按 id 升序，没有时为空数组。
"""

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import OuterRef, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce

# Module imports
from plane.db.models import IssueAssignee, IssueLabel, ModuleIssue, ReleaseIssue


def _id_array(queryset, field):
    return Coalesce(
        Subquery(
            queryset.order_by()
            .values("issue_id")
            .annotate(arr=ArrayAgg(field, distinct=True))
            .values("arr")
        ),
        Value([], output_field=ArrayField(UUIDField())),
    )


def issue_id_array_annotations(issue_ref="id"):
    """返回可直接 `.annotate(**...)` 的四个数组注解；issue_ref 是外层工作项主键的字段名。"""
    issue = OuterRef(issue_ref)
    return {
        "label_ids": _id_array(
            IssueLabel.objects.filter(issue_id=issue, label_id__isnull=False),
            "label_id",
        ),
        "assignee_ids": _id_array(
            IssueAssignee.objects.filter(
                issue_id=issue,
                assignee_id__isnull=False,
                assignee__member_project__is_active=True,
            ),
            "assignee_id",
        ),
        "module_ids": _id_array(
            ModuleIssue.objects.filter(
                issue_id=issue,
                module_id__isnull=False,
                module__archived_at__isnull=True,
            ),
            "module_id",
        ),
        "release_ids": _id_array(
            ReleaseIssue.objects.filter(
                issue_id=issue,
                release_id__isnull=False,
                release__archived_at__isnull=True,
            ),
            "release_id",
        ),
    }
