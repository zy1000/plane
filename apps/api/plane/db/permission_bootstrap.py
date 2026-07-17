import logging

from django.db import DEFAULT_DB_ALIAS, connections
from django.db.models.signals import post_migrate
from django.db.utils import DatabaseError, OperationalError, ProgrammingError

from plane.app.permissions.keys import PermissionKey

logger = logging.getLogger("plane.db")

_STATIC_PERMISSIONS_SYNCED = False

ACTION_LABELS = {
    "add": "关联",
    "archive": "归档",
    "bind_role": "绑定角色",
    "config": "配置",
    "create": "创建",
    "delete": "删除",
    "download": "下载",
    "edit": "编辑",
    "export": "导出",
    "import_export": "导入/导出",
    "invite": "邀请",
    "leave": "退出",
    "lock": "锁定",
    "manage": "管理",
    "manage_member": "管理成员",
    "manage_role": "管理角色",
    "manage_saved_view": "管理保存视图",
    "mark_default": "设为默认",
    "remove": "移除",
    "unarchive": "恢复",
    "upload": "上传",
    "view": "查看",
}

MODULE_LABELS = {
    "estimate": "估算",
    "intake": "需求收集",
    "intake.description_version": "需求收集描述版本",
    "intake.issue": "需求收集工作项",
    "issue": "工作项",
    "issue.attachment": "工作项附件",
    "issue.comment": "工作项评论",
    "issue.link": "工作项链接",
    "issue.relation": "工作项关联",
    "label": "标签",
    "milestone": "里程碑",
    "milestone.issue": "里程碑工作项",
    "modules": "模块",
    "modules.issue": "模块工作项",
    "page": "页面",
    "page.access": "页面访问",
    "page.version": "页面版本",
    "project": "项目",
    "project.analytics": "项目概览",
    "project.announcement": "项目公告",
    "project.asset": "项目资产",
    "project.group_grant": "项目用户组授权",
    "project.member": "项目成员",
    "project.publish": "项目发布",
    "project.role": "项目角色",
    "project.settings": "项目设置",
    "qa.case": "测试用例",
    "qa.mindmap": "用例脑图",
    "qa.plan": "测试计划",
    "qa.report": "测试报告",
    "qa.review": "测试评审",
    "releases": "发布",
    "releases.comment": "发布评论",
    "releases.cycle": "发布迭代",
    "releases.file": "发布文件",
    "releases.issue": "发布工作项",
    "releases.plan": "发布测试计划",
    "sprints": "迭代",
    "sprints.comment": "迭代评论",
    "sprints.file": "迭代文件",
    "sprints.issue": "迭代工作项",
    "sprints.plan": "迭代测试计划",
    "state": "状态",
    "view": "视图",
    "workflow": "工作流",
    "workspace.analytics": "工作区分析",
    "workspace.group": "工作区用户组",
    "workspace.member": "工作区成员",
    "workspace.project": "工作区项目",
    "workspace.role": "工作区角色模板",
    "workspace.settings": "工作区设置",
    "workspace.user_profile": "成员画像",
}

CATEGORY_LABELS = {
    "estimate": "项目估算",
    "intake": "需求收集",
    "issue": "工作项",
    "label": "项目标签",
    "milestone": "项目里程碑",
    "modules": "模块",
    "page": "页面",
    "project": "项目",
    "qa": "测试管理",
    "releases": "发布",
    "sprints": "迭代",
    "state": "项目状态",
    "view": "视图",
    "workflow": "工作流",
    "workspace": "工作区",
}

PERMISSION_OVERRIDES = {
    "workspace.member.leave": {
        "name": "主动退出工作区",
        "module": "member",
        "category": "成员",
        "sort_order": 5,
    },
    "project.analytics.view": {
        "name": "查看项目概览",
        "module": "project.overview",
        "category": "项目概览",
    },
    "project.announcement.create": {
        "name": "添加项目公告",
        "category": "项目概览",
    },
    "project.announcement.delete": {
        "name": "删除项目公告",
        "category": "项目概览",
    },
    "issue.import_export": {
        "name": "导入/导出工作项",
        "module": "issue",
        "action": "import_export",
        "category": "工作项",
    },
}


def _split_permission_key(key: str) -> tuple[str, str]:
    if "." not in key:
        return key, "view"
    module, action = key.rsplit(".", 1)
    return module, action


def _build_permission_defaults(key: str) -> dict:
    module, action = _split_permission_key(key)
    module_root = module.split(".", 1)[0]
    action_label = ACTION_LABELS.get(action, action)
    module_label = MODULE_LABELS.get(module, module)
    defaults = {
        "name": f"{action_label}{module_label}",
        "description": f"{action_label}{module_label}",
        "scope": "workspace" if key.startswith("workspace.") else "project",
        "module": module,
        "action": action,
        "category": CATEGORY_LABELS.get(module_root, module_label),
        "sort_order": 100,
        "is_active": True,
    }
    overrides = PERMISSION_OVERRIDES.get(key)
    if overrides:
        defaults.update(overrides)
        defaults["description"] = overrides.get("description", defaults["name"])
    return defaults


def _static_permission_definitions() -> dict[str, dict]:
    return {
        key: {"key": key, **_build_permission_defaults(key)}
        for key in dict.fromkeys(PermissionKey.values())
    }


def _permission_table_exists() -> bool:
    connection = connections[DEFAULT_DB_ALIAS]
    try:
        return "permissions" in connection.introspection.table_names()
    except (OperationalError, ProgrammingError, DatabaseError):
        return False


def ensure_static_permissions(force: bool = False) -> int:
    """Ensure static PermissionKey enum values exist in the permissions table.

    This is intentionally additive: existing rows are left untouched, and missing
    rows are inserted with conservative runtime metadata.
    """
    global _STATIC_PERMISSIONS_SYNCED

    if _STATIC_PERMISSIONS_SYNCED and not force:
        return 0
    if not _permission_table_exists():
        return 0

    from plane.db.models import Permission

    definitions = _static_permission_definitions()
    keys = list(definitions)

    try:
        existing_rows = list(
            Permission.all_objects.using(DEFAULT_DB_ALIAS)
            .filter(key__in=keys)
            .values("key", "deleted_at")
        )
        active_keys = {
            row["key"] for row in existing_rows if row["deleted_at"] is None
        }
        soft_deleted_keys = {
            row["key"] for row in existing_rows if row["deleted_at"] is not None
        }
        for key in soft_deleted_keys:
            Permission.all_objects.using(DEFAULT_DB_ALIAS).filter(key=key).update(
                deleted_at=None,
                **{
                    field: value
                    for field, value in definitions[key].items()
                    if field != "key"
                },
            )
        missing_permissions = [
            Permission(**definitions[key])
            for key in keys
            if key not in active_keys and key not in soft_deleted_keys
        ]
        if missing_permissions:
            Permission.objects.using(DEFAULT_DB_ALIAS).bulk_create(
                missing_permissions,
                batch_size=100,
                ignore_conflicts=True,
            )
        synced_count = len(soft_deleted_keys) + len(missing_permissions)
        if synced_count:
            logger.info("Synced %s missing static permissions", synced_count)
        _STATIC_PERMISSIONS_SYNCED = True
        return synced_count
    except (OperationalError, ProgrammingError, DatabaseError):
        logger.exception("Failed to ensure static permissions")
        return 0


def ensure_static_permissions_after_migrate(**kwargs) -> None:
    ensure_static_permissions(force=True)


def register_permission_bootstrap(sender) -> None:
    post_migrate.connect(
        ensure_static_permissions_after_migrate,
        sender=sender,
        dispatch_uid="plane.db.ensure_static_permissions_after_migrate",
    )
