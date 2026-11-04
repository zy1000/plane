"""权限字典（permissions 表）跟着 ``plane.app.permissions.registry`` 走。

表里的行纯粹是注册表的派生数据：启动和每次 migrate 之后按注册表补齐、改文案，注册表里
没有的 key 硬删。管理员在权限字典里停用（is_active=False）的状态保留。
"""

import logging

from django.db import DEFAULT_DB_ALIAS, connections
from django.db.models.signals import post_migrate
from django.db.utils import DatabaseError, OperationalError, ProgrammingError

logger = logging.getLogger("plane.db")

_STATIC_PERMISSIONS_SYNCED = False


def _permission_definitions() -> dict:
    from plane.app.permissions.registry import PERMISSION_DEFS

    return {
        definition.key: {
            "name": definition.name,
            "description": definition.name,
            "scope": definition.scope,
            "module": definition.module,
            "action": definition.action,
            "category": definition.group,
            "sort_order": definition.sort_order,
        }
        for definition in PERMISSION_DEFS
    }


def _permission_table_exists() -> bool:
    connection = connections[DEFAULT_DB_ALIAS]
    try:
        return "permissions" in connection.introspection.table_names()
    except (OperationalError, ProgrammingError, DatabaseError):
        return False


def ensure_static_permissions(force: bool = False) -> int:
    """按注册表同步 permissions 表，返回改动行数。"""
    global _STATIC_PERMISSIONS_SYNCED

    if _STATIC_PERMISSIONS_SYNCED and not force:
        return 0
    if not _permission_table_exists():
        return 0

    from plane.db.models import Permission

    definitions = _permission_definitions()
    manager = Permission.all_objects.using(DEFAULT_DB_ALIAS)
    try:
        removed, _ = manager.exclude(key__in=list(definitions)).delete()
        existing = {row.key: row for row in manager.filter(key__in=list(definitions))}
        created, updated = [], []
        for key, values in definitions.items():
            row = existing.get(key)
            if row is None:
                created.append(Permission(key=key, is_active=True, **values))
                continue
            dirty = row.deleted_at is not None or any(getattr(row, field) != value for field, value in values.items())
            if dirty:
                for field, value in values.items():
                    setattr(row, field, value)
                row.deleted_at = None
                updated.append(row)
        if created:
            manager.bulk_create(created, batch_size=200, ignore_conflicts=True)
        if updated:
            manager.bulk_update(updated, [*next(iter(definitions.values())).keys(), "deleted_at"])
        synced = removed + len(created) + len(updated)
        if synced:
            logger.info("Synced permissions table: +%s ~%s -%s", len(created), len(updated), removed)
        _STATIC_PERMISSIONS_SYNCED = True
        return synced
    except (OperationalError, ProgrammingError, DatabaseError):
        logger.exception("Failed to sync permissions table")
        return 0


def ensure_static_permissions_after_migrate(**kwargs) -> None:
    ensure_static_permissions(force=True)


def register_permission_bootstrap(sender) -> None:
    post_migrate.connect(
        ensure_static_permissions_after_migrate,
        sender=sender,
        dispatch_uid="plane.db.ensure_static_permissions_after_migrate",
    )
