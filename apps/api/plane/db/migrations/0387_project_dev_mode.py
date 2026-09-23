"""项目接入研发模式（批次 3）。

三步走，放在同一个文件里：

1. 加 ``release_view`` / ``review_view`` 两个功能位，以及可空的 ``dev_mode`` 列。
   发布 tab 此前跟着 ``module_view``、评审 tab 恒显示，接了模式之后两者都要有自己的位。
2. 每个工作区把存量项目回填到该工作区的「混合模式」（组件全开，等价于加模式之前的现状）。
   找不到就中止：0386 已给每个工作区预置了三个模式，缺了说明上一支迁移没跑完，
   继续往下走只会在第 3 步撞 NOT NULL。
3. 把 ``dev_mode`` 改成 NOT NULL。

回填必须覆盖**全部**行：软删的、模板项目（``is_template=True``）都要有值，
否则第 3 步过不去。历史模型的默认管理器是裸 Manager，``objects.all()`` 正好是全量。
"""

import django.db.models.deletion
from django.db import migrations, models

#: 与 seed_data.dev_modes.DEFAULT_DEV_MODE_NAME 同值。迁移不 import 运行时模块，
#: 但这份规格是零 import 的纯常量模块，可以直接引。
from plane.db.seed_data.dev_modes import DEFAULT_DEV_MODE_NAME

BATCH_SIZE = 2000


def backfill_dev_mode(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    DevMode = apps.get_model("db", "DevMode")

    workspace_ids = list(
        Project.objects.filter(dev_mode__isnull=True)
        .values_list("workspace_id", flat=True)
        .distinct()
    )
    if not workspace_ids:
        return

    default_by_workspace = {}
    for workspace_id in workspace_ids:
        dev_mode = (
            DevMode.objects.filter(
                workspace_id=workspace_id, is_system=True, name=DEFAULT_DEV_MODE_NAME
            )
            .order_by("created_at", "id")
            .first()
        )
        if dev_mode is None:
            raise RuntimeError(
                f"工作区 {workspace_id} 没有预置的「{DEFAULT_DEV_MODE_NAME}」，"
                "无法回填项目的研发模式。请先确认迁移 0386_seed_dev_modes 已执行成功。"
            )
        default_by_workspace[workspace_id] = dev_mode.id

    for workspace_id, dev_mode_id in default_by_workspace.items():
        Project.objects.filter(workspace_id=workspace_id, dev_mode__isnull=True).update(
            dev_mode_id=dev_mode_id
        )


def unbackfill_dev_mode(apps, schema_editor):
    # 第 3 步回退成可空之后，把值清掉，让 RemoveField 不留引用
    Project = apps.get_model("db", "Project")
    Project.objects.update(dev_mode=None)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0386_seed_dev_modes"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="release_view",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="project",
            name="review_view",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="project",
            name="dev_mode",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects",
                to="db.devmode",
                verbose_name="研发模式",
            ),
        ),
        migrations.RunPython(backfill_dev_mode, unbackfill_dev_mode),
        migrations.AlterField(
            model_name="project",
            name="dev_mode",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects",
                to="db.devmode",
                verbose_name="研发模式",
            ),
        ),
    ]
