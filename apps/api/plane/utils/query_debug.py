# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""调试辅助：打印当前请求的 ORM 查询统计（仅在 DEBUG=True 时使用）"""

from collections import Counter

from django.db import connection


def print_query_stats(request) -> None:
    """
    输出类似下面格式的一行日志，兼容项目原有 `of Queries: N` 前缀：

        GET - /api/xxx of Queries: 11 | duplicates=0 sql_time_ms=39 top_duplicates=[]

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

    print(
        f"{request.method} - {request.get_full_path()} of Queries: {total} "
        f"| duplicates={duplicates} sql_time_ms={sql_time_ms}{top_str}"
    )
