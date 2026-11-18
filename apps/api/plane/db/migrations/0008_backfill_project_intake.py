# 补建收集箱：开着收集（intake_view=True）却没有 Intake 行的项目，收集页列表接口会 404
# 「Intake not found」。
#
# 成因：intake_view 默认改成了 True，但 Intake 行以前只在项目设置保存时补建，新建项目
# （创建接口、简道云同步）都不建。新建项目现在由 setup_new_project 一并建好，这里补存量。
# 反向不删：补出来的收集箱可能已经收了工作项。

from django.db import migrations


def backfill_project_intake(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    Intake = apps.get_model("db", "Intake")

    # 历史模型的管理器不过滤软删行，两边都要显式排除
    has_intake = Intake.objects.filter(deleted_at__isnull=True).values("project_id")
    projects = (
        Project.objects.filter(intake_view=True, deleted_at__isnull=True)
        .exclude(id__in=has_intake)
        .values_list("id", "workspace_id", "name")
    )
    Intake.objects.bulk_create(
        [
            # 名称列 255，给后缀留位；历史模型没有 ProjectBaseModel.save 的 workspace 回填，显式带上
            Intake(name=f"{name[:248]} Intake", project_id=pk, workspace_id=workspace_id, is_default=True)
            for pk, workspace_id, name in projects
        ],
        batch_size=500,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0007_disable_module_feature"),
    ]

    operations = [
        migrations.RunPython(backfill_project_intake, migrations.RunPython.noop),
    ]
