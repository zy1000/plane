# 需求状态轴改造（2026-08）：把「Requirement.status（系统写）」与
# 「RequirementProject.stage（每 (需求,项目) 一份的派生阶段）」合并成一根需求级、
# 人工维护的状态，落在 Requirement.status 上（新五值 not_started / projected /
# in_progress / released / closed）。
#
# 只改 schema，不做数据映射：执行前须清空产品 / 需求相关表（含软删行），否则
# RemoveField / DeleteModel 会静默丢数据，旧值 draft/confirmed 也会残留。
# 顺序要求：两条 CheckConstraint 引用 status，必须先 Remove 再 AlterField。

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0333_requirement_issue_link"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="requirement",
            name="req_draft_status_iff_never_approved",
        ),
        migrations.RemoveConstraint(
            model_name="requirement",
            name="req_library_item_never_approved",
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("library__isnull", True),
                    models.Q(
                        ("approved_version__isnull", True),
                        ("library__isnull", False),
                        ("pending_change_item__isnull", True),
                    ),
                    _connector="OR",
                ),
                name="req_library_item_never_approved",
            ),
        ),
        migrations.AlterField(
            model_name="requirement",
            name="status",
            field=models.CharField(
                choices=[
                    ("not_started", "未开始"),
                    ("projected", "已立项"),
                    ("in_progress", "进行中"),
                    ("released", "已发布"),
                    ("closed", "已关闭"),
                ],
                db_index=True,
                default="not_started",
                max_length=30,
                verbose_name="需求状态",
            ),
        ),
        migrations.RemoveField(
            model_name="requirementproject",
            name="stage",
        ),
        migrations.DeleteModel(
            name="RequirementProjectActivity",
        ),
    ]
