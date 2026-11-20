"""对象 → 通知上下文：标题、链接、对象上能直接取到的收件角色、订阅人。

发信（``emit``）和详情页的「通知对象」区块共用这一份，保证「界面上写的收件人」和
「实际发给谁」是同一个来源。
"""

from dataclasses import dataclass, field

from plane.db.models import (
    CaseReview,
    Cycle,
    Issue,
    IssueAssignee,
    IssueSubscriber,
    NotifySubscriber,
    ProjectStage,
    Release,
    ReleaseMember,
    Requirement,
    RequirementChangeRequest,
    ReviewTailoring,
    Risk,
    StageReview,
    TestPlan,
    User,
    Workspace,
)


@dataclass
class EntityContext:
    entity_type: str
    entity_id: object
    workspace_id: object
    workspace_slug: str
    project_id: object = None
    project_name: str = ""
    title: str = ""
    url_path: str = ""
    # 角色 → 用户 id 列表
    roles: dict = field(default_factory=dict)
    # [(用户 id, 接收方式)]
    subscribers: list = field(default_factory=list)


def _ids(*values):
    return [value for value in values if value]


def _slug(workspace_id):
    return Workspace.objects.filter(pk=workspace_id).values_list("slug", flat=True).first() or ""


def names_of(user_ids):
    """用户 id 列表 → 显示名列表（保持传入顺序，查不到的跳过）。"""
    ids = [user_id for user_id in (user_ids or []) if user_id]
    if not ids:
        return []
    rows = User.objects.filter(pk__in=ids).values("id", "display_name", "first_name", "last_name", "email")
    names = {
        str(row["id"]): row["display_name"] or f"{row['first_name']} {row['last_name']}".strip() or row["email"]
        for row in rows
    }
    return [names[str(user_id)] for user_id in ids if str(user_id) in names]


def object_subscribers(entity_type, entity_id):
    return list(
        NotifySubscriber.objects.filter(entity_type=entity_type, entity_id=entity_id).values_list(
            "subscriber_id", "mode"
        )
    )


def _project_roles(project):
    return {
        "project_lead": _ids(project.project_lead_id),
        "product_manager": _ids(project.product_manager_id),
    }


def _issue(entity_id):
    issue = Issue.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not issue:
        return None
    slug = issue.workspace.slug
    return EntityContext(
        entity_type="issue",
        entity_id=issue.id,
        workspace_id=issue.workspace_id,
        workspace_slug=slug,
        project_id=issue.project_id,
        project_name=issue.project.name,
        title=f"{issue.project.identifier}-{issue.sequence_id} {issue.name}",
        url_path=f"/{slug}/projects/{issue.project_id}/issues/{issue.id}",
        roles={
            "assignee": list(IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True)),
            "creator": _ids(issue.created_by_id),
        },
        subscribers=list(IssueSubscriber.objects.filter(issue_id=issue.id).values_list("subscriber_id", "mode")),
    )


def _cycle(entity_id):
    cycle = Cycle.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not cycle:
        return None
    slug = cycle.workspace.slug
    roles = _project_roles(cycle.project)
    roles["owner"] = _ids(cycle.owned_by_id)
    # 迭代没有成员名单，侧栏展示的「成员」就是迭代内工作项的负责人
    roles["member"] = list(
        IssueAssignee.objects.filter(issue__issue_cycle__cycle_id=cycle.id, issue__issue_cycle__deleted_at__isnull=True)
        .values_list("assignee_id", flat=True)
        .distinct()
    )
    return EntityContext(
        entity_type="cycle",
        entity_id=cycle.id,
        workspace_id=cycle.workspace_id,
        workspace_slug=slug,
        project_id=cycle.project_id,
        project_name=cycle.project.name,
        title=cycle.name,
        url_path=f"/{slug}/projects/{cycle.project_id}/cycles/{cycle.id}/overview",
        roles=roles,
        subscribers=object_subscribers("cycle", cycle.id),
    )


def _release(entity_id):
    release = Release.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not release:
        return None
    slug = release.workspace.slug
    roles = _project_roles(release.project)
    roles["owner"] = _ids(release.lead_id)
    roles["member"] = list(ReleaseMember.objects.filter(release_id=release.id).values_list("member_id", flat=True))
    return EntityContext(
        entity_type="release",
        entity_id=release.id,
        workspace_id=release.workspace_id,
        workspace_slug=slug,
        project_id=release.project_id,
        project_name=release.project.name,
        title=release.name,
        url_path=f"/{slug}/projects/{release.project_id}/releases/{release.id}/overview",
        roles=roles,
        subscribers=object_subscribers("release", release.id),
    )


def _risk(entity_id):
    risk = Risk.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not risk:
        return None
    slug = risk.workspace.slug
    return EntityContext(
        entity_type="risk",
        entity_id=risk.id,
        workspace_id=risk.workspace_id,
        workspace_slug=slug,
        project_id=risk.project_id,
        project_name=risk.project.name,
        title=f"{risk.code} {risk.name}".strip(),
        url_path=f"/{slug}/projects/{risk.project_id}/risks/{risk.id}",
        roles={
            "owner": _ids(risk.owner_id),
            "proposer": _ids(risk.proposer_id),
            "stakeholder": list(risk.stakeholders.values_list("id", flat=True)),
        },
    )


def _stage_review(entity_id):
    review = StageReview.objects.filter(pk=entity_id).select_related("project", "workspace", "stage").first()
    if not review:
        return None
    slug = review.workspace.slug
    return EntityContext(
        entity_type="stage_review",
        entity_id=review.id,
        workspace_id=review.workspace_id,
        workspace_slug=slug,
        project_id=review.project_id,
        project_name=review.project.name,
        title=f"{review.standard_code} {review.title}".strip(),
        url_path=f"/{slug}/projects/{review.project_id}/reviews/stage-reviews/{review.id}",
        roles={
            "leader": list(review.leaders.values_list("id", flat=True)),
            "auditor": list(review.auditors.values_list("id", flat=True)),
            "stage_owner": _ids(review.stage.owner_id if review.stage_id else None),
        },
        # 评审是流程单据，不设订阅人；结果知会给所属项目阶段的订阅人
        subscribers=object_subscribers("project_stage", review.stage_id) if review.stage_id else [],
    )


def _review_tailoring(entity_id):
    tailoring = ReviewTailoring.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not tailoring:
        return None
    slug = tailoring.workspace.slug
    return EntityContext(
        entity_type="review_tailoring",
        entity_id=tailoring.id,
        workspace_id=tailoring.workspace_id,
        workspace_slug=slug,
        project_id=tailoring.project_id,
        project_name=tailoring.project.name,
        title=tailoring.title,
        url_path=f"/{slug}/projects/{tailoring.project_id}/reviews/tailorings/{tailoring.id}",
    )


def _requirement_change(entity_id):
    change = RequirementChangeRequest.objects.filter(pk=entity_id).select_related("workspace", "project").first()
    if not change:
        return None
    slug = change.workspace.slug
    if change.product_id:
        url_path = f"/{slug}/products/{change.product_id}/requirements?tab=changes&cr={change.id}"
    elif change.project_id:
        url_path = f"/{slug}/projects/{change.project_id}/requirements?tab=changes&cr={change.id}"
    else:
        url_path = ""
    return EntityContext(
        entity_type="requirement_change",
        entity_id=change.id,
        workspace_id=change.workspace_id,
        workspace_slug=slug,
        project_id=change.project_id,
        project_name=change.project.name if change.project_id else "",
        title=f"需求变更单 CR-{change.sequence_id}",
        url_path=url_path,
    )


def _requirement(entity_id):
    requirement = Requirement.objects.filter(pk=entity_id).select_related("workspace").first()
    if not requirement:
        return None
    slug = requirement.workspace.slug
    return EntityContext(
        entity_type="requirement",
        entity_id=requirement.id,
        workspace_id=requirement.workspace_id,
        workspace_slug=slug,
        project_id=requirement.project_id,
        title=f"{requirement.code} {requirement.title}".strip(),
        url_path=(
            f"/{slug}/products/{requirement.product_id}/requirements?peek={requirement.id}"
            if requirement.product_id
            else ""
        ),
        roles={"assignee": _ids(requirement.assignee_id), "creator": _ids(requirement.created_by_id)},
        subscribers=object_subscribers("requirement", requirement.id),
    )


def _project_stage(entity_id):
    stage = ProjectStage.objects.filter(pk=entity_id).select_related("project", "workspace").first()
    if not stage:
        return None
    slug = stage.workspace.slug
    return EntityContext(
        entity_type="project_stage",
        entity_id=stage.id,
        workspace_id=stage.workspace_id,
        workspace_slug=slug,
        project_id=stage.project_id,
        project_name=stage.project.name,
        title=stage.name,
        url_path=f"/{slug}/projects/{stage.project_id}/stages/{stage.id}",
        roles={"owner": _ids(stage.owner_id)},
        subscribers=object_subscribers("project_stage", stage.id),
    )


def _case_review(entity_id):
    review = CaseReview.objects.filter(pk=entity_id).select_related("product", "project").first()
    if not review or not review.product_id:
        return None
    workspace_id = review.product.workspace_id
    slug = _slug(workspace_id)
    return EntityContext(
        entity_type="case_review",
        entity_id=review.id,
        workspace_id=workspace_id,
        workspace_slug=slug,
        project_id=review.project_id,
        project_name=review.project.name if review.project_id else "",
        title=review.name,
        url_path=f"/{slug}/products/{review.product_id}/testhub/caseManagementReviewDetail?review_id={review.id}",
    )


def _test_plan(entity_id):
    plan = TestPlan.objects.filter(pk=entity_id).select_related("product", "project").first()
    if not plan:
        return None
    workspace_id = plan.project.workspace_id if plan.project_id else (plan.product.workspace_id if plan.product_id else None)
    if not workspace_id:
        return None
    slug = _slug(workspace_id)
    return EntityContext(
        entity_type="test_plan",
        entity_id=plan.id,
        workspace_id=workspace_id,
        workspace_slug=slug,
        project_id=plan.project_id,
        project_name=plan.project.name if plan.project_id else "",
        title=plan.name,
        url_path=f"/{slug}/projects/{plan.project_id}/testhub/plan-cases?planId={plan.id}" if plan.project_id else "",
        roles={"reviewer": list(plan.reviewers.values_list("id", flat=True))},
        subscribers=object_subscribers("test_plan", plan.id),
    )


RESOLVERS = {
    "issue": _issue,
    "cycle": _cycle,
    "release": _release,
    "risk": _risk,
    "stage_review": _stage_review,
    "review_tailoring": _review_tailoring,
    "requirement_change": _requirement_change,
    "requirement": _requirement,
    "project_stage": _project_stage,
    "case_review": _case_review,
    "test_plan": _test_plan,
}


def resolve_entity(entity_type, entity_id):
    """找不到对象（已删除等）返回 None。"""
    resolver = RESOLVERS.get(entity_type)
    return resolver(entity_id) if resolver and entity_id else None
