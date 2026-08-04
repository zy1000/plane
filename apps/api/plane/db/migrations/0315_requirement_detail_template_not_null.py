from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """收紧结构 —— 数据已由 0314 补齐，见 0313 的说明。"""

    dependencies = [
        ("db", "0314_requirement_template_binding_data"),
    ]

    operations = [
        migrations.AlterField(
            model_name="requirementdetail",
            name="template",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_details",
                to="db.requirement",
                verbose_name="所属需求模板",
            ),
        ),
        migrations.AlterField(
            model_name="requirementdraftdetail",
            name="template",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_draft_details",
                to="db.requirement",
                verbose_name="所属需求模板",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementfield",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("builtin_key__isnull", False), ("deleted_at__isnull", True)
                ),
                fields=("requirement", "builtin_key"),
                name="req_field_unique_requirement_builtin_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementfield",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("builtin_key__isnull", True),
                    ("parent_field__isnull", True),
                    _connector="OR",
                ),
                name="req_field_builtin_must_be_root",
            ),
        ),
    ]
