# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import (
    ProjectMember,
    ProjectMemberInvite,
    WorkspaceMember,
    WorkspaceMemberInvite,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.utils.cache import invalidate_cache_directly
from plane.bgtasks.event_tracking_task import track_event
from plane.utils.analytics_events import USER_JOINED_WORKSPACE


def process_workspace_project_invitations(user):
    """This function takes in User and adds him to all workspace and projects that the user has accepted invited of"""

    # Check if user has any accepted invites for workspace and add them to workspace
    workspace_member_invites = list(
        WorkspaceMemberInvite.objects.filter(email=user.email, accepted=True).select_related("workspace")
    )

    WorkspaceMember.objects.bulk_create(
        [
            WorkspaceMember(
                workspace_id=workspace_member_invite.workspace_id,
                member=user,
                role=workspace_member_invite.role,
            )
            for workspace_member_invite in workspace_member_invites
        ],
        ignore_conflicts=True,
    )
    for workspace_member_invite in workspace_member_invites:
        WorkspaceMember.objects.filter(
            workspace_id=workspace_member_invite.workspace_id,
            member=user,
        ).update(
            role=workspace_member_invite.role,
            is_active=True,
            deleted_at=None,
        )

    for workspace_member_invite in workspace_member_invites:
        invalidate_cache_directly(
            path=f"/api/workspaces/{str(workspace_member_invite.workspace.slug)}/members/",
            url_params=False,
            user=False,
            multiple=True,
        )
        track_event.delay(
            user_id=user.id,
            event_name=USER_JOINED_WORKSPACE,
            slug=workspace_member_invite.workspace.slug,
            event_properties={
                "user_id": user.id,
                "workspace_id": workspace_member_invite.workspace.id,
                "workspace_slug": workspace_member_invite.workspace.slug,
                "role": workspace_member_invite.role,
                "joined_at": str(timezone.now().isoformat()),
            },
        )

    # Check if user has any project invites
    project_member_invites = list(
        ProjectMemberInvite.objects.filter(email=user.email, accepted=True)
    )

    # Add user to workspace
    WorkspaceMember.objects.bulk_create(
        [
            WorkspaceMember(
                workspace_id=project_member_invite.workspace_id,
                role=(project_member_invite.role if project_member_invite.role in [5, 15] else 15),
                member=user,
                created_by_id=project_member_invite.created_by_id,
            )
            for project_member_invite in project_member_invites
        ],
        ignore_conflicts=True,
    )

    # Now add the users to project
    ProjectMember.objects.bulk_create(
        [
            ProjectMember(
                workspace_id=project_member_invite.workspace_id,
                role=(project_member_invite.role if project_member_invite.role in [5, 15] else 15),
                member=user,
                created_by_id=project_member_invite.created_by_id,
            )
            for project_member_invite in project_member_invites
        ],
        ignore_conflicts=True,
    )

    workspace_ids = {
        invitation.workspace_id
        for invitation in [*workspace_member_invites, *project_member_invites]
    }
    workspace_members = list(
        WorkspaceMember.objects.filter(
            workspace_id__in=workspace_ids,
            member=user,
            is_active=True,
        ).select_related("workspace")
    )

    workspace_members_by_workspace_id = {
        member.workspace_id: member for member in workspace_members
    }
    invited_workspace_member_ids = [
        workspace_members_by_workspace_id[invitation.workspace_id].id
        for invitation in workspace_member_invites
        if invitation.workspace_id in workspace_members_by_workspace_id
    ]
    WorkspaceMemberRole.objects.filter(
        member_id__in=invited_workspace_member_ids,
        role__legacy_role__isnull=True,
    ).delete(soft=False)
    custom_role_links = []
    for invitation in workspace_member_invites:
        member = workspace_members_by_workspace_id.get(invitation.workspace_id)
        if not member:
            continue
        roles = WorkspaceRole.objects.filter(
            id__in=invitation.custom_role_ids,
            workspace_id=invitation.workspace_id,
            type=WorkspaceRole.RoleType.WORKSPACE,
            legacy_role__isnull=True,
            deleted_at__isnull=True,
        )
        custom_role_links.extend(
            WorkspaceMemberRole(
                workspace_id=invitation.workspace_id,
                member=member,
                role=role,
                created_by=user,
                updated_by=user,
            )
            for role in roles
        )
    WorkspaceMemberRole.objects.bulk_create(custom_role_links, ignore_conflicts=True)

    # Delete all the invites
    WorkspaceMemberInvite.objects.filter(
        id__in=[invitation.id for invitation in workspace_member_invites]
    ).delete()
    ProjectMemberInvite.objects.filter(
        id__in=[invitation.id for invitation in project_member_invites]
    ).delete()
