"""工作项的四个关联 id 数组（label_ids / assignee_ids / module_ids / release_ids）。

每个数组一条关联子查询，主查询保持一行一个工作项、不分组。
旧写法把四张关联表一起 LEFT JOIN 再 ArrayAgg + GROUP BY：行数按「标签数 × 负责人数 ×
负责人参与的项目数 × 模块数 × 发布数」相乘，统计信息缺失时规划器会把一行估成上百万行
（部署库实测估算成本 1400 万），触发 PostgreSQL JIT，单次跳转详情要编译 3 秒。

口径与旧写法逐条一致：只取未软删的关联行；负责人默认要求在任一项目有有效成员身份
（project_members 不看软删，照旧）；模块 / 发布排除已归档；数组去重、按 id 升序，没有时为空数组。

注意：主查询不再 GROUP BY，筛选条件若 JOIN 了多值关联（标签、负责人等）会出重复行，
这种查询要自己带 `.distinct()`。
"""

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import OuterRef, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce

# Module imports
from plane.db.models import (
    DraftIssueAssignee,
    DraftIssueLabel,
    DraftIssueModule,
    IssueAssignee,
    IssueLabel,
    ModuleIssue,
    ReleaseIssue,
)


def _id_array(queryset, owner, field):
    return Coalesce(
        Subquery(
            queryset.order_by()
            .values(owner)
            .annotate(arr=ArrayAgg(field, distinct=True))
            .values("arr")
        ),
        Value([], output_field=ArrayField(UUIDField())),
    )


def issue_id_array_annotations(*names, issue_ref="id", active_assignees_only=True):
    """返回可直接 `.annotate(**...)` 的数组注解。

    names：只要其中几个时按名字传，不传就是四个全给；
    issue_ref：外层查询里工作项主键的字段名，从收集箱等外层表出发时传 "issue_id"；
    active_assignees_only：负责人是否要求在任一项目有有效成员身份。收集箱有几处旧写法没有这个条件，传 False 照旧。
    """
    issue = OuterRef(issue_ref)
    assignees = IssueAssignee.objects.filter(issue_id=issue, assignee_id__isnull=False)
    if active_assignees_only:
        assignees = assignees.filter(assignee__member_project__is_active=True)
    annotations = {
        "label_ids": _id_array(
            IssueLabel.objects.filter(issue_id=issue, label_id__isnull=False),
            "issue_id",
            "label_id",
        ),
        "assignee_ids": _id_array(assignees, "issue_id", "assignee_id"),
        "module_ids": _id_array(
            ModuleIssue.objects.filter(
                issue_id=issue,
                module_id__isnull=False,
                module__archived_at__isnull=True,
            ),
            "issue_id",
            "module_id",
        ),
        "release_ids": _id_array(
            ReleaseIssue.objects.filter(
                issue_id=issue,
                release_id__isnull=False,
                release__archived_at__isnull=True,
            ),
            "issue_id",
            "release_id",
        ),
    }
    return {name: annotations[name] for name in names} if names else annotations


def draft_issue_id_array_annotations():
    """草稿工作项的 label_ids / assignee_ids / module_ids，口径同上（草稿没有发布数组）。"""
    draft = OuterRef("id")
    return {
        "label_ids": _id_array(
            DraftIssueLabel.objects.filter(draft_issue_id=draft, label_id__isnull=False),
            "draft_issue_id",
            "label_id",
        ),
        "assignee_ids": _id_array(
            DraftIssueAssignee.objects.filter(
                draft_issue_id=draft,
                assignee_id__isnull=False,
                assignee__member_project__is_active=True,
            ),
            "draft_issue_id",
            "assignee_id",
        ),
        "module_ids": _id_array(
            DraftIssueModule.objects.filter(
                draft_issue_id=draft,
                module_id__isnull=False,
                module__archived_at__isnull=True,
            ),
            "draft_issue_id",
            "module_id",
        ),
    }
