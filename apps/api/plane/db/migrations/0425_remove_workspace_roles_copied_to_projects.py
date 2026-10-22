"""清掉建项目时误拷进项目的工作区角色。

``create_default_role`` 原来没按类型过滤，把工作区角色（type=workspace，如「管理员」「成员」）也拷成了
每个项目的项目角色。这些角色只带 workspace.* 权限，项目鉴权只认项目 scope 的 key，所以它们在项目里
一条都不生效，名字却像管理员，容易误配。建项目流程已改为只拷项目角色模板，这里清存量：来源是工作区
角色的项目角色连同成员 / 用户组绑定一并软删（同项目角色删除接口），删掉不改变任何人的项目权限。

被工作流审批人引用的跳过：审批人按「绑了这个角色的成员」解析，删了会让那条流转少审批人，留给人工处理。

可重复执行。反向不还原。
"""

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    ProjectRole = apps.get_model("db", "ProjectRole")
    ProjectMemberRole = apps.get_model("db", "ProjectMemberRole")
    ProjectGroupRole = apps.get_model("db", "ProjectGroupRole")
    WorkflowTransitionPrincipal = apps.get_model("db", "WorkflowTransitionPrincipal")

    approver_role_ids = WorkflowTransitionPrincipal.objects.filter(
        role__isnull=False, deleted_at__isnull=True
    ).values_list("role_id", flat=True)
    role_ids = list(
        ProjectRole.objects.filter(source_template__type="workspace", deleted_at__isnull=True)
        .exclude(id__in=approver_role_ids)
        .values_list("id", flat=True)
    )
    if not role_ids:
        return

    now = timezone.now()
    ProjectMemberRole.objects.filter(role_id__in=role_ids, deleted_at__isnull=True).update(deleted_at=now)
    ProjectGroupRole.objects.filter(role_id__in=role_ids, deleted_at__isnull=True).update(deleted_at=now)
    ProjectRole.objects.filter(id__in=role_ids).update(deleted_at=now)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0424_fix_project_role_template_type_keys"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
