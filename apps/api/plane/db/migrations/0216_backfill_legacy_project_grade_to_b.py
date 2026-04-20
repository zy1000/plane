# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

"""
将上线 `grade` 字段前已存在、且尚未写入等级的项目统一设为 B。

仅更新 grade 为 NULL 或空字符串的行；已显式选择 P+/P/A/C 的项目保持不变。
"""

from django.db import migrations
from django.db.models import Q


def backfill_grade_b(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    Project.objects.filter(Q(grade__isnull=True) | Q(grade="")).update(grade="B")


def noop_reverse(apps, schema_editor):
    """无法区分哪些 B 由本迁移写入，回滚时不改数据。"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0215_alter_draftissuerelease_id_alter_project_grade_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_grade_b, noop_reverse),
    ]
