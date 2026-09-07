from django.db import migrations, models


# 与 plane/app/permissions/keys.py 的 PRODUCT_* 段、
# plane/db/permission_bootstrap.py 的标签表与 PRODUCT_CATEGORY_BY_MODULE 保持一致。
PRODUCT_PERMISSIONS = [
    {"key": "product.settings.edit", "name": "编辑产品设置", "module": "product.settings", "action": "edit", "category": "产品设置", "sort_order": 10},
    {"key": "product.settings.delete", "name": "删除产品", "module": "product.settings", "action": "delete", "category": "产品设置", "sort_order": 20},
    {"key": "product.member.invite", "name": "邀请产品成员", "module": "product.member", "action": "invite", "category": "产品成员与角色", "sort_order": 30},
    {"key": "product.member.remove", "name": "移除产品成员", "module": "product.member", "action": "remove", "category": "产品成员与角色", "sort_order": 40},
    {"key": "product.member.bind_role", "name": "分配产品成员角色", "module": "product.member", "action": "bind_role", "category": "产品成员与角色", "sort_order": 50},
    {"key": "product.role.manage", "name": "管理产品角色", "module": "product.role", "action": "manage", "category": "产品成员与角色", "sort_order": 60},
    {"key": "product.requirement.create", "name": "创建产品需求", "module": "product.requirement", "action": "create", "category": "产品需求", "sort_order": 70},
    {"key": "product.requirement.edit", "name": "编辑产品需求", "module": "product.requirement", "action": "edit", "category": "产品需求", "sort_order": 80},
    {"key": "product.requirement.delete", "name": "删除产品需求", "module": "product.requirement", "action": "delete", "category": "产品需求", "sort_order": 90},
    {"key": "product.requirement_module.manage", "name": "管理需求模块", "module": "product.requirement_module", "action": "manage", "category": "产品需求", "sort_order": 100},
    {"key": "product.change_request.submit", "name": "提交需求评审", "module": "product.change_request", "action": "submit", "category": "产品需求", "sort_order": 110},
    {"key": "product.baseline.manage", "name": "管理需求基线", "module": "product.baseline", "action": "manage", "category": "产品需求", "sort_order": 120},
    {"key": "product.test_case_link.manage", "name": "管理需求用例关联", "module": "product.test_case_link", "action": "manage", "category": "产品需求", "sort_order": 130},
    {"key": "product.project_link.manage", "name": "管理产品关联项目", "module": "product.project_link", "action": "manage", "category": "产品关联", "sort_order": 140},
]

ALL_KEYS = [permission["key"] for permission in PRODUCT_PERMISSIONS]


def seed_product_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    for permission in PRODUCT_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "product",
                "module": permission["module"],
                "action": permission["action"],
                "category": permission["category"],
                "sort_order": permission["sort_order"],
                "is_active": True,
                "deleted_at": None,
            },
        )


def unseed_product_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(key__in=ALL_KEYS).delete()


class Migration(migrations.Migration):
    """产品作用域的 14 个权限 key。

    只播种字典表，不授予任何角色——产品角色此时还不存在，
    默认角色与成员回填在 0358。
    """

    dependencies = [("db", "0356_remove_product_cover")]

    operations = [
        migrations.AlterField(
            model_name="permission",
            name="scope",
            field=models.CharField(
                choices=[
                    ("workspace", "工作区"),
                    ("project", "项目"),
                    ("product", "产品"),
                ],
                default="workspace",
                max_length=20,
            ),
        ),
        migrations.RunPython(seed_product_permissions, unseed_product_permissions),
    ]
