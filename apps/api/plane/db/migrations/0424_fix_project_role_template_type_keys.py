"""修存量项目角色里的模板格式类型权限 key（docs/issue-scheme/issue-scheme-execution-plan.md 批次 4 落地记录）。

``create_default_role`` 建项目时把角色模板的权限原样复制，类型权限留成模板格式
``project.issue_type_template.<摘要>.<动作>``，对不上本项目任何类型：只靠这些角色拿权限的普通成员
建 / 删 / 归档任何类型的工作项都会被拒。建项目流程已改为方案就位后换算，这里修存量。

换算口径与运行时 ``utils/project/role_import.py::build_project_role_permissions``（新建项目、模板页
「同步到项目」）一致：按角色**来源模板现在**勾的类型权限，换成本项目方案里启用类型的
``project.issue_type.<类型 id>.<动作>``；系统类型按 ``system_key`` 对，自建类型按名字对。没有来源模板
（或模板已删）的角色退回按角色自己复制来的模板 key 换算。角色里已有的真实类型 key 与其他权限不动；
模板格式 key 与复制来的描述符一并去掉（换算后无用，运行时同步也会清掉）。

摘要规则与 ``db/models/issue_type.py::issue_type_template_identity`` 一致，迁移里不 import 运行时模块，
按同一规则内联。可重复执行（第二遍已无模板 key）。反向不还原：去掉的模板 key 本来就不生效。
"""

import hashlib

from django.db import migrations

from plane.db.seed_data.issue_scheme import TEMPLATE_IDENTITY_PREFIX

TEMPLATE_KEY_PREFIX = "project.issue_type_template."
PROJECT_KEY_PREFIX = "project.issue_type."
DESCRIPTOR_KEY = "issue_type_permission_templates"
ACTIONS = {"create", "edit", "delete", "archive", "unarchive"}


def _digest(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _parse_template_key(key):
    """模板 key → (摘要, 动作)；不是模板 key 返回 None。"""
    if not isinstance(key, str) or not key.startswith(TEMPLATE_KEY_PREFIX):
        return None
    rest = key[len(TEMPLATE_KEY_PREFIX):]
    if "." not in rest:
        return None
    digest, action = rest.rsplit(".", 1)
    if not digest or action not in ACTIONS:
        return None
    return digest, action


def _permission_keys(permissions):
    keys = permissions.get("permission_keys") if isinstance(permissions, dict) else None
    return keys if isinstance(keys, list) else None


def forwards(apps, schema_editor):
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    Project = apps.get_model("db", "Project")
    IssueType = apps.get_model("db", "IssueType")

    scheme_by_project = {}
    digests_by_scheme = {}
    template_keys_by_role = {}

    def type_digests(scheme_id):
        """方案里启用类型的 {摘要: 类型 id hex}：系统类型按标识，所有类型再按名字（同运行时按名字兜底）。"""
        if scheme_id not in digests_by_scheme:
            mapping = {}
            rows = IssueType.objects.filter(scheme_id=scheme_id, is_active=True, deleted_at__isnull=True).values_list(
                "id", "name", "system_key"
            )
            for type_id, name, system_key in rows:
                if system_key:
                    mapping.setdefault(_digest(f"{TEMPLATE_IDENTITY_PREFIX}{system_key}"), type_id.hex)
            for type_id, name, system_key in rows:
                mapping.setdefault(_digest((name or "").strip()), type_id.hex)
            digests_by_scheme[scheme_id] = mapping
        return digests_by_scheme[scheme_id]

    def source_template_keys(template_id):
        """来源模板现在的模板格式类型 key；模板不存在或已删返回 None。"""
        if template_id not in template_keys_by_role:
            permissions = (
                WorkspaceRole.objects.filter(pk=template_id, deleted_at__isnull=True)
                .values_list("permissions", flat=True)
                .first()
            )
            keys = _permission_keys(permissions)
            template_keys_by_role[template_id] = (
                None if keys is None else [key for key in keys if _parse_template_key(key)]
            )
        return template_keys_by_role[template_id]

    roles = ProjectRole.objects.filter(permissions__icontains=TEMPLATE_KEY_PREFIX).only(
        "id", "project_id", "source_template_id", "permissions"
    )
    for role in roles.iterator(chunk_size=500):
        keys = _permission_keys(role.permissions)
        if keys is None:
            continue
        own_template_keys = [key for key in keys if _parse_template_key(key)]
        if not own_template_keys:
            continue

        if role.project_id not in scheme_by_project:
            scheme_by_project[role.project_id] = (
                Project.objects.filter(pk=role.project_id).values_list("issue_scheme_id", flat=True).first()
            )
        scheme_id = scheme_by_project[role.project_id]
        if scheme_id is None:
            continue
        digests = type_digests(scheme_id)

        wanted = source_template_keys(role.source_template_id) if role.source_template_id else None
        if wanted is None:
            wanted = own_template_keys
        mapped = []
        for key in wanted:
            digest, action = _parse_template_key(key)
            type_hex = digests.get(digest)
            if type_hex:
                mapped.append(f"{PROJECT_KEY_PREFIX}{type_hex}.{action}")

        kept = [key for key in keys if not _parse_template_key(key)]
        permissions = {k: v for k, v in role.permissions.items() if k != DESCRIPTOR_KEY}
        permissions["permission_keys"] = list(dict.fromkeys([*kept, *mapped]))
        ProjectRole.objects.filter(pk=role.pk).update(permissions=permissions)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0423_principal_workspace_role"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
