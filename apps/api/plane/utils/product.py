from enum import Enum

from plane.app.permissions import ROLE
from plane.app.permissions.base import (
    _get_user_product_permission_keys,
    _is_instance_admin,
    is_workspace_member,
)
from plane.app.permissions.keys import PermissionKey
from plane.db.models import WorkspaceMember
from plane.db.models.product import ProductMember


def can_create_product(user, workspace) -> bool:
    if workspace.owner_id == user.id or _is_instance_admin(user):
        return True
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        member=user,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def can_manage_workspace_products(user, workspace) -> bool:
    if workspace.owner_id == user.id or _is_instance_admin(user):
        return True
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        member=user,
        role=ROLE.ADMIN.value,
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def has_product_permission(user, product, *permission_keys) -> bool:
    """持有任一指定 product.* key 即 True。直通逻辑在 key 解析里。"""
    wanted = {
        key.value if isinstance(key, Enum) else str(key) for key in permission_keys
    }
    return bool(_get_user_product_permission_keys(user, product) & wanted)


def can_manage_product(user, product) -> bool:
    return has_product_permission(user, product, PermissionKey.PRODUCT_SETTINGS_EDIT)


def can_view_product(user, product) -> bool:
    if can_manage_product(user, product):
        return True
    if not is_workspace_member(user, product.workspace.slug):
        return False
    if product.network == 2:
        return True
    if product.reviewers.filter(id=user.id).exists():
        return True
    return ProductMember.objects.filter(product=product, member=user).exists()


def roles_exceed_product_permissions(user, product, roles) -> bool:
    """待授予的角色是否含有 user 自己在该产品没有的权限。

    产品角色之间没有高低次序（不像项目侧的整数 role 可比大小），
    所以「不能授予高于自己的角色」只能落成「所授权限必须是自己权限的子集」。
    直通用户（产品负责人 / 工作区管理员 / 实例管理员）持全部 key，不受影响。
    """
    granted_keys: set = set()
    for role in roles:
        perms = role.permissions if isinstance(role.permissions, dict) else {}
        granted_keys.update(
            key for key in perms.get("permission_keys", []) if isinstance(key, str)
        )
    if not granted_keys:
        return False
    return not granted_keys.issubset(_get_user_product_permission_keys(user, product))


def can_edit_product_requirements(user, product) -> bool:
    return has_product_permission(
        user, product, PermissionKey.PRODUCT_REQUIREMENT_EDIT
    )
