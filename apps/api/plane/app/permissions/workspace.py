# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.permissions import BasePermission, SAFE_METHODS

# Module imports
from plane.db.models import Workspace
from plane.app.permissions.base import is_workspace_member


# Permission Mappings
Admin = 20
Member = 15
Guest = 5


# TODO: Move the below logic to python match - python v3.10
class WorkSpaceBasePermission(BasePermission):
    def has_permission(self, request, view):
        # allow anyone to create a workspace
        if request.user.is_anonymous:
            return False

        if request.method == "POST":
            return True

        ## Safe Methods
        if request.method in SAFE_METHODS:
            return not view.workspace_slug or is_workspace_member(
                request.user, view.workspace_slug
            )

        # allow only admins and owners to update the workspace settings
        if request.method in ["PUT", "PATCH"]:
            return is_workspace_member(request.user, view.workspace_slug)

        # allow only owner to delete the workspace
        if request.method == "DELETE":
            return is_workspace_member(request.user, view.workspace_slug)


class WorkspaceOwnerPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return Workspace.objects.filter(
            slug=view.workspace_slug,
            owner=request.user,
        ).exists()


class WorkSpaceAdminPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return is_workspace_member(request.user, view.workspace_slug)


class WorkspaceEntityPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        ## Safe Methods -> Handle the filtering logic in queryset
        if request.method in SAFE_METHODS:
            return is_workspace_member(request.user, view.workspace_slug)

        return is_workspace_member(request.user, view.workspace_slug)


class WorkspaceViewerPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return is_workspace_member(request.user, view.workspace_slug)


class WorkspaceUserPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return is_workspace_member(request.user, view.workspace_slug)
