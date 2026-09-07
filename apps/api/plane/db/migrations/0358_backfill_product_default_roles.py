from django.db import migrations


# 规格副本：与 plane/utils/product_roles.py 保持一致。
ADMIN_ROLE_NAME = "产品管理员"
MEMBER_ROLE_NAME = "产品成员"

ADMIN_PERMISSION_KEYS = [
    "product.settings.edit",
    "product.settings.delete",
    "product.member.invite",
    "product.member.remove",
    "product.member.bind_role",
    "product.role.manage",
    "product.requirement.create",
    "product.requirement.edit",
    "product.requirement.delete",
    "product.requirement_module.manage",
    "product.change_request.submit",
    "product.baseline.manage",
    "product.project_link.manage",
    "product.test_case_link.manage",
]

MEMBER_PERMISSION_KEYS = [
    "product.requirement.create",
    "product.requirement.edit",
    "product.requirement_module.manage",
    "product.change_request.submit",
    "product.baseline.manage",
    "product.test_case_link.manage",
]

ROLE_SPECS = (
    (ADMIN_ROLE_NAME, "产品的全部权限。产品负责人自动拥有此角色。", ADMIN_PERMISSION_KEYS),
    (MEMBER_ROLE_NAME, "维护需求：新建、编辑、模块、评审、基线、用例关联。新成员默认角色。", MEMBER_PERMISSION_KEYS),
)


def backfill_product_default_roles(apps, schema_editor):
    Product = apps.get_model("db", "Product")
    ProductMember = apps.get_model("db", "ProductMember")
    ProductRole = apps.get_model("db", "ProductRole")
    ProductMemberRole = apps.get_model("db", "ProductMemberRole")

    for product in Product.objects.filter(deleted_at__isnull=True).iterator(chunk_size=100):
        roles = {}
        for name, description, keys in ROLE_SPECS:
            role, _ = ProductRole.objects.get_or_create(
                product=product,
                name=name,
                defaults={
                    "description": description,
                    "permissions": {"permission_keys": list(keys)},
                },
            )
            roles[name] = role

        members = ProductMember.objects.filter(product=product)
        bound_member_ids = set(
            ProductMemberRole.objects.filter(member__product=product)
            .values_list("member_id", flat=True)
        )
        for member in members:
            if member.member_id == product.owner_id:
                ProductMemberRole.objects.get_or_create(
                    member=member, role=roles[ADMIN_ROLE_NAME]
                )
            elif member.id not in bound_member_ids:
                ProductMemberRole.objects.get_or_create(
                    member=member, role=roles[MEMBER_ROLE_NAME]
                )


def remove_product_default_roles(apps, schema_editor):
    ProductRole = apps.get_model("db", "ProductRole")
    # 只删仍与规格一致的默认角色（连带绑定 CASCADE）；被人改过权限的留下。
    for name, _, keys in ROLE_SPECS:
        for role in ProductRole.objects.filter(name=name):
            permissions = role.permissions if isinstance(role.permissions, dict) else {}
            if permissions.get("permission_keys") == list(keys):
                role.delete()


class Migration(migrations.Migration):
    """给存量产品补默认角色并回填成员绑定。

    - 每个活跃产品建「产品管理员」「产品成员」两个角色（已有同名的不覆盖）
    - 负责人的成员行绑产品管理员
    - 其余没有任何角色绑定的成员行绑产品成员；已有绑定的不动
    幂等，可重跑。
    """

    dependencies = [("db", "0357_seed_product_permissions")]

    operations = [
        migrations.RunPython(backfill_product_default_roles, remove_product_default_roles),
    ]
