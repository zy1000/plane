# 需求评审改造：评审人与通过规则从产品级下沉到每张变更单。
#
# 产品级的 RequirementApprovalPolicy / RequirementApprover 不再存在 —— 名单与规则由
# 提交人在提交评审时给定，直接写进 RequirementChangeRequest 与
# RequirementChangeApproval。在途的待审单不受影响：它们的名单与规则本来就在单上。
# 通过规则新增 none（无需评审，提交即通过）。

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0344_product_owner_membership"),
    ]

    operations = [
        migrations.DeleteModel(
            name="RequirementApprover",
        ),
        migrations.DeleteModel(
            name="RequirementApprovalPolicy",
        ),
        migrations.AlterField(
            model_name="requirementchangerequest",
            name="approval_type",
            field=models.CharField(
                choices=[
                    ("none", "无需评审"),
                    ("any", "任一人通过"),
                    ("all", "全部通过"),
                    ("n_of_m", "至少 N 人通过"),
                ],
                default="any",
                max_length=10,
                verbose_name="审批通过规则",
            ),
        ),
        migrations.AlterField(
            model_name="requirementchangerequest",
            name="required_count",
            field=models.PositiveSmallIntegerField(
                blank=True, null=True, verbose_name="最少通过人数"
            ),
        ),
    ]
