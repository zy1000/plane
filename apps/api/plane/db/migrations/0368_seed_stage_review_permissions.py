from django.db import migrations


STAGE_REVIEW_PERMISSIONS = [
    {
        "key": "project.stage_review.view",
        "name": "查看阶段评审",
        "description": "查看本项目各阶段的评审、评审活动与执行进度",
        "module": "project.stage_review",
        "action": "view",
        "sort_order": 1,
    },
    {
        "key": "project.stage_review.manage",
        "name": "维护阶段评审",
        "description": "推进评审状态、填写评审结论、维护负责人与附件，手工新建评审",
        "module": "project.stage_review",
        "action": "manage",
        "sort_order": 2,
    },
]

VIEW_KEYS = ["project.stage_review.view"]
MANAGE_KEYS = ["project.stage_review.manage"]
ALL_KEYS = [permission["key"] for permission in STAGE_REVIEW_PERMISSIONS]

# 评审实例是裁剪表签批生效的产物：能看见裁剪表的人就该看见它变成了哪些评审。
VIEW_SOURCE_KEY = "project.review_tailoring.view"
# 执行侧跟着「维护评审裁剪」走 —— 同一条研发流程线上的人，且 0365 已经把这个 key
# 回填给了该有的角色，再挑一条新线只会让两处名单对不上。
MANAGE_SOURCE_KEY = "project.review_tailoring.manage"


def _upsert_permissions(Permission):
    for permission in STAGE_REVIEW_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["description"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "阶段评审",
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


def seed_stage_review_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permissions(Permission)

    # WorkspaceRole(type="project_template") 是新项目的角色蓝本，两边都要写，
    # 否则今天的项目有、明天建的项目没有。口径同 0365。
    for RoleModel, filters in (
        (ProjectRole, None),
        (WorkspaceRole, {"type": "project_template"}),
    ):
        _grant_permissions_to_roles(RoleModel, VIEW_SOURCE_KEY, VIEW_KEYS, filters)
        _grant_permissions_to_roles(RoleModel, MANAGE_SOURCE_KEY, MANAGE_KEYS, filters)


def unseed_stage_review_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(ProjectRole)
    _remove_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=ALL_KEYS).delete()


class Migration(migrations.Migration):
    """阶段评审实例的两个项目级权限 key。

    推进状态没有单独的 key —— 未评审 / 评审中 / 审核中 / 已评审 四步都由
    project.stage_review.manage 放行，谁该推进由负责人与审核者这两个字段表达，
    再拆成四个 key 只会让角色配置变成一道填空题。
    """

    dependencies = [("db", "0367_stage_review_activity")]

    operations = [
        migrations.RunPython(
            seed_stage_review_permissions,
            unseed_stage_review_permissions,
        ),
    ]
