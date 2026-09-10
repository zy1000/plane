from django.db import migrations


REVIEW_TAILORING_PERMISSIONS = [
    {
        "key": "project.review_tailoring.view",
        "name": "查看评审裁剪",
        "description": "查看本项目的裁剪表与裁剪明细",
        "module": "project.review_tailoring",
        "action": "view",
        "sort_order": 1,
    },
    {
        "key": "project.review_tailoring.manage",
        "name": "维护评审裁剪",
        "description": "新建/编辑/删除裁剪表，勾选裁剪项、提交签批与发起修订",
        "module": "project.review_tailoring",
        "action": "manage",
        "sort_order": 2,
    },
]

VIEW_KEYS = ["project.review_tailoring.view"]
MANAGE_KEYS = ["project.review_tailoring.manage"]
ALL_KEYS = [permission["key"] for permission in REVIEW_TAILORING_PERMISSIONS]

# 裁剪表的纵轴是评审模板、横轴是项目关联的产品：能看到项目里的产品需求，就该能看到
# 这张表。跟着 project.requirement_link.view 走，与项目「产品」子菜单同一条线。
VIEW_SOURCE_KEY = "project.requirement_link.view"
# 建表 / 勾选 / 提交签批改的是项目自己的流程数据，按「能管项目关联的产品」这条线放，
# 与 project.product_link.manage 同级，不跟着看的人走。
MANAGE_SOURCE_KEY = "project.product_link.manage"


def _upsert_permissions(Permission):
    for permission in REVIEW_TAILORING_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["description"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "评审裁剪",
                "sort_order": permission["sort_order"],
                "is_active": True,
                "deleted_at": None,
            },
        )


def _grant_permissions_to_roles(
    RoleModel, source_permission_key, permission_keys_to_grant, filters=None
):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if (
            not isinstance(permission_keys, list)
            or source_permission_key not in permission_keys
        ):
            continue

        next_permission_keys = list(permission_keys)
        for key in permission_keys_to_grant:
            if key not in next_permission_keys:
                next_permission_keys.append(key)

        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_permissions_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    keys_to_remove = set(ALL_KEYS)
    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue

        filtered = [key for key in permission_keys if key not in keys_to_remove]
        if filtered != permission_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_review_tailoring_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permissions(Permission)

    # WorkspaceRole(type="project_template") 是新项目的角色蓝本，两边都要写，
    # 否则今天的项目有、明天建的项目没有。口径同 0329。
    for RoleModel, filters in (
        (ProjectRole, None),
        (WorkspaceRole, {"type": "project_template"}),
    ):
        _grant_permissions_to_roles(RoleModel, VIEW_SOURCE_KEY, VIEW_KEYS, filters)
        _grant_permissions_to_roles(RoleModel, MANAGE_SOURCE_KEY, MANAGE_KEYS, filters)


def unseed_review_tailoring_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(ProjectRole)
    _remove_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=ALL_KEYS).delete()


class Migration(migrations.Migration):
    """评审裁剪的两个项目级权限 key。

    没有单独的「签批」key —— 能不能签批由「是不是本轮签批人」判定（见
    utils/review_tailoring.py::act_on_tailoring），多一个 key 只会让配错权限的人
    以为自己能签批。
    """

    dependencies = [("db", "0364_review_tailoring_workflow")]

    operations = [
        migrations.RunPython(
            seed_review_tailoring_permissions,
            unseed_review_tailoring_permissions,
        ),
    ]
