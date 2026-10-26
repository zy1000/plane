"""工作项方案的业务工具（docs/issue-scheme/）。

按项目查类型 / 状态 / 字段 / 工作流统一写 ``Model.objects.filter(scheme__projects=<project_id>)``，
不需要先取方案 id；这里放「要拿到方案 id 本身」「生成方案内容」「删除前的引用统计」「项目脱离」。
"""

import json
import logging

from django.db import transaction
from django.db.models import Q

from plane.db.models import (
    DraftIssue,
    Issue,
    IssueScheme,
    IssueTransitionRecord,
    IssueType,
    IssueView,
    Project,
    ProjectRole,
    ProjectUserProperty,
    State,
    TypeExtraField,
    TypeExtraFieldValue,
    User,
    Workflow,
    WorkflowTransition,
    WorkflowTransitionPrincipal,
    WorkflowTransitionRequiredField,
)
from plane.db.models.cycle import CycleUserProperties
from plane.db.models.module import ModuleUserProperties
from plane.db.models.release import ReleaseUserProperties
from plane.db.models.workflow import TransitionRecordStatus, WorkflowPrincipalKind
from plane.utils.scheme_views import copy_mode_views_to_project

logger = logging.getLogger("plane.api")

#: 跟随研发模式的项目，项目级路由上的配置写操作一律 403 带这个 code
ISSUE_SCHEME_FOLLOWS_DEV_MODE = "ISSUE_SCHEME_FOLLOWS_DEV_MODE"
#: 有在途审批时不能脱离
ISSUE_SCHEME_DETACH_BLOCKED_BY_PENDING_APPROVALS = "ISSUE_SCHEME_DETACH_BLOCKED_BY_PENDING_APPROVALS"
#: 删除被引用的类型 / 状态 / 字段
ISSUE_SCHEME_OBJECT_IN_USE = "ISSUE_SCHEME_OBJECT_IN_USE"

#: 建项目时一并加进项目的成员：沿用原缺陷默认工作流里写死的四个人（其中三个是审批人）
DEFAULT_PROJECT_MEMBER_NAMES = ["欧秋洁", "何洽", "钟长会", "杨玉柱"]


def project_scheme_id(project_id):
    """项目当前所用方案的 id：跟随 = 模式方案，自定义 = 项目方案。项目不存在返回 None。"""
    if not project_id:
        return None
    return Project.all_objects.filter(pk=project_id).values_list("issue_scheme_id", flat=True).first()


def is_project_following(project_id):
    """项目是否跟随研发模式（指向模式方案）。"""
    return IssueScheme.all_objects.filter(projects__pk=project_id, project__isnull=True).exists()


def following_project_count(scheme_id):
    return Project.objects.filter(issue_scheme_id=scheme_id).count()


# ---------------------------------------------------------------------------
# 生成方案内容
# ---------------------------------------------------------------------------


def seed_issue_scheme(scheme, created_by=None, project=None):
    """给还没有任何类型的方案生成种子内容（五个类型、默认状态、缺陷字段、缺陷默认工作流）。

    返回是否生成了。「没有任何类型」即视为从未生成过：默认类型不允许删，生成过的方案至少剩一个类型。
    锁方案行串行化并发调用（两个项目同时建、同时打开模板中心）。
    ``project`` 只在项目方案时传：缺陷工作流的角色审批人按该项目的同名角色找；模式方案按同名角色模板找。
    """
    from plane.utils.project.defaults import (
        bulk_create_issue_state,
        create_default_bug_extra_field,
        create_default_bug_workflow,
        create_scheme_issue_types,
    )

    with transaction.atomic():
        IssueScheme.all_objects.select_for_update().get(pk=scheme.pk)
        issue_types = create_scheme_issue_types(scheme)
        if not issue_types:
            return False
        bulk_create_issue_state(issue_types=issue_types, created_by=created_by)
        create_default_bug_extra_field(issue_types=issue_types)
        create_default_bug_workflow(issue_types=issue_types, project=project, created_by=created_by)
    return True


def add_scheme_members_to_project(project):
    """把方案工作流里的指定成员与默认的四个人加进项目（需求 4.4）。已是成员的跳过。"""
    from plane.utils.project.member import add_user_to_project

    member_ids = set(
        WorkflowTransitionPrincipal.objects.filter(
            transition__scheme_id=project.issue_scheme_id,
            kind=WorkflowPrincipalKind.MEMBER,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
    )
    users = list(User.objects.filter(Q(id__in=member_ids) | Q(display_name__in=DEFAULT_PROJECT_MEMBER_NAMES)))
    if users:
        add_user_to_project(users, project)


# ---------------------------------------------------------------------------
# 删除前的引用统计
# ---------------------------------------------------------------------------


def issue_type_references(issue_type_id):
    """类型被多少项目的多少条工作项（含归档、软删、草稿）引用。不限跟随项目：脱离的项目历史也可能引用。

    删类型会经 State.issue_type 级联删掉它的状态，再级联删掉指向这些状态的审批记录。项目脱离后工作项换到了
    副本上，但审批记录有意保留原状态，所以还要把「经由本类型状态」的工作项、草稿和审批记录一起算上。
    """
    state_ids = list(State.all_state_objects.filter(issue_type_id=issue_type_id).values_list("id", flat=True))
    issue_rows = list(
        Issue.all_objects.filter(Q(type_id=issue_type_id) | Q(state_id__in=state_ids)).values_list(
            "project_id", flat=True
        )
    )
    draft_rows = list(
        DraftIssue.all_objects.filter(Q(type_id=issue_type_id) | Q(state_id__in=state_ids)).values_list(
            "project_id", flat=True
        )
    )
    record_rows = list(
        IssueTransitionRecord.all_objects.filter(
            Q(from_state_id__in=state_ids) | Q(to_state_id__in=state_ids)
        ).values_list("project_id", flat=True)
    )
    return {
        "project_count": len(set(issue_rows) | set(draft_rows) | set(record_rows)),
        "issue_count": len(issue_rows) + len(draft_rows),
        "record_count": len(record_rows),
    }


def state_references(state_id):
    """状态被工作项（含归档、软删、草稿）或审批记录（起止状态，CASCADE）引用的情况。"""
    issue_rows = list(Issue.all_objects.filter(state_id=state_id).values_list("project_id", flat=True))
    draft_rows = list(DraftIssue.all_objects.filter(state_id=state_id).values_list("project_id", flat=True))
    record_rows = list(
        IssueTransitionRecord.all_objects.filter(Q(from_state_id=state_id) | Q(to_state_id=state_id)).values_list(
            "project_id", flat=True
        )
    )
    return {
        "project_count": len(set(issue_rows) | set(draft_rows) | set(record_rows)),
        "issue_count": len(issue_rows) + len(draft_rows),
        "record_count": len(record_rows),
    }


def extra_field_references(extra_field_id):
    """字段被多少条字段值（含软删）引用。"""
    rows = list(TypeExtraFieldValue.all_objects.filter(extra_field_id=extra_field_id).values_list("project_id", flat=True))
    return {"project_count": len(set(rows)), "issue_count": len(rows)}


def in_use_response_data(refs, noun):
    """409 的响应体：前端 toast 直接显示 error，计数单独给。"""
    parts = []
    if refs.get("issue_count"):
        parts.append(f"{refs['issue_count']} 条工作项")
    if refs.get("record_count"):
        parts.append(f"{refs['record_count']} 条审批记录")
    return {
        "error": f"{refs['project_count']} 个项目的 {'、'.join(parts)}在用该{noun}，不能删除，请改为停用",
        "code": ISSUE_SCHEME_OBJECT_IN_USE,
        **refs,
    }


def is_referenced(refs):
    return bool(refs.get("issue_count") or refs.get("record_count"))


# ---------------------------------------------------------------------------
# 项目脱离：拷一份模式方案到项目名下（单向）
# ---------------------------------------------------------------------------


class DetachBlocked(Exception):
    def __init__(self, pending_count):
        super().__init__(pending_count)
        self.pending_count = pending_count


_COPY_EXCLUDE = {"id", "scheme", "created_at", "updated_at"}


def _clone_rows(model, rows, target_scheme, id_map, fk_fields=(), actor_id=None):
    """按行拷贝到目标方案：新 id、改 scheme、外键按 id_map 换成新行。保留 deleted_at（软删的也拷，
    项目里软删的工作项可能还引用着）。返回 [(旧行, 新行)]。"""
    pairs = []
    for row in rows:
        values = {}
        for field in model._meta.concrete_fields:
            if field.name in _COPY_EXCLUDE:
                continue
            values[field.attname] = getattr(row, field.attname)
        for fk in fk_fields:
            old = values.get(f"{fk}_id")
            if old is not None:
                values[f"{fk}_id"] = id_map[old]
        values["scheme_id"] = target_scheme.id
        values["workspace_id"] = target_scheme.workspace_id
        if actor_id:
            values["created_by_id"] = actor_id
            values["updated_by_id"] = actor_id
        pairs.append((row, model(**values)))
    model.objects.bulk_create([new for _, new in pairs], batch_size=500)
    for old, new in pairs:
        id_map[old.id] = new.id
    return pairs


def copy_scheme(source, target, actor_id=None):
    """深拷贝 source 方案的全部配置到 target，返回 {旧 id: 新 id}（类型、字段、状态、工作流、流转）。"""
    from plane.db.models.issue_type import sync_issue_type_permissions

    id_map = {}
    type_pairs = _clone_rows(IssueType, IssueType.all_objects.filter(scheme=source), target, id_map, actor_id=actor_id)
    for _, new_type in type_pairs:
        # bulk_create 不发 post_save，类型衍生的 5 条权限手动同步
        if new_type.deleted_at is None:
            sync_issue_type_permissions(new_type)
    _clone_rows(TypeExtraField, TypeExtraField.all_objects.filter(scheme=source), target, id_map,
                fk_fields=("issue_type",), actor_id=actor_id)
    _clone_rows(State, State.all_state_objects.filter(scheme=source), target, id_map,
                fk_fields=("issue_type",), actor_id=actor_id)
    _clone_rows(Workflow, Workflow.all_objects.filter(scheme=source), target, id_map,
                fk_fields=("issue_type",), actor_id=actor_id)
    _clone_rows(WorkflowTransition, WorkflowTransition.all_objects.filter(scheme=source), target, id_map,
                fk_fields=("workflow", "from_state", "to_state"), actor_id=actor_id)

    principals = []
    for p in WorkflowTransitionPrincipal.all_objects.filter(transition__scheme=source):
        principals.append(WorkflowTransitionPrincipal(
            transition_id=id_map[p.transition_id], dimension=p.dimension, kind=p.kind,
            member_id=p.member_id, role_id=p.role_id, workspace_role_id=p.workspace_role_id,
            dynamic_target=p.dynamic_target, deleted_at=p.deleted_at,
        ))
    WorkflowTransitionPrincipal.objects.bulk_create(principals, batch_size=500)

    required = []
    for r in WorkflowTransitionRequiredField.all_objects.filter(workflow__scheme=source):
        required.append(WorkflowTransitionRequiredField(
            workflow_id=id_map[r.workflow_id], extra_field_id=id_map[r.extra_field_id], deleted_at=r.deleted_at,
        ))
    WorkflowTransitionRequiredField.objects.bulk_create(required, batch_size=500)
    return id_map


def _replace_ids_in_json(value, str_map):
    """JSON 里出现的旧 uuid 字符串整体替换成新的。项目级对象里的旧 id 只可能指本方案，不按条件语义处理。"""
    if not value:
        return value, False
    text = json.dumps(value, ensure_ascii=False)
    new_text = text
    for old, new in str_map.items():
        if old in new_text:
            new_text = new_text.replace(old, new)
    if new_text == text:
        return value, False
    return json.loads(new_text), True


def remap_project_refs(project_id, id_map):
    """把本项目数据里指向旧方案行的引用按 id_map 换成新行（需求 5.3 第 3 步）。可重复执行。"""
    if not id_map:
        return
    for old, new in id_map.items():
        Issue.all_objects.filter(project_id=project_id, type_id=old).update(type_id=new)
        Issue.all_objects.filter(project_id=project_id, state_id=old).update(state_id=new)
        DraftIssue.all_objects.filter(project_id=project_id, type_id=old).update(type_id=new)
        DraftIssue.all_objects.filter(project_id=project_id, state_id=old).update(state_id=new)
        TypeExtraFieldValue.all_objects.filter(project_id=project_id, extra_field_id=old).update(extra_field_id=new)
        Project.all_objects.filter(pk=project_id, default_state_id=old).update(default_state_id=new)

    # 角色里的类型派生权限 key：project.issue_type.<旧 hex>.<动作> → 新 hex
    hex_map = {f"project.issue_type.{old.hex}.": f"project.issue_type.{new.hex}." for old, new in id_map.items()}
    for role in ProjectRole.all_objects.filter(project_id=project_id):
        perms, changed = _replace_ids_in_json(role.permissions, hex_map)
        if changed:
            ProjectRole.all_objects.filter(pk=role.pk).update(permissions=perms)

    # 项目内的保存筛选条件：旧 id 整体替换。工作区级的（无项目的视图、WorkspaceUserProperties）不动
    str_map = {str(old): str(new) for old, new in id_map.items()}
    for model in (ProjectUserProperty, CycleUserProperties, ModuleUserProperties, ReleaseUserProperties):
        for row in model.all_objects.filter(project_id=project_id).only("id", "filters", "rich_filters", "display_filters"):
            updates = {}
            for name in ("filters", "rich_filters", "display_filters"):
                value, changed = _replace_ids_in_json(getattr(row, name), str_map)
                if changed:
                    updates[name] = value
            if updates:
                model.all_objects.filter(pk=row.pk).update(**updates)
    for view in IssueView.all_objects.filter(project_id=project_id):
        changed_any = False
        for name in ("filters", "rich_filters", "display_filters"):
            value, changed = _replace_ids_in_json(getattr(view, name), str_map)
            if changed:
                setattr(view, name, value)
                changed_any = True
        if changed_any:
            # query 由 save() 从 filters 派生，走 save 重建
            view.save()


def detach_project_scheme(project_id, actor=None):
    """项目切换为项目自定义（单向）：拷一份当前模式方案到项目名下并重映射项目数据。

    返回 (方案, 是否本次切换)。已经是项目方案时直接返回（幂等）。有在途审批抛 DetachBlocked。
    整个拷贝与重映射在一个事务里，失败不留半套数据；提交后再重映射一遍，兜住窗口期并发插入
    的、仍引用旧 id 的行（建工作项等路径不加锁）。
    """
    actor_id = getattr(actor, "id", None)
    with transaction.atomic():
        project = Project.objects.select_for_update().get(pk=project_id)
        source = IssueScheme.all_objects.get(pk=project.issue_scheme_id)
        if source.project_id is not None:
            return source, False

        pending = IssueTransitionRecord.objects.filter(
            project_id=project.id, status=TransitionRecordStatus.PENDING
        ).count()
        if pending:
            raise DetachBlocked(pending)

        target = IssueScheme.objects.create(workspace_id=project.workspace_id, name=project.name, project_id=project.id)
        id_map = copy_scheme(source, target, actor_id=actor_id)
        # 研发模式视图拷成本项目的公共视图，条件里的模式方案 id 由下面的重映射一起换掉
        copy_mode_views_to_project(source.id, project.id)
        remap_project_refs(project.id, id_map)
        Project.all_objects.filter(pk=project.id).update(issue_scheme_id=target.id)
        logger.info(
            "issue scheme detached: project=%s from scheme=%s to scheme=%s by user=%s",
            project.id, source.id, target.id, actor_id,
        )

    remap_project_refs(project.id, id_map)
    return target, True


def attach_own_scheme(project):
    """给还没保存的项目先建好它自己的项目方案（项目自定义，不跟随模式）。须在 transaction.atomic() 里调。

    给要写自己一套状态的路径用（workspace_seed、dummy_data），免得把数据写进共用的模式方案。
    """
    project.issue_scheme = IssueScheme.objects.create(
        workspace_id=project.workspace_id, name=project.name, project_id=project.pk
    )
    return project.issue_scheme


def prepare_project_issue_scheme(project, creator=None):
    """新项目的工作项配置（需求 5.1）。建项目接口、简道云同步、外部 API 共用；放在建项目角色之后调。

    - 跟随研发模式（默认）：共用模式方案，不给项目生成；模式方案还空着就先补上，再把方案工作流里的
      指定成员加进项目。
    - 项目自定义（ORM 直建时指定了自有方案）：照旧在项目自己的方案里生成。
    """
    scheme = IssueScheme.all_objects.get(pk=project.issue_scheme_id)
    if scheme.project_id is None:
        seed_issue_scheme(scheme, created_by=creator)
        add_scheme_members_to_project(project)
    else:
        seed_issue_scheme(scheme, created_by=creator, project=project)
