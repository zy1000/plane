# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import ProjectMember, Page
from plane.app.permissions import ROLE
from plane.app.permissions.base import _get_user_project_permission_keys
from plane.app.permissions.keys import PermissionKey

from rest_framework.permissions import BasePermission, SAFE_METHODS


# Permission Mappings for workspace members
ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value
GUEST = ROLE.GUEST.value


class ProjectPagePermission(BasePermission):
    """
    Custom permission to control access to pages within a workspace
    based on user roles, page visibility (public/private), and feature flags.
    """

    def has_permission(self, request, view):
        """
        Check basic project-level permissions before checking object-level permissions.
        """
        if request.user.is_anonymous:
            return False

        user_id = request.user.id
        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")
        project_id = view.kwargs.get("project_id")

        extended_access, role = self._check_access_and_get_role(
            request, slug, project_id
        )
        if extended_access is False:
            return False

        user_keys = _get_user_project_permission_keys(
            request.user, slug, str(project_id)
        )
        required_keys = self._get_required_permission_keys(request, view)
        if not required_keys.issubset(user_keys):
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

            # Handle private page access
            if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != user_id:
                return self._has_private_page_action_access(
                    request, slug, page, project_id
                )

        # Handle public page access
        return self._has_public_page_action_access(request, role)

    def _get_required_permission_keys(self, request, view) -> set:
        action = getattr(view, "action", None)

        if view.__class__.__name__ == "PageVersionEndpoint":
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_VERSION_VIEW}
        if view.__class__.__name__ == "PageDuplicateEndpoint":
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_CREATE}

        if action == "create":
            return {PermissionKey.NOTE_CREATE}
        if action in {"list", "retrieve", "summary"}:
            return {PermissionKey.NOTE_VIEW}
        if action == "partial_update":
            request_keys = set(request.data.keys())
            required_keys = {PermissionKey.NOTE_VIEW}
            if not request_keys or request_keys - {"access"}:
                required_keys.add(PermissionKey.NOTE_EDIT)
            if "access" in request_keys:
                required_keys.add(PermissionKey.NOTE_ACCESS_MANAGE)
            return required_keys
        if action == "destroy":
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_DELETE}
        if action in {"archive", "unarchive"}:
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_ARCHIVE}
        if action in {"lock", "unlock"}:
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_LOCK}
        if action == "access":
            return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_ACCESS_MANAGE}

        if request.method in SAFE_METHODS:
            return {PermissionKey.NOTE_VIEW}
        return {PermissionKey.NOTE_VIEW, PermissionKey.NOTE_EDIT}

    def _check_project_member_access(self, request, slug, project_id):
        """
        Check if the user is a project member.
        """
        return (
            ProjectMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
                project_id=project_id,
            )
            .values_list("role", flat=True)
            .first()
        )

    def _check_access_and_get_role(self, request, slug, project_id):
        """
        Hook for extended access checking
        Returns: True (allow), False (deny), None (continue with normal flow)
        """
        role = self._check_project_member_access(request, slug, project_id)
        if not role:
            return False, None
        return True, role

    def _has_private_page_action_access(self, request, slug, page, project_id):
        """
        Check access to private pages. Override for feature flag logic.
        """
        # Base implementation: only owner can access private pages
        return False

    def _check_project_action_access(self, request, role):
        return role in [ADMIN, MEMBER, GUEST]

    def _has_public_page_action_access(self, request, role):
        """
        Check if the user has permission to access a public page
        and can perform operations on the page.
        """
        project_member_exists = self._check_project_action_access(request, role)
        if not project_member_exists:
            return False
        return True
