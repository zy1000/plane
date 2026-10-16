"""工作区设置 → 部门：部门树与人员列表（只读）。同步走第三方集成的 mdm_person_info。"""

import uuid

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views import BaseAPIView
from plane.db.models import Workspace
from plane.integrations.base import get_last_sync
from plane.integrations.person_info import SPEC as PERSON_INFO_SPEC
from plane.utils.department import LOGIN_EVER, LOGIN_NEVER, UNASSIGNED, department_people, department_tree

PER_PAGE_OPTIONS = (20, 50, 100, 200)
DEFAULT_PER_PAGE = 50


def _get_workspace(slug):
    return Workspace.objects.filter(slug=slug).first()


def _uuid_or_none(value):
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return None


def _positive_int(value, default):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return number if number > 0 else default


class DepartmentTreeAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_VIEW, level="WORKSPACE")
    def get(self, request, slug):
        workspace = _get_workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        data = department_tree(workspace)
        data["sync"] = {
            "integration_key": PERSON_INFO_SPEC.key,
            "is_configured": not PERSON_INFO_SPEC.missing_settings(),
            "last_sync": get_last_sync(workspace.id, PERSON_INFO_SPEC.key),
        }
        return Response(data, status=status.HTTP_200_OK)


class DepartmentPeopleAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_VIEW, level="WORKSPACE")
    def get(self, request, slug):
        workspace = _get_workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        params = request.query_params
        raw_department = params.get("department") or ""
        department = UNASSIGNED if raw_department == UNASSIGNED else _uuid_or_none(raw_department)
        login = params.get("login")
        per_page = _positive_int(params.get("per_page"), DEFAULT_PER_PAGE)
        if per_page not in PER_PAGE_OPTIONS:
            per_page = DEFAULT_PER_PAGE
        data = department_people(
            workspace,
            department=department,
            include_children=params.get("include_children", "1") != "0",
            search=params.get("search", ""),
            leader=_uuid_or_none(params.get("leader")),
            login=login if login in (LOGIN_NEVER, LOGIN_EVER) else None,
            page=_positive_int(params.get("page"), 1),
            per_page=per_page,
        )
        return Response(data, status=status.HTTP_200_OK)
