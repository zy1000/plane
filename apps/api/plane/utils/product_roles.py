"""产品默认角色：规格与绑定。

每个产品由代码生成两个默认角色，不走工作区模板（项目侧模板下发是拷贝，
模板改了副本不跟，204 个项目已经摊出 1404 份分叉的角色定义；产品不再复制这个模式）：

- 产品管理员：全部 product.* 权限，产品负责人自动绑定
- 产品成员：需求的建 / 改 / 模块 / 评审 / 基线 / 用例关联；不含删需求、
  产品设置、成员、角色、关联项目。新加成员没指定角色时默认绑定它

迁移 0358 内有一份规格副本，改这里要同步。
"""

from plane.app.permissions.keys import PermissionKey
from plane.db.models.product import ProductMember, ProductMemberRole, ProductRole

PRODUCT_ADMIN_ROLE_NAME = "产品管理员"
PRODUCT_MEMBER_ROLE_NAME = "产品成员"

PRODUCT_ADMIN_PERMISSION_KEYS = tuple(
    key for key in PermissionKey.values() if key.startswith("product.")
)

PRODUCT_MEMBER_PERMISSION_KEYS = (
    PermissionKey.PRODUCT_REQUIREMENT_CREATE.value,
    PermissionKey.PRODUCT_REQUIREMENT_EDIT.value,
    PermissionKey.PRODUCT_REQUIREMENT_MODULE_MANAGE.value,
    PermissionKey.PRODUCT_CHANGE_REQUEST_SUBMIT.value,
    PermissionKey.PRODUCT_BASELINE_MANAGE.value,
    PermissionKey.PRODUCT_TEST_CASE_LINK_MANAGE.value,
)


def ensure_product_default_roles(product) -> tuple[ProductRole, ProductRole]:
    """按名字 get_or_create，已存在的不覆盖权限（管理员可能已经改过）。"""
    admin_role, _ = ProductRole.objects.get_or_create(
        product=product,
        name=PRODUCT_ADMIN_ROLE_NAME,
        defaults={
            "description": "产品的全部权限。产品负责人自动拥有此角色。",
            "permissions": {"permission_keys": list(PRODUCT_ADMIN_PERMISSION_KEYS)},
        },
    )
    member_role, _ = ProductRole.objects.get_or_create(
        product=product,
        name=PRODUCT_MEMBER_ROLE_NAME,
        defaults={
            "description": "维护需求：新建、编辑、模块、评审、基线、用例关联。新成员默认角色。",
            "permissions": {"permission_keys": list(PRODUCT_MEMBER_PERMISSION_KEYS)},
        },
    )
    return admin_role, member_role


def bind_product_member_role(member: ProductMember, role: ProductRole) -> None:
    ProductMemberRole.objects.get_or_create(member=member, role=role)
