# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class DbConfig(AppConfig):
    name = "plane.db"

    def ready(self) -> None:
        # 注册 FilePath 名称同步等 ORM 信号
        from plane.db import signals  # noqa: F401
        from plane.db.permission_bootstrap import (
            ensure_static_permissions,
            register_permission_bootstrap,
        )

        register_permission_bootstrap(self)
        ensure_static_permissions()
