# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""个人主页「我的工作」：待处理 / 已处理 / 我发起的 + 视图设置。

聚合与口径都在 ``plane/utils/user_work.py``，这里只做参数解析、分页和权限：
看自己只要是工作区成员，看别人要 ``workspace.member.view``（同个人主页其它接口）；
视图设置只有本人能改。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_workspace_self_or_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.utils.user_work import (
    INITIATED_SOURCES,
    PENDING_SOURCES,
    PROCESSED_DAYS,
    PROCESSED_DEFAULT_PAGE_SIZE,
    PROCESSED_MAX_PAGE_SIZE,
    PROCESSED_SOURCES,
    build_initiated_rows,
    build_pending_rows,
    build_processed_rows,
    enabled_sources,
    filter_rows,
    get_user_work_config,
    parse_types,
    pending_summary,
    rows_by_type,
    save_user_work_config,
)


def _workspace_id(slug):
    return Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()


def _int_param(request, name, default, maximum=None):
    try:
        value = int(request.GET.get(name, default))
    except (TypeError, ValueError):
        value = default
    value = max(value, 1)
    return min(value, maximum) if maximum else value


class WorkspaceUserWorkSummaryEndpoint(BaseAPIView):
    """页签条数 + 左栏各类型条数 + 快捷筛选条数 + 摘要页焦点卡的数字，一次给齐。"""

    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def get(self, request, slug, user_id):
        config = get_user_work_config(_workspace_id(slug), user_id)
        pending_rows = build_pending_rows(slug, user_id, request.user, PENDING_SOURCES)
        initiated_rows = build_initiated_rows(slug, user_id, request.user, INITIATED_SOURCES)
        return Response(
            {
                "pending": pending_summary(pending_rows, config),
                "initiated": {"total": len(initiated_rows), "by_type": rows_by_type(initiated_rows)},
                "config": config,
                "can_edit_config": str(request.user.id) == str(user_id),
            }
        )


class WorkspaceUserWorkPendingEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def get(self, request, slug, user_id):
        config = get_user_work_config(_workspace_id(slug), user_id)
        types = parse_types(request.GET.get("types"), PENDING_SOURCES) or enabled_sources(config, "pending")
        rows = build_pending_rows(slug, user_id, request.user, types)
        rows = filter_rows(
            rows,
            search=request.GET.get("search"),
            quick=request.GET.get("quick"),
            owners=request.GET.get("owners"),
        )
        return Response({"rows": rows, "total": len(rows), "types": types})


class WorkspaceUserWorkProcessedEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def get(self, request, slug, user_id):
        config = get_user_work_config(_workspace_id(slug), user_id)
        enabled = enabled_sources(config, "processed")
        types = parse_types(request.GET.get("types"), PROCESSED_SOURCES) or enabled
        days = _int_param(request, "days", config["processed"]["days"])
        if days not in PROCESSED_DAYS:
            days = config["processed"]["days"]
        # 左栏条数要覆盖所有启用的来源，不随当前选中的类型变
        build_types = [key for key in PROCESSED_SOURCES if key in set(enabled) | set(types)]
        all_rows = build_processed_rows(slug, user_id, request.user, build_types, days)
        by_type = rows_by_type(all_rows)
        rows = filter_rows(
            [row for row in all_rows if row["type"] in types],
            search=request.GET.get("search"),
            owners=request.GET.get("owners"),
        )
        page = _int_param(request, "page", 1)
        page_size = _int_param(request, "page_size", PROCESSED_DEFAULT_PAGE_SIZE, PROCESSED_MAX_PAGE_SIZE)
        start = (page - 1) * page_size
        return Response(
            {
                "rows": rows[start : start + page_size],
                "total": len(rows),
                "page": page,
                "page_size": page_size,
                "by_type": by_type,
                "days": days,
                "types": types,
            }
        )


class WorkspaceUserWorkInitiatedEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def get(self, request, slug, user_id):
        types = parse_types(request.GET.get("types"), INITIATED_SOURCES) or list(INITIATED_SOURCES)
        all_rows = build_initiated_rows(slug, user_id, request.user, INITIATED_SOURCES)
        rows = filter_rows(
            [row for row in all_rows if row["type"] in types],
            search=request.GET.get("search"),
            owners=request.GET.get("owners"),
        )
        return Response({"rows": rows, "total": len(rows), "by_type": rows_by_type(all_rows), "types": types})


class WorkspaceUserWorkPreferenceEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def get(self, request, slug, user_id):
        return Response({"config": get_user_work_config(_workspace_id(slug), user_id)})

    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_MEMBER_VIEW)
    def patch(self, request, slug, user_id):
        if str(request.user.id) != str(user_id):
            return Response(
                {"error": "视图设置只能由本人修改", "error_code": "USER_WORK_PREFERENCE_SELF_ONLY"},
                status=status.HTTP_403_FORBIDDEN,
            )
        config = save_user_work_config(_workspace_id(slug), user_id, request.data)
        return Response({"config": config})
