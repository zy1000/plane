"""产品的权限判断（docs/permission-refactor/data-permission-plan.md）。

产品没有自己的成员和 key：
- 产品本体（新建 / 改基本信息 / 删）看工作区的 workspace.product.*，产品负责人能改自己的产品；
- 产品内容（需求、用例、评审…）看能进的关联项目里的项目 key，见 permissions/base.py::_get_user_product_permission_keys；
- 可见性在 utils/visibility.py：直通 / 负责人 / 评审人 / 可见项目关联的产品 / 各工作区权限组的产品白名单并集。
"""

from enum import Enum

from plane.app.permissions.base import _get_user_product_permission_keys, workspace_context
from plane.app.permissions.keys import PermissionKey
from plane.utils.visibility import can_access_product, visible_products_q


def can_create_product(user, workspace) -> bool:
    return PermissionKey.WORKSPACE_PRODUCT_CREATE.value in workspace_context(user, workspace).keys


def can_manage_workspace_products(user, workspace) -> bool:
    """能维护工作区里所有产品的基本信息（能改任一产品）。"""
    return PermissionKey.WORKSPACE_PRODUCT_EDIT.value in workspace_context(user, workspace).keys


def can_see_all_products(user, workspace) -> bool:
    """直通身份看全部；其他人看白名单（见 visibility）。保留给只问「是不是全看得见」的调用方。"""
    return workspace_context(user, workspace).passthrough


def filter_visible_products(queryset, user, workspace):
    """产品列表与各处候选池共用的可见性过滤。"""
    if not workspace_context(user, workspace).is_member:
        return queryset.none()
    return queryset.filter(visible_products_q(user, workspace, None))


def has_product_permission(user, product, *permission_keys) -> bool:
    """持有任一指定 key 即 True（project.* 取自关联项目，workspace.* 取自工作区）。"""
    wanted = {key.value if isinstance(key, Enum) else str(key) for key in permission_keys}
    return bool(_get_user_product_permission_keys(user, product) & wanted)


def can_manage_product(user, product) -> bool:
    """改产品基本信息：产品负责人或 workspace.product.edit。"""
    return has_product_permission(user, product, PermissionKey.WORKSPACE_PRODUCT_EDIT)


def can_view_product(user, product) -> bool:
    return can_access_product(user, product.workspace, product.id)


def can_edit_product_requirements(user, product) -> bool:
    return has_product_permission(user, product, PermissionKey.PROJECT_REQUIREMENT_EDIT)
