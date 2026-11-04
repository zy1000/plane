"""去掉「系统权限组」：没有 system_key，所有权限组都是普通的、可配的，成员不默认属于任何组。

数据：原来两个「管理员」系统组（workspace_admin / project_admin）的权限是运行时算出来的全集，
JSON 里存的不完整；去掉系统组后它们变成普通组，这里把全集显式写进 permission_keys，绑着它们的人
权限不变。「工作区成员」「项目成员」两组原来是每个成员隐式持有、没有绑定行，这里**不**补绑定：
它们保留为普通组（可改、可删），但没有人在里面——用户要求不默认给成员加组。
"""

from django.db import migrations

ADMIN_SCOPES = {
    "workspace_admin": ("workspace", "project"),
    "project_admin": ("project",),
}


def write_admin_keys(apps, schema_editor):
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    Permission = apps.get_model("db", "Permission")
    keys_by_scope = {}
    for key, scope in Permission.objects.values_list("key", "scope"):
        keys_by_scope.setdefault(scope, set()).add(key)
    changed = 0
    for role in WorkspaceRole.objects.filter(system_key__in=list(ADMIN_SCOPES)):
        keys = set()
        for scope in ADMIN_SCOPES[role.system_key]:
            keys |= keys_by_scope.get(scope, set())
        role.permissions = {"permission_keys": sorted(keys)}
        role.save(update_fields=["permissions"])
        changed += 1
    print(f"\n  系统组退役：{changed} 个管理员组写入显式全集")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0439_retire_integer_roles"),
    ]

    operations = [
        migrations.RunPython(write_admin_keys, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="workspacerole",
            name="workspace_role_unique_system_key_when_active",
        ),
        migrations.RemoveField(
            model_name="workspacerole",
            name="system_key",
        ),
    ]
