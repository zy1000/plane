import hashlib
from uuid import UUID

from django.db import migrations


ISSUE_TYPE_PERMISSION_KEY_PREFIX = "project.issue_type."
ISSUE_TYPE_TEMPLATE_PERMISSION_KEY_PREFIX = "project.issue_type_template."
ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY = "issue_type_permission_templates"
ISSUE_TYPE_PERMISSION_ACTION_SET = frozenset(
    {"create", "edit", "delete", "archive", "unarchive"}
)

# 旧硬编码 key 前缀 -> 0205 中绑定的 IssueType 名字集合。
# issue.requirement.* 一对多覆盖「史诗 / 特性 / 用户故事」三种类型。
LEGACY_KEY_PREFIX_TO_TYPE_NAMES = {
    "issue.defect.": ("缺陷",),
    "issue.requirement.": ("史诗", "特性", "用户故事"),
    "issue.task.": ("任务",),
}


def _build_template_key(issue_type_name, action):
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


def _parse_template_permission_key(key):
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


def _convert_key_to_template_keys(key, issue_types_by_id):
    if not isinstance(key, str):
        return []

    for prefix, type_names in LEGACY_KEY_PREFIX_TO_TYPE_NAMES.items():
        if key.startswith(prefix):
            action = key[len(prefix) :]
            if action not in ISSUE_TYPE_PERMISSION_ACTION_SET:
                return []
            return [
                _build_template_key(type_name, action) for type_name in type_names
            ]

    parsed = _parse_issue_type_permission_key(key)
    if parsed:
        issue_type_id_hex, action = parsed
        try:
            issue_type_id = UUID(hex=issue_type_id_hex)
        except ValueError:
            return []
        issue_type_name = issue_types_by_id.get(issue_type_id)
        if not issue_type_name:
            return []
        return [_build_template_key(issue_type_name, action)]

    if _parse_template_permission_key(key):
        return [key]

    return [key]


def _build_digest_to_name_map(issue_type_names):
    digest_to_name = {}
    for name in issue_type_names:
        clean_name = (name or "").strip()
        if not clean_name:
            continue
        digest = hashlib.sha1(clean_name.encode("utf-8")).hexdigest()
        digest_to_name[digest] = clean_name
    return digest_to_name


def _build_template_descriptors(permission_keys, digest_to_name, saved_descriptors):
    descriptors = {}
    saved_descriptors = saved_descriptors if isinstance(saved_descriptors, dict) else {}

    for key in permission_keys:
        parsed = _parse_template_permission_key(key)
        if not parsed:
            continue

        name_digest, action = parsed

        saved = saved_descriptors.get(key)
        if isinstance(saved, dict):
            name = saved.get("name")
            if isinstance(name, str) and saved.get("action") == action:
                descriptors[key] = {"name": name, "action": action}
                continue

        name = digest_to_name.get(name_digest)
        if name:
            descriptors[key] = {"name": name, "action": action}

    return descriptors


def _rewrite_workspace_role_permissions(apps):
    """把 WorkspaceRole(type=project_template) 中残存的旧 key 重写为 template key。

    - issue.defect.<action> -> project.issue_type_template.{sha1(缺陷)}.<action>
    - issue.requirement.<action> -> 史诗 / 特性 / 用户故事 三个 template key
    - issue.task.<action> -> project.issue_type_template.{sha1(任务)}.<action>
    - project.issue_type.<uuid>.<action> -> 查 IssueType.name 后转为 template key
    """
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    IssueType = apps.get_model("db", "IssueType")

    issue_types_by_id = {
        issue_type.id: issue_type.name
        for issue_type in IssueType.objects.filter(deleted_at__isnull=True).only(
            "id", "name"
        )
    }
    all_issue_type_names = (
        IssueType.objects.filter(deleted_at__isnull=True, is_active=True)
        .values_list("name", flat=True)
        .distinct()
    )
    digest_to_name = _build_digest_to_name_map(all_issue_type_names)

    for role in WorkspaceRole.objects.filter(type="project_template"):
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        old_keys = permissions.get("permission_keys", [])
        if not isinstance(old_keys, list) or not old_keys:
            continue

        saved_descriptors = permissions.get(
            ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, {}
        )

        new_keys = []
        for key in old_keys:
            new_keys.extend(_convert_key_to_template_keys(key, issue_types_by_id))

        deduped_keys = list(dict.fromkeys(new_keys))
        new_descriptors = _build_template_descriptors(
            deduped_keys, digest_to_name, saved_descriptors
        )

        old_descriptors = (
            saved_descriptors if isinstance(saved_descriptors, dict) else {}
        )
        if deduped_keys == old_keys and new_descriptors == old_descriptors:
            continue

        permissions["permission_keys"] = deduped_keys
        if new_descriptors:
            permissions[ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY] = new_descriptors
        else:
            permissions.pop(ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, None)

        role.permissions = permissions
        role.save(update_fields=["permissions"])


def forward(apps, schema_editor):
    _rewrite_workspace_role_permissions(apps)


def backward(apps, schema_editor):
    """permission_keys 的重写无法精确还原（issue.requirement.* 一对多展开），故不尝试恢复。"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0267_issuetransitionrecord_target_assignee_ids"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
