# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""自动执行 `migrate_asset_paths` 数据迁移。

为什么用数据迁移而不是直接在 0235 里 backfill：
    - 0235 只建 schema，不应在那里做 S3 + 数据搬运的长任务；
    - 但是项目部署的人很容易忘记跑 `python manage.py migrate_asset_paths`，
      所以这里把它显式编成一次数据迁移，让 `migrate` 期间自动调用。

行为要点（幂等 + 安全）：
    - 内部直接 call_command("migrate_asset_paths")，复用同一套逻辑；
    - 命令本身做了 key 比对 + path_id 绑定 + 跨桶 legacy File 处理，
      重复跑只会做差量同步，不会重复 copy；
    - 任何异常都 **不阻塞** schema 迁移：打印警告 + 提示用户后续手动跑命令，
      避免让一次大数据搬运卡死全量部署流水线；
    - 通过环境变量 ``SKIP_AUTO_MIGRATE_ASSET_PATHS=1`` 可显式跳过
      （灰度发布、stage 演练、缺失 S3 凭据等场景）。

reverse 方向无需做事：物理对象已经 copy 到新位置且 FilePath/path FK 已建好，
回滚的代价远高于收益，直接 noop。
"""

from __future__ import annotations

import os
import traceback

from django.core.management import call_command
from django.db import migrations


SKIP_ENV = "SKIP_AUTO_MIGRATE_ASSET_PATHS"


def _run_migrate_asset_paths(apps, schema_editor):
    if os.environ.get(SKIP_ENV) == "1":
        print(
            f"[0236_run_migrate_asset_paths] 检测到 {SKIP_ENV}=1，跳过自动数据迁移。"
            f"请稍后手动执行 `python manage.py migrate_asset_paths`。"
        )
        return

    try:
        # verbosity=1 让 stdout 展示进度（dry-run / migrated / failed 等统计），
        # 与直接命令行执行一致；任何 IO/S3 报错都被捕获，不阻塞 migrate。
        call_command("migrate_asset_paths", verbosity=1)
    except Exception:  # noqa: BLE001
        print(
            "[0236_run_migrate_asset_paths] 自动执行 migrate_asset_paths 失败，"
            "schema 迁移已完成；请在排查后手动执行 "
            "`python manage.py migrate_asset_paths --dry-run` 复查并重跑。"
        )
        traceback.print_exc()


class Migration(migrations.Migration):
    # 该迁移会调用大量 S3 + DB IO。设置为 non-atomic，避免命令内部出现异常时
    # 把外层 migration 事务打脏，导致“已捕获异常但迁移仍失败”。
    atomic = False

    # 必须放在 0235_filepath 之后：依赖 FilePath 表 + FileAsset.path 字段已建好。
    dependencies = [
        ("db", "0235_filepath"),
    ]

    operations = [
        migrations.RunPython(_run_migrate_asset_paths, migrations.RunPython.noop),
    ]
