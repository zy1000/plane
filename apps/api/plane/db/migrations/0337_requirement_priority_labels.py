# 需求优先级的标签与 Issue.PRIORITY_CHOICES 对齐（中文 -> 英文）。
#
# **只动 choices，不动数据也不动表结构**：五个取值一个没变，CharField 的 choices 在
# PostgreSQL 上不生成任何约束，这条迁移纯粹是让迁移状态跟上模型定义，否则
# `makemigrations --check` 会一直报有未落地的改动。
#
# 为什么是英文：需求网格的优先级单元格与工作项的 PriorityDropdown 共用前端常量
# ISSUE_PRIORITIES，页面上显示的就是 Urgent / High / …。标签留中文的话，凡是拿 label
# 当展示值的地方（Excel 导出、admin、browsable API）都会和页面对不上。

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0336_requirement_test_case_link"),
    ]

    operations = [
        migrations.AlterField(
            model_name="requirement",
            name="priority",
            field=models.CharField(
                choices=[
                    ("urgent", "Urgent"),
                    ("high", "High"),
                    ("medium", "Medium"),
                    ("low", "Low"),
                    ("none", "None"),
                ],
                db_index=True,
                default="none",
                max_length=30,
                verbose_name="优先级",
            ),
        ),
    ]
