from django.db import migrations


def remove_legacy_workspace_permission_roles(apps, schema_editor):
    WorkspaceMemberRole = apps.get_model("db", "WorkspaceMemberRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    legacy_role_ids = list(
        WorkspaceRole.objects.filter(
            legacy_role__isnull=False,
        ).values_list("id", flat=True)
    )
    if not legacy_role_ids:
        return

    WorkspaceMemberRole.objects.filter(role_id__in=legacy_role_ids).delete()
    WorkspaceRole.objects.filter(id__in=legacy_role_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0291_seed_workspace_member_permissions"),
    ]

    operations = [
        migrations.RunPython(
            remove_legacy_workspace_permission_roles,
            migrations.RunPython.noop,
        ),
    ]
