"""项目阶段（ProjectStage）建表 + 存量项目从研发模式回填一份阶段（PMS-101 第一期）。

回填只做活跃、非模板项目：历史模型的 ``objects`` 是裸 Manager，不过滤会给软删 / 模板项目
也拷一份。``bulk_create`` 绕过模型 ``save()``，workspace / sort_order 都显式给。
模式零阶段（Scrum）的项目零行，正常。

删 Milestone 放在 0397，与本迁移分开 —— 同一迁移里 Django 不保证操作顺序（同 0319）。
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid

SORT_ORDER_STEP = 10000


def backfill_project_stages(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    DevModeStage = apps.get_model("db", "DevModeStage")
    ProjectStage = apps.get_model("db", "ProjectStage")

    projects = Project.objects.filter(
        deleted_at__isnull=True, is_template=False, dev_mode__isnull=False
    ).only("id", "workspace_id", "dev_mode_id")

    rows = []
    for project in projects:
        mode_stages = DevModeStage.objects.filter(
            dev_mode_id=project.dev_mode_id, deleted_at__isnull=True
        ).order_by("sort_order", "created_at", "id")
        for index, mode_stage in enumerate(mode_stages):
            rows.append(
                ProjectStage(
                    id=uuid.uuid4(),
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    stage_type_id=mode_stage.stage_type_id,
                    name=mode_stage.name,
                    workload_ratio=mode_stage.workload_ratio,
                    sort_order=(index + 1) * SORT_ORDER_STEP,
                    source_stage_id=mode_stage.id,
                )
            )
    if rows:
        ProjectStage.objects.bulk_create(rows, batch_size=500)


def unbackfill_project_stages(apps, schema_editor):
    ProjectStage = apps.get_model("db", "ProjectStage")
    ProjectStage.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0394_issue_product_product_module"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectStage",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("name", models.CharField(max_length=255, verbose_name="阶段名称")),
                ("description", models.TextField(blank=True, default="", verbose_name="描述")),
                ("is_milestone", models.BooleanField(default=False, verbose_name="是否里程碑")),
                ("workload_ratio", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name="工作量占比（%）")),
                ("start_date", models.DateField(blank=True, null=True, verbose_name="计划开始")),
                ("end_date", models.DateField(blank=True, null=True, verbose_name="计划结束")),
                ("actual_start", models.DateField(blank=True, null=True, verbose_name="实际开始")),
                ("actual_end", models.DateField(blank=True, null=True, verbose_name="实际完成")),
                ("status", models.CharField(choices=[("not_started", "未开始"), ("in_progress", "进行中"), ("paused", "已暂停"), ("completed", "已完成")], db_index=True, default="not_started", max_length=20, verbose_name="状态")),
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("owner", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="owned_project_stages", to=settings.AUTH_USER_MODEL, verbose_name="负责人")),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name="children", to="db.projectstage", verbose_name="父阶段")),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project")),
                ("source_stage", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="project_stages", to="db.devmodestage", verbose_name="来源模式阶段")),
                ("stage_type", models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name="project_stages", to="db.stagetype", verbose_name="阶段类型")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace")),
            ],
            options={
                "verbose_name": "Project Stage",
                "verbose_name_plural": "Project Stages",
                "db_table": "project_stages",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        migrations.AddIndex(
            model_name="projectstage",
            index=models.Index(fields=["project", "parent"], name="ps_project_parent"),
        ),
        migrations.AddIndex(
            model_name="projectstage",
            index=models.Index(fields=["project", "source_stage"], name="ps_project_source"),
        ),
        migrations.RunPython(backfill_project_stages, unbackfill_project_stages),
    ]
