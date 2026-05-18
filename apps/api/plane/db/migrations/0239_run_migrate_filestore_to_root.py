# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""自动执行 `migrate_filestore_to_root` 数据迁移。

为什么需要这次迁移：
    - 新的 FilestoreExplorer 列表接口按 ``path=FILESTORE_ROOT`` 严格过滤；
    - 历史 PROJECT_FILESTORE 资产的 ``path`` 可能因 0236 自动迁移被跳过/失败
      而停在 NULL 或其他节点，导致这些旧文件在新页面下不可见；
    - 这里把命令显式编成一次数据迁移，让 `migrate` 期间自动调用一次。

行为要点（幂等 + 安全）：
    - 内部直接 call_command("migrate_filestore_to_root", "--no-dry-run")，复用同一套
      分桶逻辑（noop / null_bound / null_uploaded_skipped / rebound / failed）；
    - 完全幂等：第二次起所有资产都会落入 noop，不会重复 copy；
    - 不会强迁 path=NULL 且 is_uploaded=True 的脏数据（旧 S3 key 已不可知），
      仅以 warning 输出，留待人工处理；
    - 任何异常都 **不阻塞** schema 迁移：打印警告 + 提示用户后续手动跑命令；
    - 通过环境变量 ``SKIP_AUTO_MIGRATE_FILESTORE_TO_ROOT=1`` 可显式跳过
      （灰度发布、stage 演练、缺失 S3 凭据等场景）。

reverse 方向无需做事：物理对象已 copy 到新位置且 path FK 已重绑，
回滚的代价远高于收益，直接 noop。
"""

from __future__ import annotations

import os
import traceback

from django.core.management import call_command
from django.db import migrations


SKIP_ENV = "SKIP_AUTO_MIGRATE_FILESTORE_TO_ROOT"


def _run_migrate_filestore_to_root(apps, schema_editor):
    if os.environ.get(SKIP_ENV) == "1":
        print(
            f"[0239_run_migrate_filestore_to_root] 检测到 {SKIP_ENV}=1，跳过自动数据迁移。"
            f"请稍后手动执行 `python manage.py migrate_filestore_to_root --no-dry-run`。"
        )
        return

    try:
        # verbosity=1 让 stdout 输出分桶统计与 warning 详情，便于发布后排查。
        call_command("migrate_filestore_to_root", "--no-dry-run", verbosity=1)
    except Exception:  # noqa: BLE001
        print(
            "[0239_run_migrate_filestore_to_root] 自动执行 migrate_filestore_to_root 失败，"
            "schema 迁移已完成；请在排查后手动执行 "
            "`python manage.py migrate_filestore_to_root --dry-run` 复查并重跑。"
        )
        traceback.print_exc()


class Migration(migrations.Migration):
    # 该迁移会调用大量 S3 + DB IO。设置为 non-atomic，避免命令内部出现异常时
    # 把外层 migration 事务打脏，导致“已捕获异常但迁移仍失败”。
    atomic = False

    dependencies = [
        ("db", "0238_filepath_filestore_root_user_folder"),
    ]

    operations = [
        migrations.RunPython(_run_migrate_filestore_to_root, migrations.RunPython.noop),
    ]
