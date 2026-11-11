"""工作区设置 › 角色：列表计数、持有人、工作流引用、改名影响与删除前清理。

角色 = 数据字典 ``job_role`` 的值；「按角色找人」的规则在 ``utils/job_role.py``，这里只服务设置页。
「看得见的引用」（下面四个 ``_visible_*``）是计数、详情页签和删除拦截的同一口径。
"""

from collections import defaultdict

from django.db.models import Count, Q

from plane.db.models import (
    DataDictionary,
    DataDictionaryItem,
    ProductTeamAssignment,
    ProjectMemberJobRole,
    StageReview,
    StageReviewStatus,
    StageReviewTemplate,
    WorkflowPrincipalKind,
    WorkflowTransitionPrincipal,
    WorkspaceMember,
    WorkspaceMemberJobRole,
)
from plane.utils.data_dictionary import SORT_ORDER_STEP
from plane.utils.job_role import job_role_items

#: 评审模板 / 评审里按角色名字存的三列（发起者 / 主导者 / 审核者）
ROLE_LABEL_FIELDS = ("initiator_role", "leader_role", "auditor_role")

EMPTY_USAGE = {
    "workspace_member_count": 0,
    "project_member_count": 0,
    "project_count": 0,
    "matrix_count": 0,
    "transition_count": 0,
    "workflow_count": 0,
}


def _visible_workspace_links(workspace_id):
    return WorkspaceMemberJobRole.objects.filter(
        workspace_id=workspace_id, member__is_active=True, member__deleted_at__isnull=True
    )


def _visible_project_links(workspace_id):
    return ProjectMemberJobRole.objects.filter(
        workspace_id=workspace_id,
        member__is_active=True,
        member__deleted_at__isnull=True,
        project__deleted_at__isnull=True,
    )


def _visible_matrix_links(workspace_id):
    return ProductTeamAssignment.objects.filter(
        workspace_id=workspace_id, project__deleted_at__isnull=True, product__deleted_at__isnull=True
    )


def _visible_principals(workspace_id):
    """启用中的「按角色」配置（停用 = 软删），所在流转 / 工作流 / 方案都还在。"""
    return WorkflowTransitionPrincipal.objects.filter(
        kind=WorkflowPrincipalKind.ROLE,
        transition__workspace_id=workspace_id,
        transition__deleted_at__isnull=True,
        transition__workflow__deleted_at__isnull=True,
        transition__scheme__deleted_at__isnull=True,
    ).filter(Q(transition__scheme__project__isnull=True) | Q(transition__scheme__project__deleted_at__isnull=True))


def role_usage(workspace_id, role_ids=None):
    """{角色 id: 计数}。项目成员按人去重，另给项目数；工作流引用按流转去重，另给工作流数。"""
    usage = defaultdict(lambda: dict(EMPTY_USAGE))

    def scoped(queryset):
        return queryset.filter(job_role_id__in=list(role_ids)) if role_ids is not None else queryset

    for row in (
        scoped(_visible_workspace_links(workspace_id))
        .values("job_role_id")
        .annotate(count=Count("member__member_id", distinct=True))
    ):
        usage[str(row["job_role_id"])]["workspace_member_count"] = row["count"]
    for row in (
        scoped(_visible_project_links(workspace_id))
        .values("job_role_id")
        .annotate(people=Count("member__member_id", distinct=True), projects=Count("project_id", distinct=True))
    ):
        usage[str(row["job_role_id"])]["project_member_count"] = row["people"]
        usage[str(row["job_role_id"])]["project_count"] = row["projects"]
    for row in scoped(_visible_matrix_links(workspace_id)).values("job_role_id").annotate(count=Count("id")):
        usage[str(row["job_role_id"])]["matrix_count"] = row["count"]
    for row in (
        scoped(_visible_principals(workspace_id))
        .values("job_role_id")
        .annotate(
            transitions=Count("transition_id", distinct=True),
            workflows=Count("transition__workflow_id", distinct=True),
        )
    ):
        usage[str(row["job_role_id"])]["transition_count"] = row["transitions"]
        usage[str(row["job_role_id"])]["workflow_count"] = row["workflows"]
    return usage


def is_role_in_use(usage):
    return any(
        usage[key] > 0
        for key in ("workspace_member_count", "project_member_count", "matrix_count", "transition_count")
    )


def role_payload(item, usage):
    return {
        "id": str(item.id),
        "label": item.label,
        "color": item.color,
        "sort_order": item.sort_order,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "updated_by_id": str(item.updated_by_id) if item.updated_by_id else None,
        **usage,
    }


def list_roles(workspace_id):
    usage = role_usage(workspace_id)
    return [role_payload(item, usage[str(item.id)]) for item in job_role_items(workspace_id)]


def get_role(workspace_id, role_id):
    return job_role_items(workspace_id).filter(pk=role_id).first()


def role_detail(item):
    return role_payload(item, role_usage(item.workspace_id, [item.id])[str(item.id)])


def mark_roles_colored(dictionary):
    """角色页总按颜色显示；角色字典已不在数据字典页露出，彩色开关一并打开，成员表等处才跟角色页一致。"""
    DataDictionary.objects.filter(pk=dictionary.pk, is_colored=False).update(is_colored=True)


def reorder_roles(workspace_id, ordered_ids):
    """按传入顺序重排；没传到的角色接在后面，保持原有相对顺序。"""
    items = list(job_role_items(workspace_id))
    by_id = {str(item.id): item for item in items}
    wanted = [by_id[value] for value in dict.fromkeys(str(value) for value in ordered_ids) if value in by_id]
    seen = {item.id for item in wanted}
    ordered = wanted + [item for item in items if item.id not in seen]
    for index, item in enumerate(ordered):
        item.sort_order = (index + 1) * SORT_ORDER_STEP
    DataDictionaryItem.objects.bulk_update(ordered, ["sort_order"])


def project_members(workspace_id, role_id):
    """本角色在各项目里的持有人：[{project, member_ids}]，按项目名排。"""
    grouped = {}
    rows = (
        _visible_project_links(workspace_id)
        .filter(job_role_id=role_id)
        .values("project_id", "project__name", "project__identifier", "project__code", "member__member_id")
        .order_by("project__name", "created_at")
    )
    for row in rows:
        project_id = str(row["project_id"])
        entry = grouped.setdefault(
            project_id,
            {
                "project": {
                    "id": project_id,
                    "name": row["project__name"],
                    "identifier": row["project__identifier"],
                    "code": row["project__code"] or "",
                },
                "member_ids": [],
            },
        )
        member_id = str(row["member__member_id"])
        if member_id not in entry["member_ids"]:
            entry["member_ids"].append(member_id)
    return list(grouped.values())


def _state(state):
    return {"id": str(state.id), "name": state.name, "color": state.color}


def workflow_references(workspace_id, role_id):
    """本角色出现在哪些工作流流转上（发起人 / 目标负责人 / 审批人）。"""
    principals = (
        _visible_principals(workspace_id)
        .filter(job_role_id=role_id)
        .select_related(
            "transition__workflow__issue_type",
            "transition__scheme__project",
            "transition__from_state",
            "transition__to_state",
        )
        .order_by("transition__workflow__name", "transition__workflow_id", "transition__created_at", "dimension")
    )
    rows = []
    for principal in principals:
        transition = principal.transition
        workflow = transition.workflow
        project = transition.scheme.project
        rows.append(
            {
                "id": str(principal.id),
                "dimension": principal.dimension,
                "workflow": {"id": str(workflow.id), "name": workflow.name, "is_active": workflow.is_active},
                "issue_type_name": workflow.issue_type.name if workflow.issue_type_id else "",
                # 项目方案的工作流在项目设置里改，类型库的在模板中心改
                "scope": (
                    {"kind": "project", "project_id": str(project.id), "name": project.name}
                    if project
                    else {"kind": "library", "project_id": None, "name": ""}
                ),
                "from_state": _state(transition.from_state),
                "to_state": _state(transition.to_state),
                "approval_type": transition.approval_type,
                "required_count": transition.required_count,
            }
        )
    return rows


def label_usage(item):
    """按角色**名字**引用它的地方（改名会对不上）：评审模板各列的处数、未完成的评审数。"""
    templates = StageReviewTemplate.objects.filter(workspace_id=item.workspace_id)
    template_counts = {field: templates.filter(**{field: item.label}).count() for field in ROLE_LABEL_FIELDS}
    label_match = Q()
    for field in ROLE_LABEL_FIELDS:
        label_match |= Q(**{field: item.label})
    open_reviews = (
        StageReview.objects.filter(workspace_id=item.workspace_id, project__deleted_at__isnull=True)
        .exclude(status=StageReviewStatus.COMPLETED)
        .filter(label_match)
        .count()
    )
    return {
        "review_templates": template_counts,
        "review_template_count": sum(template_counts.values()),
        "open_review_count": open_reviews,
    }


def add_workspace_members(workspace_id, item, user_ids):
    """给一批工作区成员挂上这个角色（已挂的跳过）；返回实际处理到的成员 user id。"""
    members = list(
        WorkspaceMember.objects.filter(
            workspace_id=workspace_id, member_id__in=list(user_ids), is_active=True, deleted_at__isnull=True
        )
    )
    existing = set(
        WorkspaceMemberJobRole.objects.filter(job_role=item, member__in=members).values_list("member_id", flat=True)
    )
    WorkspaceMemberJobRole.objects.bulk_create(
        [
            WorkspaceMemberJobRole(workspace_id=workspace_id, member=member, job_role=item)
            for member in members
            if member.id not in existing
        ]
    )
    return [str(member.member_id) for member in members]


def remove_workspace_member(workspace_id, item, user_id):
    WorkspaceMemberJobRole.objects.filter(
        workspace_id=workspace_id, job_role=item, member__member_id=user_id
    ).delete(soft=False)


def purge_hidden_links(item):
    """删除前清掉界面上看不到、但会被 PROTECT 挡住删除的引用行：软删的行、已停用成员、
    已删项目 / 产品 / 工作流里的配置。调用前必须已确认看得见的引用为 0。"""
    workspace_id = item.workspace_id
    for model, visible in (
        (WorkspaceMemberJobRole, _visible_workspace_links(workspace_id)),
        (ProjectMemberJobRole, _visible_project_links(workspace_id)),
        (ProductTeamAssignment, _visible_matrix_links(workspace_id)),
        (WorkflowTransitionPrincipal, _visible_principals(workspace_id)),
    ):
        visible_ids = visible.filter(job_role=item).values("id")
        model.all_objects.filter(job_role=item).exclude(id__in=visible_ids).delete()
