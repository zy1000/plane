# 风险 ↔ 简道云双向同步（2026-10-20）：
# - 编号改由简道云流水号回填，推送成功前为空
# - 三段富文本改纯文本（与简道云一致）并去掉 _html 后缀；本地风险数据已在迁移前清空
# - 影响程度 / 发生概率 / 等级可空（简道云侧有空值）
# - 新增简道云绑定与推送状态字段

from django.db import migrations, models

SCALE_CHOICES = [(1, "很低"), (2, "低"), (3, "中"), (4, "高"), (5, "很高")]


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0415_project_code_not_unique"),
    ]

    operations = [
        migrations.RenameField(model_name="risk", old_name="description_html", new_name="description"),
        migrations.RenameField(
            model_name="risk", old_name="impact_description_html", new_name="impact_description"
        ),
        migrations.RenameField(
            model_name="risk", old_name="response_measures_html", new_name="response_measures"
        ),
        migrations.AlterField(
            model_name="risk",
            name="code",
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, verbose_name="编号"),
        ),
        migrations.AlterField(
            model_name="risk",
            name="impact_level",
            field=models.PositiveSmallIntegerField(
                blank=True, choices=SCALE_CHOICES, null=True, verbose_name="影响程度"
            ),
        ),
        migrations.AlterField(
            model_name="risk",
            name="probability",
            field=models.PositiveSmallIntegerField(
                blank=True, choices=SCALE_CHOICES, null=True, verbose_name="发生概率"
            ),
        ),
        migrations.AlterField(
            model_name="risk",
            name="risk_level",
            field=models.CharField(
                blank=True,
                choices=[("high", "高"), ("medium", "中"), ("low", "低")],
                db_index=True,
                default="",
                max_length=10,
                verbose_name="风险等级",
            ),
        ),
        migrations.AddField(
            model_name="risk",
            name="external_source",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="risk",
            name="external_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="risk",
            name="sync_status",
            field=models.CharField(
                blank=True,
                choices=[("pending", "待推送"), ("synced", "已同步"), ("failed", "推送失败")],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="risk",
            name="sync_error",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="risk",
            name="synced_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="risk",
            name="external_people",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddConstraint(
            model_name="risk",
            constraint=models.UniqueConstraint(
                condition=models.Q(("external_id", ""), _negated=True),
                fields=("workspace", "external_source", "external_id"),
                name="risk_unique_external",
            ),
        ),
    ]
