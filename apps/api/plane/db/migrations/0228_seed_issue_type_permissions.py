from django.db import migrations


ISSUE_TYPE_PERMISSION_KEY_PREFIX = "project.issue_type."
ISSUE_TYPE_PERMISSION_ACTIONS = (
    ("create", "创建{}类型工作项"),
    ("edit", "编辑{}类型工作项"),
    ("delete", "删除{}类型工作项"),
    ("archive", "归档{}类型工作项"),
    ("unarchive", "恢复{}类型工作项"),
)

# 旧硬编码 key 前缀 -> 该前缀对应 0205 中绑定的 IssueType 名字集合。
# 历史上 issue.requirement.* 一组 key 同时覆盖 史诗/特性/用户故事 三种类型，
# 所以重写时这一条要展开成对应项目下三种 IssueType 的衍生 key。
LEGACY_KEY_PREFIX_TO_TYPE_NAMES = {
    "issue.defect.": ("缺陷",),
    "issue.requirement.": ("史诗", "特性", "用户故事"),
    "issue.task.": ("任务",),
}

# 0205 中物化的、本次迁移要清退的旧 Permission key 集合。
LEGACY_PERMISSION_KEYS = tuple(
    f"{prefix}{action}"
    for prefix in LEGACY_KEY_PREFIX_TO_TYPE_NAMES
    for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS
)


def _seed_issue_type_permissions(apps):
    """为所有 IssueType 物化 5 条 project.issue_type.<id_hex>.<action> Permission 行。"""
    IssueType = apps.get_model("db", "IssueType")
    Permission = apps.get_model("db", "Permission")

    for issue_type in IssueType.objects.all():
        raw_name = issue_type.name or ""
        # 与 plane.db.models.issue_type.sync_issue_type_permissions 保持一致的截断策略，
        # 避免在 IssueType.name 接近 255 上限时撑爆 Permission.name(255)/category(100)。
        safe_name_for_label = raw_name[:240]
        safe_name_for_category = raw_name[:80]
        module = f"issue.type.{issue_type.id.hex}"
        category = f"工作项类型 - {safe_name_for_category}"
        is_active = issue_type.deleted_at is None and getattr(
            issue_type, "is_active", True
        )
        for action, label_template in ISSUE_TYPE_PERMISSION_ACTIONS:
            key = f"{ISSUE_TYPE_PERMISSION_KEY_PREFIX}{issue_type.id.hex}.{action}"
            label = label_template.format(safe_name_for_label)
            Permission.objects.update_or_create(
                key=key,
                defaults={
                    "name": label,
                    "description": label,
                    "scope": "project",
                    "module": module,
                    "action": action,
                    "category": category,
                    "sort_order": 100,
                    "is_active": is_active,
                },
            )


def _rewrite_role_permissions(apps):
    """把 ProjectRole.permissions 中残存的旧 key 重写为新的衍生 key。

    - issue.defect.<action> -> 该项目下名为「缺陷」的 IssueType 衍生 key
    - issue.requirement.<action> -> 该项目下「史诗 / 特性 / 用户故事」三个 IssueType 各自的衍生 key
    - issue.task.<action> -> 该项目下名为「任务」的 IssueType 衍生 key

    若项目下找不到对应名字的 IssueType，旧 key 直接丢弃（说明该项目根本没有这种类型）。
    """
    ProjectRole = apps.get_model("db", "ProjectRole")
    IssueType = apps.get_model("db", "IssueType")

    issue_types_by_project = {}
    for issue_type in IssueType.objects.filter(deleted_at__isnull=True):
        issue_types_by_project.setdefault(issue_type.project_id, {})[
            issue_type.name
        ] = issue_type.id

    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        old_keys = permissions.get("permission_keys", [])
        if not isinstance(old_keys, list) or not old_keys:
            continue

        name_to_id = issue_types_by_project.get(role.project_id, {})
        new_keys = []
        for key in old_keys:
            if not isinstance(key, str):
                continue
            matched = False
            for prefix, type_names in LEGACY_KEY_PREFIX_TO_TYPE_NAMES.items():
                if key.startswith(prefix):
                    matched = True
                    action = key[len(prefix):]
                    for type_name in type_names:
                        type_id = name_to_id.get(type_name)
                        if type_id is None:
                            continue
                        new_keys.append(
                            f"{ISSUE_TYPE_PERMISSION_KEY_PREFIX}{type_id.hex}.{action}"
                        )
                    break
            if not matched:
                new_keys.append(key)

        deduped_keys = list(dict.fromkeys(new_keys))
        if deduped_keys != old_keys:
            permissions["permission_keys"] = deduped_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _delete_legacy_permissions(apps):
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(key__in=LEGACY_PERMISSION_KEYS).delete()


def forward(apps, schema_editor):
    _seed_issue_type_permissions(apps)
    _rewrite_role_permissions(apps)
    _delete_legacy_permissions(apps)


def backward(apps, schema_editor):
    """反向：仅清理本次迁移引入的衍生权限行。

    role.permissions 的重写无法精确还原（issue.requirement.* 一对多展开），
    故不在反向中尝试恢复——回滚后衍生 key 会成为孤立 key，但不会破坏数据库一致性。
    若需要恢复 0205 中的 15 条 Permission，请重新跑 0205 的 seed_permissions。
    """
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(
        key__startswith=ISSUE_TYPE_PERMISSION_KEY_PREFIX
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0227_unify_typeextrafield_select_selection_mode"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
