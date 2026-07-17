# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import defaultdict

from plane.app.permissions.base import (
    _get_user_workspace_permission_keys,
    _is_instance_admin,
)
from plane.db.models import (
    Permission,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
)


def _role_permission_keys(role):
    permissions = role.permissions if isinstance(role.permissions, dict) else {}
    return [
        key
        for key in permissions.get("permission_keys", [])
        if isinstance(key, str)
    ]


def _role_payload(role):
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
    }


def _entity_reference(entity):
    return {"id": entity.id, "name": entity.name}


def build_workspace_my_access(workspace, user):
    """Build the current user's workspace access summary and permission provenance."""
    workspace_member = (
        WorkspaceMember.objects.filter(
            workspace=workspace,
            member=user,
            is_active=True,
            deleted_at__isnull=True,
        )
        .select_related("workspace")
        .first()
    )
    is_workspace_owner = workspace.owner_id == user.id
    is_instance_admin = _is_instance_admin(user)

    direct_assignments = []
    group_memberships = []
    group_role_assignments = []
    if workspace_member:
        direct_assignments = list(
            WorkspaceMemberRole.objects.filter(
                member=workspace_member,
                workspace=workspace,
                deleted_at__isnull=True,
                role__workspace=workspace,
                role__deleted_at__isnull=True,
                role__legacy_role__isnull=True,
                role__type=WorkspaceRole.RoleType.WORKSPACE,
            )
            .select_related("role")
            .order_by("role__name", "role_id")
        )
        group_memberships = list(
            WorkspaceGroupMember.objects.filter(
                member=workspace_member,
                group__workspace=workspace,
                group__deleted_at__isnull=True,
                deleted_at__isnull=True,
            )
            .select_related("group")
            .order_by("group__name", "group_id")
        )
        group_ids = [group_membership.group_id for group_membership in group_memberships]
        group_role_assignments = list(
            WorkspaceGroupRole.objects.filter(
                group_id__in=group_ids,
                group__workspace=workspace,
                group__deleted_at__isnull=True,
                deleted_at__isnull=True,
                role__workspace=workspace,
                role__deleted_at__isnull=True,
                role__legacy_role__isnull=True,
                role__type=WorkspaceRole.RoleType.WORKSPACE,
            )
            .select_related("group", "role")
            .order_by("group__name", "role__name", "group_id", "role_id")
        )

    granted_keys = _get_user_workspace_permission_keys(user, workspace.slug)
    sources_by_key = defaultdict(list)
    source_ids_by_key = defaultdict(set)

    def add_source(permission_key, source, source_identity):
        if permission_key not in granted_keys:
            return
        if source_identity in source_ids_by_key[permission_key]:
            return
        source_ids_by_key[permission_key].add(source_identity)
        sources_by_key[permission_key].append(source)

    if is_workspace_owner or is_instance_admin:
        source_type = "workspace_owner" if is_workspace_owner else "instance_admin"
        for permission_key in granted_keys:
            add_source(
                permission_key,
                {"type": source_type, "role": None, "group": None},
                (source_type, None, None),
            )
    else:
        for assignment in direct_assignments:
            for permission_key in _role_permission_keys(assignment.role):
                add_source(
                    permission_key,
                    {
                        "type": "direct_role",
                        "role": _entity_reference(assignment.role),
                        "group": None,
                    },
                    ("direct_role", assignment.role_id, None),
                )
        for assignment in group_role_assignments:
            for permission_key in _role_permission_keys(assignment.role):
                add_source(
                    permission_key,
                    {
                        "type": "group_role",
                        "role": _entity_reference(assignment.role),
                        "group": _entity_reference(assignment.group),
                    },
                    ("group_role", assignment.role_id, assignment.group_id),
                )

    roles_by_group_id = defaultdict(list)
    for assignment in group_role_assignments:
        roles_by_group_id[assignment.group_id].append(_role_payload(assignment.role))

    permissions = Permission.objects.filter(
        scope=Permission.Scope.WORKSPACE,
        is_active=True,
        deleted_at__isnull=True,
    ).order_by("category", "sort_order", "key")

    return {
        "membership": {
            "id": workspace_member.id if workspace_member else None,
            "role": workspace_member.role if workspace_member else None,
            "joined_at": workspace_member.created_at if workspace_member else None,
            "is_workspace_owner": is_workspace_owner,
            "is_instance_admin": is_instance_admin,
        },
        "direct_roles": [
            _role_payload(assignment.role) for assignment in direct_assignments
        ],
        "groups": [
            {
                "id": group_membership.group.id,
                "name": group_membership.group.name,
                "description": group_membership.group.description,
                "joined_at": group_membership.created_at,
                "roles": roles_by_group_id[group_membership.group_id],
            }
            for group_membership in group_memberships
        ],
        "permissions": [
            {
                "id": permission.id,
                "key": permission.key,
                "name": permission.name,
                "description": permission.description,
                "scope": permission.scope,
                "module": permission.module,
                "action": permission.action,
                "category": permission.category,
                "sort_order": permission.sort_order,
                "is_granted": permission.key in granted_keys,
                "sources": sources_by_key[permission.key],
            }
            for permission in permissions
        ],
    }
