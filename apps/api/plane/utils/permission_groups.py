"""权限组的业务规则（docs/permission-refactor/split-plan.md）。

- 工作区的权限组（WorkspaceRole）按 kind 分三类：工作区权限组（workspace.* + project.* key，有成员，项目 key 在成员能看到的
  所有项目上生效）/ 项目权限模板（只有 project.* key，无成员）/ 数据权限（只有项目、产品白名单，有成员）。
- 模板的引用集合 = 工作区全部项目 − 排除列表，项目里只能绑人、不能改、可删（= 排除）。
- 项目里的权限组（ProjectRole）：``source_template`` 非空 = 引用行（权限实时取模板，本行 JSON 不用，按需在绑人时生成）；
  为空 = 本项目自定义。没有「脱离」。
- 没有系统组：每个组都能改名、改权限、删除、绑人；成员不默认属于任何组。
- 类型限定 ``type_limits``：{key: [排除的类型 id]}，只允许工作项 / 缺陷的新建、编辑、删除。
"""

from django.db import transaction
from django.db.models import Count

from plane.app.permissions.base import DEFECT_CATEGORY_NAME, role_payload
from plane.app.permissions.registry import PROJECT_KEYS, TYPE_LIMITABLE_KEYS, WORKSPACE_KEYS
from plane.db.models import (
    IssueScheme,
    IssueType,
    Project,
    ProjectGroupRole,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    WorkspaceGroupMember,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
    WorkspaceRoleProjectExclusion,
)
from plane.license.models import Instance, InstanceAdmin
from plane.utils.data_scope import (
    excluded_project_ids,
    referencing_templates,
    template_referenced_project_ids,
    template_references_project,
)

class PermissionGroupError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.message = message
        self.code = code


# ---------------------------------------------------------------------------
# 类型选项（编辑器里「排除哪些类型」的清单）
# ---------------------------------------------------------------------------


def _type_option(issue_type):
    return {
        "id": str(issue_type.id),
        "name": issue_type.name,
        "logo_props": issue_type.logo_props,
        "module": "project.defect"
        if issue_type.category and issue_type.category.name == DEFECT_CATEGORY_NAME
        else "project.issue",
        "is_active": issue_type.is_active,
    }


def workspace_type_options(workspace_id):
    """工作区组与模板：类型库里的类型。"""
    library = IssueScheme.objects.filter(workspace_id=workspace_id, project__isnull=True).first()
    if library is None:
        return []
    return [
        _type_option(issue_type)
        for issue_type in IssueType.objects.filter(scheme=library).select_related("category").order_by("level", "name")
    ]


def project_type_options(project):
    """项目自定义组：本项目方案里的类型（脱离方案后的私有类型也在）。id 用库类型 id，私有类型用自己的。"""
    rows = []
    for issue_type in (
        IssueType.objects.filter(scheme__projects=project.id).select_related("category").order_by("level", "name")
    ):
        option = _type_option(issue_type)
        option["id"] = str(issue_type.library_type_id or issue_type.id)
        rows.append(option)
    return rows


# ---------------------------------------------------------------------------
# 权限内容
# ---------------------------------------------------------------------------


def role_scope_keys(role) -> frozenset:
    """这个组允许装哪些 key：工作区权限组两类都行，模板和项目里的组只有项目 key，数据权限没有 key。"""
    if isinstance(role, WorkspaceRole):
        if role.kind == WorkspaceRole.KIND_WORKSPACE:
            return WORKSPACE_KEYS | PROJECT_KEYS
        if role.kind == WorkspaceRole.KIND_PROJECT_TEMPLATE:
            return PROJECT_KEYS
        return frozenset()
    return PROJECT_KEYS


def effective_payload(role) -> dict:
    """组当前生效的内容：{permission_keys, type_limits}。引用行取模板。"""
    if isinstance(role, ProjectRole) and role.source_template_id:
        role = role.source_template
    scope_keys = role_scope_keys(role)
    perms = role.permissions if isinstance(role.permissions, dict) else {}
    keys = sorted(key for key in perms.get("permission_keys", []) if key in scope_keys)
    limits = {
        key: ids
        for key, ids in (perms.get("type_limits") or {}).items()
        if key in keys and key in TYPE_LIMITABLE_KEYS and ids
    }
    return {"permission_keys": keys, "type_limits": limits}


def normalize_payload(role, permission_keys, type_limits, valid_type_ids):
    """校验并整理编辑器提交的内容，返回要存的 JSON。"""
    scope_keys = role_scope_keys(role)
    keys = list(dict.fromkeys(permission_keys or []))
    invalid = [key for key in keys if key not in scope_keys]
    if invalid:
        raise PermissionGroupError(f"无效的权限 key：{', '.join(invalid)}")
    limits = {}
    for key, ids in (type_limits or {}).items():
        if key not in TYPE_LIMITABLE_KEYS:
            raise PermissionGroupError(f"{key} 不能按类型限定")
        if key not in keys or not ids:
            continue
        ids = sorted({str(value) for value in ids})
        unknown = [value for value in ids if value not in valid_type_ids]
        if unknown:
            raise PermissionGroupError("类型不存在或不属于本工作区")
        limits[key] = ids
    payload = {"permission_keys": keys}
    if limits:
        payload["type_limits"] = limits
    return payload


def set_workspace_role_permissions(role, permission_keys, type_limits):
    if role.kind == WorkspaceRole.KIND_DATA:
        raise PermissionGroupError("数据权限只配置项目 / 产品范围，没有操作权限。")
    valid = {option["id"] for option in workspace_type_options(role.workspace_id)}
    role.permissions = normalize_payload(role, permission_keys, type_limits, valid)
    role.save(update_fields=["permissions", "updated_at", "updated_by"])
    return role


def set_project_role_permissions(role, permission_keys, type_limits):
    if role.source_template_id:
        raise PermissionGroupError("引用模板的权限组不能在项目里修改，请改工作区的模板。", "PERMISSION_GROUP_REFERENCED")
    valid = {option["id"] for option in project_type_options(role.project)}
    valid |= {option["id"] for option in workspace_type_options(role.workspace_id)}
    role.permissions = normalize_payload(role, permission_keys, type_limits, valid)
    role.save(update_fields=["permissions", "updated_at", "updated_by"])
    return role


# ---------------------------------------------------------------------------
# 列表统计
# ---------------------------------------------------------------------------


def workspace_group_member_counts(workspace) -> dict:
    """{组 id: 直绑的活跃成员数}。"""
    return dict(
        WorkspaceMemberRole.objects.filter(
            workspace=workspace, member__is_active=True, member__deleted_at__isnull=True
        )
        .values("role_id")
        .annotate(n=Count("member_id", distinct=True))
        .values_list("role_id", "n")
    )


def _preview_ids(pairs, limit=3) -> dict:
    """[(组 id, 用户 id), ...] → {组 id: [最多 limit 个用户 id]}，按出现顺序去重。"""
    result = {}
    for role_id, user_id in pairs:
        ids = result.setdefault(role_id, [])
        user_id = str(user_id)
        if len(ids) < limit and user_id not in ids:
            ids.append(user_id)
    return result


def workspace_group_member_previews(workspace) -> dict:
    """{组 id: [前 3 个直绑成员的用户 id]}：列表「成员」列叠放头像用。"""
    return _preview_ids(
        WorkspaceMemberRole.objects.filter(
            workspace=workspace, member__is_active=True, member__deleted_at__isnull=True
        )
        .order_by("created_at")
        .values_list("role_id", "member__member_id")
    )


def template_usage_counts(workspace) -> dict:
    """{模板 id: {"referenced": 引用它的项目数}}（全部项目 − 排除）。"""
    total = Project.objects.filter(workspace=workspace).count()
    excluded = dict(
        WorkspaceRoleProjectExclusion.objects.filter(role__workspace=workspace, project__deleted_at__isnull=True)
        .values("role_id")
        .annotate(n=Count("project_id", distinct=True))
        .values_list("role_id", "n")
    )
    return {
        template_id: {"referenced": max(total - excluded.get(template_id, 0), 0)}
        for template_id in WorkspaceRole.objects.filter(
            workspace=workspace, kind=WorkspaceRole.KIND_PROJECT_TEMPLATE
        ).values_list("id", flat=True)
    }


def template_projects(template):
    """模板详情的「引用项目」页：工作区全部项目，带「已排除」标记。"""
    queryset = Project.objects.filter(workspace_id=template.workspace_id)
    excluded = excluded_project_ids(template)
    bound_counts = dict(
        ProjectMemberRole.objects.filter(
            role__source_template=template, member__is_active=True, member__deleted_at__isnull=True
        )
        .values("role__project_id")
        .annotate(n=Count("member_id", distinct=True))
        .values_list("role__project_id", "n")
    )
    rows = []
    for row in queryset.order_by("name").values(
        "id", "name", "identifier", "logo_props", "archived_at", "project_lead_id"
    ):
        rows.append(
            {
                **row,
                "id": str(row["id"]),
                "project_lead_id": str(row["project_lead_id"]) if row["project_lead_id"] else None,
                "excluded": str(row["id"]) in excluded,
                "bound_member_count": bound_counts.get(row["id"], 0),
            }
        )
    return {"projects": rows}


@transaction.atomic
def exclude_template_project(template, project):
    """项目不再引用模板：记排除，硬删项目里的引用行及其成员 / 团队绑定。"""
    if template.kind != WorkspaceRole.KIND_PROJECT_TEMPLATE:
        raise PermissionGroupError("这个权限组不是项目权限模板。")
    WorkspaceRoleProjectExclusion.objects.get_or_create(role=template, project=project)
    rows = ProjectRole.objects.filter(project=project, source_template=template)
    ProjectMemberRole.objects.filter(role__in=rows).delete(soft=False)
    ProjectGroupRole.objects.filter(role__in=rows).delete(soft=False)
    rows.delete(soft=False)


def restore_template_project(template, project):
    """从排除列表拿掉，项目重新引用这个模板。"""
    WorkspaceRoleProjectExclusion.objects.filter(role=template, project=project).delete(soft=False)


# ---------------------------------------------------------------------------
# 项目里的权限组
# ---------------------------------------------------------------------------


def template_reference_row(project, template):
    """项目里引用这个模板的那一行，没有就建（引用行按需生成）。模板必须正引用着这个项目。"""
    if not template_references_project(template, project.id):
        raise PermissionGroupError("这个模板没有引用本项目（已排除）。")
    row = ProjectRole.objects.filter(project=project, source_template=template).first()
    if row is not None:
        return row
    taken = set(ProjectRole.objects.filter(project=project).values_list("name", flat=True))
    name = template.name if template.name not in taken else f"{template.name}（模板）"
    return ProjectRole.objects.create(
        project=project,
        workspace_id=project.workspace_id,
        name=name,
        description=template.description,
        permissions={},
        source_template=template,
    )


def resolve_project_group_ids(project, group_ids):
    """成员绑定接口收到的 id 可以是本项目权限组 id，也可以是模板 id（自动建引用行）。
    返回 ProjectRole id 列表；有不认识的 id 抛错。"""
    ids = [str(value) for value in group_ids or [] if value]
    rows = {str(row.id): row for row in ProjectRole.objects.filter(project=project, id__in=ids)}
    templates = {
        str(template.id): template
        for template in WorkspaceRole.objects.filter(
            workspace_id=project.workspace_id, kind=WorkspaceRole.KIND_PROJECT_TEMPLATE, id__in=ids
        )
    }
    resolved = []
    for value in ids:
        if value in rows:
            resolved.append(rows[value].id)
        elif value in templates:
            resolved.append(template_reference_row(project, templates[value]).id)
        else:
            raise PermissionGroupError("权限组不存在或不属于本项目")
    return list(dict.fromkeys(resolved))


def project_group_rows(project):
    """项目「权限组」列表：引用了本项目的模板（含还没人用的）+ 本项目自定义组。"""
    templates = referencing_templates(project)
    rows = list(ProjectRole.objects.filter(project=project).select_related("source_template").order_by("created_at"))
    member_counts = dict(
        ProjectMemberRole.objects.filter(
            project=project, member__is_active=True, member__deleted_at__isnull=True
        )
        .values("role_id")
        .annotate(n=Count("member_id", distinct=True))
        .values_list("role_id", "n")
    )
    member_previews = _preview_ids(
        ProjectMemberRole.objects.filter(project=project, member__is_active=True, member__deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("role_id", "member__member_id")
    )
    by_template = {row.source_template_id: row for row in rows if row.source_template_id}

    def entry(**values):
        payload = values.pop("payload")
        values["permission_count"] = len(payload["permission_keys"])
        return values

    result = []
    for template in templates:
        row = by_template.get(template.id)
        result.append(
            entry(
                id=str(row.id) if row else str(template.id),
                project_role_id=str(row.id) if row else None,
                template_id=str(template.id),
                name=row.name if row else template.name,
                description=template.description,
                source="template",
                member_count=member_counts.get(row.id, 0) if row else 0,
                member_preview_ids=member_previews.get(row.id, []) if row else [],
                updated_at=template.updated_at,
                payload=effective_payload(template),
            )
        )
    for row in rows:
        if row.source_template_id:
            # 引用行已在上面按模板列出；模板不再引用本项目（掉出白名单）的引用行暂不生效，也不列出
            continue
        result.append(
            entry(
                id=str(row.id),
                project_role_id=str(row.id),
                template_id=None,
                name=row.name,
                description=row.description,
                source="project",
                member_count=member_counts.get(row.id, 0),
                member_preview_ids=member_previews.get(row.id, []),
                updated_at=row.updated_at,
                payload=effective_payload(row),
            )
        )
    return result


def inherited_workspace_groups(project):
    """项目「权限组」页的说明：带项目权限的工作区权限组，以及本项目里有谁在组里（直绑或经团队）——
    这些人在本项目里直接拥有组的项目权限。工作区所有者、项目负责人、实例管理员本来就有全部权限，不算在内；
    本项目没人在里面的组不列。"""
    instance = Instance.objects.first()
    passthrough_ids = {project.workspace.owner_id, project.project_lead_id or project.created_by_id}
    if instance is not None:
        passthrough_ids |= set(InstanceAdmin.objects.filter(instance=instance).values_list("user_id", flat=True))
    project_user_ids = set(
        ProjectMember.objects.filter(project=project, is_active=True, deleted_at__isnull=True).values_list(
            "member_id", flat=True
        )
    ) - passthrough_ids
    members = {
        member.id: member.member
        for member in WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id,
            member_id__in=project_user_ids,
            is_active=True,
            deleted_at__isnull=True,
        ).select_related("member")
    }
    if not members:
        return []

    result = []
    roles = WorkspaceRole.objects.filter(
        workspace_id=project.workspace_id, kind=WorkspaceRole.KIND_WORKSPACE, deleted_at__isnull=True
    ).order_by("created_at")
    for role in roles:
        keys, _ = role_payload(role.permissions, PROJECT_KEYS)
        if not keys:
            continue
        direct = WorkspaceMemberRole.objects.filter(
            role=role, member_id__in=members, deleted_at__isnull=True
        ).values_list("member_id", flat=True)
        via_team = WorkspaceGroupMember.objects.filter(
            member_id__in=members,
            deleted_at__isnull=True,
            group__deleted_at__isnull=True,
            group__group_roles__role=role,
            group__group_roles__deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
        holder_ids = set(direct) | set(via_team)
        if not holder_ids:
            continue
        holders = sorted((members[member_id] for member_id in holder_ids), key=lambda user: user.display_name or "")
        result.append(
            {
                "id": str(role.id),
                "name": role.name,
                "project_permission_count": len(keys),
                "members": [{"id": str(user.id), "display_name": user.display_name} for user in holders],
            }
        )
    return result


def group_member_ids(role):
    """权限组详情「成员」页签：直绑的成员（用户 id）。"""
    if isinstance(role, WorkspaceRole):
        return list(
            WorkspaceMemberRole.objects.filter(role=role, member__is_active=True, member__deleted_at__isnull=True)
            .values_list("member__member_id", flat=True)
            .distinct()
        )
    return list(
        ProjectMemberRole.objects.filter(role=role, member__is_active=True, member__deleted_at__isnull=True)
        .values_list("member__member_id", flat=True)
        .distinct()
    )


def bind_workspace_group_members(role, user_ids):
    """把一批工作区成员加进工作区权限组 / 数据权限。模板没有成员。"""
    if not role.can_have_members:
        raise PermissionGroupError("项目权限模板没有成员，请在项目里绑定。")
    members = WorkspaceMember.objects.filter(
        workspace_id=role.workspace_id, member_id__in=list(user_ids), is_active=True, deleted_at__isnull=True
    )
    existing = set(WorkspaceMemberRole.objects.filter(role=role).values_list("member_id", flat=True))
    WorkspaceMemberRole.objects.bulk_create(
        [
            WorkspaceMemberRole(workspace_id=role.workspace_id, member=member, role=role)
            for member in members
            if member.id not in existing
        ]
    )


def unbind_workspace_group_member(role, user_id):
    WorkspaceMemberRole.objects.filter(role=role, member__member_id=user_id).delete(soft=False)


def is_name_taken(workspace_id, kind, name, exclude_id=None):
    """同类型内名称唯一；不同类型可以同名。"""
    queryset = WorkspaceRole.objects.filter(workspace_id=workspace_id, kind=kind, name=name)
    if exclude_id:
        queryset = queryset.exclude(pk=exclude_id)
    return queryset.exists()

