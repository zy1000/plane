# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework.permissions import SAFE_METHODS, BasePermission

from plane.app.permissions.base import resolve_project_grant
from plane.app.permissions.keys import PermissionKey
from plane.db.models import Page


class ProjectPagePermission(BasePermission):
    """项目页面：先要是项目成员，再按动作要一个 project.page.* key；私有页面只有所有者能动。"""

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        slug = view.kwargs.get("slug")
        project_id = view.kwargs.get("project_id")
        page_id = view.kwargs.get("page_id")

        grant = resolve_project_grant(request.user, slug, str(project_id or ""))
        if not grant.is_member:
            return False
        if self._required_key(request, view) not in grant.keys:
            return False

        if page_id:
            page = (
                Page.objects.filter(
                    id=page_id,
                    workspace__slug=slug,
                    projects__id=project_id,
                    project_pages__deleted_at__isnull=True,
                )
                .distinct()
                .first()
            )
            if not page:
                return False
            if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != request.user.id:
                return False
        return True

    def _required_key(self, request, view) -> str:
        action = getattr(view, "action", None)
        name = view.__class__.__name__
        if name == "PageVersionEndpoint":
            return PermissionKey.PROJECT_PAGE_VIEW.value
        if name == "PageDuplicateEndpoint" or action == "create":
            return PermissionKey.PROJECT_PAGE_CREATE.value
        if action in {"list", "retrieve", "summary"}:
            return PermissionKey.PROJECT_PAGE_VIEW.value
        if action == "destroy":
            return PermissionKey.PROJECT_PAGE_DELETE.value
        if request.method in SAFE_METHODS:
            return PermissionKey.PROJECT_PAGE_VIEW.value
        return PermissionKey.PROJECT_PAGE_EDIT.value
