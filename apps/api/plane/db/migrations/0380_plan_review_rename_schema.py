import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """测试计划「评审」改称「复核」：通过规则去掉 any、状态值改名、复核记录挂到具体一次执行。

    只改结构，数据搬迁放在 0381（RunPython 与 ALTER 分开，避免 Postgres pending trigger）。
    """

    dependencies = [
        ("db", "0379_remove_testplan_reviewer"),
    ]

    operations = [
        migrations.AlterField(
            model_name="testplan",
            name="review_approval_type",
            field=models.CharField(
                choices=[("all", "全部通过"), ("n_of_m", "至少 N 人通过")],
                default="all",
                max_length=10,
                verbose_name="TestPlan Review Approval Type",
            ),
        ),
        migrations.AlterField(
            model_name="plancase",
            name="review_status",
            field=models.CharField(
                choices=[
                    ("未复核", "gray"),
                    ("复核中", "blue"),
                    ("通过", "green"),
                    ("不通过", "red"),
                ],
                default="未复核",
                verbose_name="PlanCase Review Status",
            ),
        ),
        migrations.AddField(
            model_name="plancasereviewrecord",
            name="plan_case_record",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="review_records",
                to="db.plancaserecord",
            ),
        ),
    ]
