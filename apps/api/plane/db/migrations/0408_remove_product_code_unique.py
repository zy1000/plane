from django.db import migrations


class Migration(migrations.Migration):
    """产品代号允许重复：去掉工作区内唯一约束，非空 check 保留。"""

    dependencies = [
        ("db", "0407_remove_stage_review_single_owners"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="product",
            name="product_unique_code_workspace_active",
        ),
    ]
