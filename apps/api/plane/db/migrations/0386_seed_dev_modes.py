import uuid

from django.db import migrations

from plane.db.seed_data.dev_modes import (
    DEV_MODE_SPECS,
    SORT_ORDER_STEP,
    normalize_features,
)

# 研发模式的工作区级权限。
# 与 permission_bootstrap.PERMISSION_OVERRIDES 里的定义保持一致，改一处要同步另一处。
DEV_MODE_PERMISSIONS = [
    {
        "key": "workspace.dev_mode.view",
        "name": "查看研发模式",
        "description": "查看研发模式列表、组件开关与阶段配置",
        "module": "dev_mode",
        "action": "view",
        "category": "研发模式",
        "sort_order": 1,
    },
    {
        "key": "workspace.dev_mode.manage",
        "name": "维护研发模式",
        "description": "新建/编辑/删除研发模式，维护组件开关、阶段与阶段下勾选的评审节点",
        "module": "dev_mode",
        "action": "manage",
        "category": "研发模式",
        "sort_order": 2,
    },
]

ALL_KEYS = [item["key"] for item in DEV_MODE_PERMISSIONS]

WORKSPACE_ROLE_TYPE = "workspace"

# 回填口径同 0363：只给管理员类角色。判定用「删除工作区」——它是管理员独有的一项。
ADMIN_MARKER_KEY = "workspace.settings.delete"


def _role_permission_keys(role):
    permissions = role.permissions if isinstance(role.permissions, dict) else {}
    permission_keys = permissions.get("permission_keys")
    return permission_keys if isinstance(permission_keys, list) else None


def _seed_permissions(apps):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    for item in DEV_MODE_PERMISSIONS:
        defaults = {key: value for key, value in item.items() if key != "key"}
        Permission.objects.update_or_create(
            key=item["key"],
            defaults={
                **defaults,
                "scope": "workspace",
                "is_active": True,
                # 软删过的同名行要复活，否则唯一键会挡住插入
                "deleted_at": None,
            },
        )

    for role in WorkspaceRole.objects.filter(type=WORKSPACE_ROLE_TYPE):
        permission_keys = _role_permission_keys(role)
        if permission_keys is None or ADMIN_MARKER_KEY not in permission_keys:
            continue
        next_permission_keys = list(permission_keys)
        for key in ALL_KEYS:
            if key not in next_permission_keys:
                next_permission_keys.append(key)
        if next_permission_keys != permission_keys:
            permissions = role.permissions if isinstance(role.permissions, dict) else {}
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _seed_dev_modes(apps):
    """每个工作区建三个预置模式。

    幂等口径同运行时的 ``ensure_dev_modes``：该工作区已有任意 DevMode 行就整体跳过。
    历史模型不跑自定义 ``save()``，所以 ``features`` / ``workspace_id`` / ``sort_order``
    都要在这里显式给全。

    阶段类型与评审模板树由 0362 / 0383 保证已存在；真缺了（比如用户把类型全删过）就
    只建模式不建阶段，不在迁移里硬造数据。
    """
    Workspace = apps.get_model("db", "Workspace")
    DevMode = apps.get_model("db", "DevMode")
    DevModeStage = apps.get_model("db", "DevModeStage")
    DevModeStageTemplate = apps.get_model("db", "DevModeStageTemplate")
    StageType = apps.get_model("db", "StageType")
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")

    for workspace in Workspace.objects.all().iterator():
        if DevMode.objects.filter(workspace_id=workspace.id).exists():
            continue

        stage_types = list(
            StageType.objects.filter(
                workspace_id=workspace.id, deleted_at__isnull=True
            ).order_by("sort_order", "created_at", "id")
        )
        templates_by_stage = {}
        for template in StageReviewTemplate.objects.filter(
            workspace_id=workspace.id, deleted_at__isnull=True, is_active=True
        ).only("id", "stage_id"):
            templates_by_stage.setdefault(template.stage_id, []).append(template.id)

        for spec in DEV_MODE_SPECS:
            dev_mode = DevMode.objects.create(
                id=uuid.uuid4(),
                workspace_id=workspace.id,
                name=spec["name"],
                description=spec["description"],
                icon_props=dict(spec["icon_props"]),
                features=normalize_features(spec["features"]),
                is_system=True,
            )
            if not spec["seed_all_stages"]:
                continue

            stages = [
                DevModeStage(
                    id=uuid.uuid4(),
                    dev_mode_id=dev_mode.id,
                    workspace_id=workspace.id,
                    stage_type_id=stage_type.id,
                    name=stage_type.name,
                    sort_order=(index + 1) * SORT_ORDER_STEP,
                )
                for index, stage_type in enumerate(stage_types)
            ]
            DevModeStage.objects.bulk_create(stages)
            DevModeStageTemplate.objects.bulk_create(
                [
                    DevModeStageTemplate(
                        id=uuid.uuid4(),
                        dev_mode_stage_id=stage.id,
                        template_id=template_id,
                    )
                    for stage in stages
                    for template_id in templates_by_stage.get(stage.stage_type_id, [])
                ]
            )


def forward(apps, schema_editor):
    _seed_permissions(apps)
    _seed_dev_modes(apps)


def backward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    DevMode = apps.get_model("db", "DevMode")

    key_set = set(ALL_KEYS)
    for role in WorkspaceRole.objects.filter(type=WORKSPACE_ROLE_TYPE):
        permission_keys = _role_permission_keys(role)
        if permission_keys is None:
            continue
        next_permission_keys = [key for key in permission_keys if key not in key_set]
        if next_permission_keys != permission_keys:
            permissions = role.permissions if isinstance(role.permissions, dict) else {}
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])

    Permission.objects.filter(key__in=ALL_KEYS).delete()
    # 阶段与勾选按 CASCADE 一起走
    DevMode.objects.filter(is_system=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0385_dev_mode"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
