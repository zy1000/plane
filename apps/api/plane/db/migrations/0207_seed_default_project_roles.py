import uuid

from django.db import migrations
from django.utils import timezone


def seed_default_project_roles(apps, schema_editor):
    """
    为所有已存在的项目创建"默认角色"（拥有全部项目权限），
    并将每个项目的所有活跃成员绑定到该角色。
    """
    Project = apps.get_model("db", "Project")
    ProjectRole = apps.get_model("db", "ProjectRole")
    ProjectMember = apps.get_model("db", "ProjectMember")
    ProjectMemberRole = apps.get_model("db", "ProjectMemberRole")
    Permission = apps.get_model("db", "Permission")

    project_permission_keys = list(
        Permission.objects.filter(scope="project", is_active=True)
        .values_list("key", flat=True)
    )

    all_permissions = {"permission_keys": project_permission_keys}
    now = timezone.now()

    projects = Project.objects.filter(deleted_at__isnull=True)

    for project in projects.iterator():
        role = ProjectRole(
            id=uuid.uuid4(),
            project=project,
            workspace_id=project.workspace_id,
            name="默认角色",
            description="系统自动创建的默认角色，拥有项目所有权限",
            permissions=all_permissions,
            source_template=None,
            created_at=now,
            updated_at=now,
        )
        role.save()

        members = ProjectMember.objects.filter(
            project=project,
            is_active=True,
            deleted_at__isnull=True,
        )

        member_roles = [
            ProjectMemberRole(
                id=uuid.uuid4(),
                project=project,
                workspace_id=project.workspace_id,
                member=member,
                role=role,
                created_at=now,
                updated_at=now,
            )
            for member in members.iterator()
        ]

        if member_roles:
            ProjectMemberRole.objects.bulk_create(member_roles, batch_size=500)


def unseed_default_project_roles(apps, schema_editor):
    """反向操作：删除所有名为"默认角色"的 ProjectRole 及其关联的 ProjectMemberRole。"""
    ProjectRole = apps.get_model("db", "ProjectRole")
    ProjectMemberRole = apps.get_model("db", "ProjectMemberRole")

    default_roles = ProjectRole.objects.filter(name="默认角色")
    ProjectMemberRole.objects.filter(role__in=default_roles).delete()
    default_roles.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0206_workspacerole_type"),
    ]

    operations = [
        migrations.RunPython(seed_default_project_roles, unseed_default_project_roles),
    ]
