# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""删掉 FileAsset.asset FileField + 它的索引。

执行时机：必须晚于 0236_run_migrate_asset_paths——后者把每条记录的
``asset`` (老 minio key) 反向解析成 ``path + filename`` 之后，asset 列已经没人读，
本迁移才把列彻底干掉。

回滚：不可逆。如果真要回滚，需要先重写一个反向数据迁移把 path/filename 拼回老 key
再加回 asset 字段；这里直接 noop 防止误操作丢数据。
"""

from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0236_run_migrate_asset_paths"),
    ]

    operations = [
        # 先删旧索引 asset_asset_idx（避免 RemoveField 时索引仍引用列）
        migrations.RemoveIndex(
            model_name="fileasset",
            name="asset_asset_idx",
        ),
        migrations.RemoveField(
            model_name="fileasset",
            name="asset",
        ),
        # 启用同 path 下 active 文件 filename 唯一约束（DB 层兜底，并发上传不会冲）
        migrations.AddConstraint(
            model_name="fileasset",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False), ("path__isnull", False)),
                fields=("path", "filename"),
                name="fileasset_uniq_active_filename_per_path",
            ),
        ),
    ]
