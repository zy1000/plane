from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0256_seed_cycle_comment_permissions"),
    ]

    operations = [
        migrations.AlterField(
            model_name="cycle",
            name="status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("未开始", "Not Started"),
                    ("进行中", "In Progress"),
                    ("测试中", "Testing"),
                    ("已完成", "Completed"),
                    ("已取消", "Cancelled"),
                ],
                default="未开始",
                null=True,
                verbose_name="TestCase Status",
            ),
        ),
    ]
