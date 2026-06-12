import copy
import hashlib
import uuid

from django.db import migrations
from django.utils import timezone


ISSUE_TYPE_PERMISSION_KEY_PREFIX = "project.issue_type."
ISSUE_TYPE_TEMPLATE_PERMISSION_KEY_PREFIX = "project.issue_type_template."
ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY = "issue_type_permission_templates"
ISSUE_TYPE_PERMISSION_ACTION_SET = frozenset(
    {"create", "edit", "delete", "archive", "unarchive"}
)

STANDARD_ROLE_NAMES = (
    "软件测试工程师",
    "软件测试负责人",
    "软件研发工程师",
    "软件研发负责人",
)

ROLE_RENAME_GROUPS = (
    (
        "软件研发工程师",
        (
            "软件开发工程师",
            "软件开发成员",
            "研发工程师",
            "研发",
            "软件工程师",
        ),
    ),
    (
        "软件测试工程师",
        (
            "软件测试成员",
            "测试员",
            "测试工程师",
            "测试",
        ),
    ),
    (
        "软件研发负责人",
        (
            "软件负责人",
            "研发负责人",
            "项目负责人",
        ),
    ),
    (
        "软件测试负责人",
        ("测试负责人",),
    ),
)


def _build_issue_type_permission_key(issue_type_id, action):
    if hasattr(issue_type_id, "hex"):
        issue_type_id_hex = issue_type_id.hex
    else:
        issue_type_id_hex = str(issue_type_id).replace("-", "")
    return f"{ISSUE_TYPE_PERMISSION_KEY_PREFIX}{issue_type_id_hex}.{action}"


def _build_issue_type_template_permission_key(issue_type_name, action):
    name = (issue_type_name or "").strip()
    name_digest = hashlib.sha1(name.encode("utf-8")).hexdigest()
    return f"{ISSUE_TYPE_TEMPLATE_PERMISSION_KEY_PREFIX}{name_digest}.{action}"


def _parse_issue_type_permission_key(key):
    if not isinstance(key, str) or not key.startswith(ISSUE_TYPE_PERMISSION_KEY_PREFIX):
        return None

    rest = key[len(ISSUE_TYPE_PERMISSION_KEY_PREFIX) :]
    if "." not in rest:
        return None

    issue_type_id_hex, action = rest.rsplit(".", 1)
    if action not in ISSUE_TYPE_PERMISSION_ACTION_SET or not issue_type_id_hex:
        return None

    return issue_type_id_hex, action


def _parse_issue_type_template_permission_key(key):
    if not isinstance(key, str) or not key.startswith(
        ISSUE_TYPE_TEMPLATE_PERMISSION_KEY_PREFIX
    ):
        return None

    rest = key[len(ISSUE_TYPE_TEMPLATE_PERMISSION_KEY_PREFIX) :]
    if "." not in rest:
        return None

    name_digest, action = rest.rsplit(".", 1)
    if action not in ISSUE_TYPE_PERMISSION_ACTION_SET or not name_digest:
        return None

    return name_digest, action


def _get_workspace_issue_type_template_descriptors(
    IssueType, workspace_id, descriptor_cache
):
    if workspace_id in descriptor_cache:
        return descriptor_cache[workspace_id]

    issue_type_names = (
        IssueType.objects.filter(
            project__workspace_id=workspace_id,
            deleted_at__isnull=True,
            is_active=True,
        )
        .order_by("name")
        .values_list("name", flat=True)
        .distinct()
    )
    descriptors = {}
    for issue_type_name in issue_type_names:
        name = (issue_type_name or "").strip()
        if not name:
            continue

        for action in ISSUE_TYPE_PERMISSION_ACTION_SET:
            key = _build_issue_type_template_permission_key(name, action)
            descriptors[key] = {"name": name, "action": action}

    descriptor_cache[workspace_id] = descriptors
    return descriptors


def _get_template_permission_descriptors(
    IssueType, workspace_id, template_permissions, descriptor_cache
):
    descriptors = dict(
        _get_workspace_issue_type_template_descriptors(
            IssueType, workspace_id, descriptor_cache
        )
    )
    saved_descriptors = template_permissions.get(
        ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, {}
    )
    if not isinstance(saved_descriptors, dict):
        return descriptors

    for key, descriptor in saved_descriptors.items():
        parsed_key = _parse_issue_type_template_permission_key(key)
        if not parsed_key or not isinstance(descriptor, dict):
            continue

        _, action = parsed_key
        name = descriptor.get("name")
        if isinstance(name, str) and descriptor.get("action") == action:
            descriptors[key] = {"name": name, "action": action}

    return descriptors


def _get_project_issue_type_key_descriptors(IssueType, permission_keys):
    issue_type_keys = {}
    for key in permission_keys:
        parsed_key = _parse_issue_type_permission_key(key)
        if not parsed_key:
            continue

        issue_type_id_hex, action = parsed_key
        try:
            issue_type_id = uuid.UUID(hex=issue_type_id_hex)
        except ValueError:
            continue
        issue_type_keys[key] = (issue_type_id, action)

    if not issue_type_keys:
        return {}

    issue_types = IssueType.objects.filter(
        id__in=[issue_type_id for issue_type_id, _ in issue_type_keys.values()]
    ).only("id", "name")
    issue_types_by_id = {issue_type.id: issue_type for issue_type in issue_types}

    descriptors = {}
    for key, (issue_type_id, action) in issue_type_keys.items():
        issue_type = issue_types_by_id.get(issue_type_id)
        if issue_type:
            descriptors[key] = {"name": issue_type.name, "action": action}

    return descriptors


def _get_project_issue_type_id_by_name(IssueType, project_id, issue_type_cache):
    if project_id in issue_type_cache:
        return issue_type_cache[project_id]

    issue_types = IssueType.objects.filter(
        project_id=project_id,
        deleted_at__isnull=True,
        is_active=True,
    ).only("id", "name")
    issue_type_id_by_name = {
        issue_type.name: issue_type.id for issue_type in issue_types
    }
    issue_type_cache[project_id] = issue_type_id_by_name
    return issue_type_id_by_name


def _map_template_permission_keys_to_project(
    IssueType,
    project_id,
    workspace_id,
    template_permissions,
    descriptor_cache,
    issue_type_cache,
):
    permission_keys = template_permissions.get("permission_keys", [])
    if not isinstance(permission_keys, list):
        return []

    target_issue_type_id_by_name = _get_project_issue_type_id_by_name(
        IssueType, project_id, issue_type_cache
    )
    template_descriptors = _get_template_permission_descriptors(
        IssueType, workspace_id, template_permissions, descriptor_cache
    )
    project_key_descriptors = _get_project_issue_type_key_descriptors(
        IssueType, permission_keys
    )

    mapped_keys = []
    for key in permission_keys:
        if not isinstance(key, str):
            continue

        descriptor = None
        if _parse_issue_type_template_permission_key(key):
            descriptor = template_descriptors.get(key)
        elif _parse_issue_type_permission_key(key):
            descriptor = project_key_descriptors.get(key)

        if descriptor:
            target_issue_type_id = target_issue_type_id_by_name.get(
                descriptor["name"]
            )
            if target_issue_type_id:
                mapped_keys.append(
                    _build_issue_type_permission_key(
                        target_issue_type_id, descriptor["action"]
                    )
                )
            continue

        mapped_keys.append(key)

    return list(dict.fromkeys(mapped_keys))


def _normalize_project_role_names(ProjectRole, project_id, now):
    for target_name, source_names in ROLE_RENAME_GROUPS:
        if ProjectRole.objects.filter(
            project_id=project_id,
            name=target_name,
            deleted_at__isnull=True,
        ).exists():
            continue

        source_role = (
            ProjectRole.objects.filter(
                project_id=project_id,
                name__in=source_names,
                deleted_at__isnull=True,
            )
            .order_by("created_at", "id")
            .first()
        )
        if not source_role:
            continue

        ProjectRole.objects.filter(pk=source_role.pk).update(
            name=target_name,
            updated_at=now,
        )


def _build_project_permissions(
    IssueType,
    project_id,
    workspace_id,
    template_permissions,
    descriptor_cache,
    issue_type_cache,
):
    project_permissions = (
        copy.deepcopy(template_permissions)
        if isinstance(template_permissions, dict)
        else {}
    )
    project_permissions["permission_keys"] = _map_template_permission_keys_to_project(
        IssueType,
        project_id,
        workspace_id,
        project_permissions,
        descriptor_cache,
        issue_type_cache,
    )
    project_permissions.pop(ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, None)
    return project_permissions


def _build_workspace_templates(WorkspaceRole):
    templates_by_workspace_id = {}
    templates = WorkspaceRole.objects.filter(
        deleted_at__isnull=True,
        type="project_template",
        name__in=STANDARD_ROLE_NAMES,
    ).only("id", "workspace_id", "name", "description", "permissions")

    for template in templates.iterator():
        templates_by_workspace_id.setdefault(template.workspace_id, {})[
            template.name
        ] = template

    return templates_by_workspace_id


def _ensure_standard_project_roles(
    ProjectRole,
    WorkspaceRole,
    IssueType,
    projects,
    now,
):
    templates_by_workspace_id = _build_workspace_templates(WorkspaceRole)
    descriptor_cache = {}
    issue_type_cache = {}
    roles_to_create = []

    for project in projects:
        existing_names = set(
            ProjectRole.objects.filter(
                project_id=project.id,
                deleted_at__isnull=True,
            ).values_list("name", flat=True)
        )
        workspace_templates = templates_by_workspace_id.get(project.workspace_id, {})

        for role_name in STANDARD_ROLE_NAMES:
            if role_name in existing_names:
                continue

            template = workspace_templates.get(role_name)
            if not template:
                continue

            roles_to_create.append(
                ProjectRole(
                    id=uuid.uuid4(),
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    name=template.name,
                    description=template.description or "",
                    permissions=_build_project_permissions(
                        IssueType,
                        project.id,
                        project.workspace_id,
                        template.permissions,
                        descriptor_cache,
                        issue_type_cache,
                    ),
                    source_template=None,
                    created_at=now,
                    updated_at=now,
                )
            )
            existing_names.add(role_name)

    if roles_to_create:
        ProjectRole.objects.bulk_create(roles_to_create, batch_size=500)


def forward(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    IssueType = apps.get_model("db", "IssueType")

    now = timezone.now()
    projects = list(
        Project.objects.filter(deleted_at__isnull=True).only("id", "workspace_id")
    )

    for project in projects:
        _normalize_project_role_names(ProjectRole, project.id, now)

    _ensure_standard_project_roles(
        ProjectRole,
        WorkspaceRole,
        IssueType,
        projects,
        now,
    )


def backward(apps, schema_editor):
    # 角色改名和模板补齐无法可靠区分迁移数据与后续人工修改，因此不做反向恢复。
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0268_rewrite_workspace_role_legacy_permissions"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
