from django.db import migrations, models

# 与 RequirementProjectStage 保持一致（删掉 pending_verification 之后的五档）
STAGE_CHOICES = [
    ("linked", "已立项"),
    ("planned", "已排期"),
    ("in_progress", "研发中"),
    ("done", "研发完毕"),
    ("released", "已发布"),
]


def migrate_pending_verification_to_done(apps, schema_editor):
    """把「待验证」搬成「研发完毕」。

    不是编造历史：待验证唯一的产出条件是「存在在途发布关联」，而新模型下只有
    研发完毕的需求能进发布单，所以这些行当时的真实状态就是已研发完毕。

    三列都要搬 —— 改 RequirementProjectStage 的取值同时影响关联行的 stage 与
    活动流的 old_stage / new_stage。
    """
    RequirementProject = apps.get_model("db", "RequirementProject")
    RequirementProjectActivity = apps.get_model("db", "RequirementProjectActivity")

    RequirementProject.objects.filter(stage="pending_verification").update(stage="done")
    RequirementProjectActivity.objects.filter(old_stage="pending_verification").update(
        old_stage="done"
    )
    RequirementProjectActivity.objects.filter(new_stage="pending_verification").update(
        new_stage="done"
    )


class Migration(migrations.Migration):
    dependencies = [("db", "0330_requirement_stage_flow")]

    operations = [
        migrations.RunPython(
            migrate_pending_verification_to_done,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="requirementproject",
            name="stage",
            field=models.CharField(
                choices=STAGE_CHOICES,
                db_index=True,
                default="linked",
                max_length=20,
                verbose_name="项目内阶段",
            ),
        ),
        migrations.AlterField(
            model_name="requirementprojectactivity",
            name="new_stage",
            field=models.CharField(
                choices=STAGE_CHOICES, max_length=20, verbose_name="新阶段"
            ),
        ),
        migrations.AlterField(
            model_name="requirementprojectactivity",
            name="old_stage",
            field=models.CharField(
                choices=STAGE_CHOICES, max_length=20, verbose_name="原阶段"
            ),
        ),
    ]
