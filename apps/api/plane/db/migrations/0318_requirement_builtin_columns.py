import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def drop_builtin_field_rows(apps, schema_editor):
    """内置字段不再是 RequirementField —— 把旧的标题/描述字段行清掉。

    开发库理论上是空的，但真有残留行时，留着会变成两个没有分类、没人认领的
    自定义字段，比直接删掉更难排查。
    """
    RequirementField = apps.get_model("db", "RequirementField")
    RequirementField.objects.filter(builtin_key__isnull=False).delete()


class Migration(migrations.Migration):
    """内置字段从 RequirementField 迁到条目表的真实列上，并给自定义字段加分类。

    内置字段由两个（标题/描述）扩到八个（+ 状态/优先级/负责人/开始日期/截止日期/
    父项）。原来是「定义在字段表、值在列上」的混合模式，现在定义也不进字段表了：
    RequirementField 从此只装用户自定义的字段，data 只装自定义字段的值。

    field_category 没有模型默认值（建字段时必须显式选），加列时用一次性 default
    把存量行补齐后立刻丢掉（preserve_default=False）。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0317_requirement_as_leaf"),
    ]

    operations = [
        # 1) 拆掉内置字段机制
        migrations.RunPython(
            drop_builtin_field_rows, migrations.RunPython.noop, elidable=False
        ),
        migrations.RemoveConstraint(
            model_name="requirementfield",
            name="req_field_unique_type_builtin_key",
        ),
        migrations.RemoveConstraint(
            model_name="requirementfield",
            name="req_field_builtin_must_be_root",
        ),
        migrations.RemoveField(model_name="requirementfield", name="builtin_key"),
        # 2) 自定义字段的分类
        migrations.AddField(
            model_name="requirementfield",
            name="field_category",
            field=models.CharField(
                choices=[("standard", "标准字段"), ("data", "数据字段")],
                default="standard",
                max_length=20,
                verbose_name="字段分类（标准字段 / 数据字段）",
            ),
            preserve_default=False,
        ),
        # 3) 条目表的内置列
        migrations.AddField(
            model_name="requirement",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("in_review", "评审中"),
                    ("confirmed", "已确认"),
                    ("implemented", "已实现"),
                    ("obsolete", "已废弃"),
                ],
                db_index=True,
                default="draft",
                max_length=30,
                verbose_name="需求状态",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="priority",
            field=models.CharField(
                choices=[
                    ("urgent", "紧急"),
                    ("high", "高"),
                    ("medium", "中"),
                    ("low", "低"),
                    ("none", "无"),
                ],
                db_index=True,
                default="none",
                max_length=30,
                verbose_name="优先级",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="assignee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_requirements",
                to=settings.AUTH_USER_MODEL,
                verbose_name="负责人",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="start_date",
            field=models.DateField(blank=True, null=True, verbose_name="开始日期"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="target_date",
            field=models.DateField(blank=True, null=True, verbose_name="截止日期"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sub_requirements",
                to="db.requirement",
                verbose_name="父项",
            ),
        ),
        # 4) 草稿行必须与正式行同构，否则物化会漏字段
        migrations.AddField(
            model_name="requirementdraftrow",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("in_review", "评审中"),
                    ("confirmed", "已确认"),
                    ("implemented", "已实现"),
                    ("obsolete", "已废弃"),
                ],
                db_index=True,
                default="draft",
                max_length=30,
                verbose_name="需求状态",
            ),
        ),
        migrations.AddField(
            model_name="requirementdraftrow",
            name="priority",
            field=models.CharField(
                choices=[
                    ("urgent", "紧急"),
                    ("high", "高"),
                    ("medium", "中"),
                    ("low", "低"),
                    ("none", "无"),
                ],
                db_index=True,
                default="none",
                max_length=30,
                verbose_name="优先级",
            ),
        ),
        migrations.AddField(
            model_name="requirementdraftrow",
            name="assignee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_requirement_draft_rows",
                to=settings.AUTH_USER_MODEL,
                verbose_name="负责人",
            ),
        ),
        migrations.AddField(
            model_name="requirementdraftrow",
            name="start_date",
            field=models.DateField(blank=True, null=True, verbose_name="开始日期"),
        ),
        migrations.AddField(
            model_name="requirementdraftrow",
            name="target_date",
            field=models.DateField(blank=True, null=True, verbose_name="截止日期"),
        ),
        migrations.AddField(
            model_name="requirementdraftrow",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sub_draft_rows",
                to="db.requirementdraftrow",
                verbose_name="父项",
            ),
        ),
    ]
