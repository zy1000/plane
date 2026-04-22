# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""调试辅助：打印当前请求的 ORM 查询统计（仅在 DEBUG=True 时使用）"""

import sys
from collections import Counter

from django.db import connection

# 亮青色：正常；亮红色：SQL 耗时或重复查询占比偏高（非 TTY 时不着色）
_QUERY_STATS_COLOR = "\033[96m"
_QUERY_STATS_WARN_COLOR = "\033[91m"
_RESET = "\033[0m"


def _colorize_stats_segment(text: str, *, warn: bool = False) -> str:
    if not sys.stdout.isatty():
        return text
    color = _QUERY_STATS_WARN_COLOR if warn else _QUERY_STATS_COLOR
    return f"{color}{text}{_RESET}"


def print_query_stats(request) -> None:
    """
    输出类似下面格式的一行日志，兼容项目原有 `of Queries: N` 前缀：

        GET - /api/xxx of Queries: 11 | duplicates=0 sql_time_ms=39 top_duplicates=[]

    统计段默认亮青色；若 sql_time_ms > 200 或 duplicates 超过 Queries 的 30%，则为亮红色。

    调用方需自行确保只在 settings.DEBUG=True 时调用。
    """
    queries = connection.queries
    total = len(queries)

    sql_time_ms = int(sum(float(q.get("time", 0)) for q in queries) * 1000)

    sql_counter = Counter(q["sql"] for q in queries)
    duplicates = sum(count - 1 for count in sql_counter.values() if count > 1)
    top_duplicates = [
        f"{count}x {sql[:120]}"
        for sql, count in sql_counter.most_common(3)
        if count > 1
    ]

    top_str = " | top_duplicates=" + str(top_duplicates) if top_duplicates else ""

    warn = sql_time_ms > 200 or (
        total > 0 and duplicates > total * 0.3
    )

    prefix = f"{request.method} - {request.get_full_path()} of "
    stats = (
        f"Queries: {total} | duplicates={duplicates} "
        f"sql_time_ms={sql_time_ms}{top_str}"
    )
    print(prefix + _colorize_stats_segment(stats, warn=warn))
