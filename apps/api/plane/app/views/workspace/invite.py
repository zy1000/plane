# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime

import jwt

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers import (
    WorkspaceMemberCustomRolesSerializer,
    WorkSpaceMemberInviteSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.event_tracking_task import track_event
from plane.bgtasks.workspace_invitation_task import workspace_invitation
from plane.db.models import User, Workspace, WorkspaceMember, WorkspaceMemberInvite
from plane.utils.cache import invalidate_cache, invalidate_cache_directly
from plane.utils.host import base_host
from plane.utils.analytics_events import USER_JOINED_WORKSPACE, USER_INVITED_TO_WORKSPACE
from .. import BaseViewSet


class WorkspaceInvitationsViewset(BaseViewSet):
    """Endpoint for creating, listing and  deleting workspaces"""

    serializer_class = WorkSpaceMemberInviteSerializer
    model = WorkspaceMemberInvite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "workspace__owner", "created_by")
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_INVITE, level="WORKSPACE")
    def list(self, request, slug):
        return super().list(request, slug)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_INVITE, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        return super().retrieve(request, slug, pk)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_INVITE, level="WORKSPACE")
    def create(self, request, slug):
        emails = request.data.get("emails", [])
        # Check if email is provided
        if not emails:
            return Response({"error": "Emails are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Get the workspace object
        workspace = Workspace.objects.get(slug=slug)

        normalized_invites = []
        for email in emails:
            try:
                role = int(email.get("role", 5))
            except (TypeError, ValueError):
                role = None
            if role not in (5, 15, 20):
                return Response(
                    {"error": "Invalid workspace role."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            role_serializer = WorkspaceMemberCustomRolesSerializer(
                data={"custom_role_ids": email.get("custom_role_ids", [])},
                context={"workspace": workspace},
            )
            if not role_serializer.is_valid():
                return Response(
                    role_serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST,
                )
            normalized_invites.append(
                {
                    **email,
                    "role": role,
                    "custom_role_ids": [
                        str(role_id)
                        for role_id in role_serializer.validated_data[
                            "custom_role_ids"
                        ]
                    ],
                }
            )

        # Check if user is already a member of workspace
        workspace_members = WorkspaceMember.objects.filter(
            workspace_id=workspace.id,
            member__email__in=[email.get("email") for email in normalized_invites],
            is_active=True,
        ).select_related("member", "member__avatar_asset")

        if workspace_members:
            return Response(
                {
                    "error": "Some users are already member of workspace",
                    "workspace_users": WorkSpaceMemberSerializer(workspace_members, many=True).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_invitations = []
        for email in normalized_invites:
            try:
                validate_email(email.get("email"))
                workspace_invitations.append(
                    WorkspaceMemberInvite(
                        email=email.get("email").strip().lower(),
                        workspace_id=workspace.id,
                        token=jwt.encode(
                            {"email": email, "timestamp": datetime.now().timestamp()},
                            settings.SECRET_KEY,
                            algorithm="HS256",
                        ),
                        role=email.get("role", 5),
                        custom_role_ids=email.get("custom_role_ids", []),
                        created_by=request.user,
                    )
                )
            except ValidationError:
                return Response(
                    {
                        "error": f"Invalid email - {email} provided a valid email address is required to send the invite"  # noqa: E501
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        # Create workspace member invite
        workspace_invitations = WorkspaceMemberInvite.objects.bulk_create(
            workspace_invitations, batch_size=10, ignore_conflicts=True
        )

        current_site = base_host(request=request, is_app=True)

        # Send invitations
        for invitation in workspace_invitations:
            workspace_invitation.delay(
                invitation.email,
                workspace.id,
                invitation.token,
                current_site,
                request.user.email,
            )
            track_event.delay(
                user_id=request.user.id,
                event_name=USER_INVITED_TO_WORKSPACE,
                slug=slug,
                event_properties={
                    "user_id": request.user.id,
                    "workspace_id": workspace.id,
                    "workspace_slug": workspace.slug,
                    "invitee_role": invitation.role,
                    "invited_at": str(timezone.now()),
                    "invitee_email": invitation.email,
                },
            )

        return Response({"message": "Emails sent successfully"}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_INVITE, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_invite = self.get_queryset().filter(pk=pk).first()
        if not workspace_invite:
            return Response(
                {"error": "Workspace invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data.copy()
        if "custom_role_ids" in data:
            role_serializer = WorkspaceMemberCustomRolesSerializer(
                data={"custom_role_ids": data.get("custom_role_ids", [])},
                context={"workspace": workspace_invite.workspace},
            )
            if not role_serializer.is_valid():
                return Response(role_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(workspace_invite, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_INVITE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        workspace_member_invite = WorkspaceMemberInvite.objects.get(pk=pk, workspace__slug=slug)
        workspace_member_invite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceJoinEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    """Invitation response endpoint the user can respond to the invitation"""

    @invalidate_cache(path="/api/workspaces/", user=False)
    @invalidate_cache(path="/api/users/me/workspaces/", multiple=True)
    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        user=False,
        multiple=True,
        url_params=True,
    )
    @invalidate_cache(path="/api/users/me/settings/", multiple=True)
    @transaction.atomic
    def post(self, request, slug, pk):
        workspace_invite = WorkspaceMemberInvite.objects.select_for_update().get(
            pk=pk, workspace__slug=slug
        )

        token = request.data.get("token", "")

        # Validate the token to verify the user received the invitation email
        if not token or workspace_invite.token != token:
            return Response(
                {"error": "You do not have permission to join the workspace"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # If already responded then return error
        if workspace_invite.responded_at is None:
            workspace_invite.accepted = request.data.get("accepted", False)
            workspace_invite.responded_at = timezone.now()
            workspace_invite.save()

            if workspace_invite.accepted:
                # Check if the user created account after invitation
                user = User.objects.filter(email=workspace_invite.email).first()

                # If the user is present then create the workspace member
                if user is not None:
                    # Check if the user was already a member of workspace then activate the user
                    workspace_member = WorkspaceMember.objects.filter(
                        workspace=workspace_invite.workspace, member=user
                    ).first()
                    if workspace_member is not None:
                        workspace_member.is_active = True
                        workspace_member.role = workspace_invite.role
                        workspace_member.save()
                    else:
                        # Create a Workspace
                        workspace_member = WorkspaceMember.objects.create(
                            workspace=workspace_invite.workspace,
                            member=user,
                            role=workspace_invite.role,
                        )

                    active_custom_role_ids = list(
                        workspace_invite.workspace.workspace_roles.filter(
                            id__in=workspace_invite.custom_role_ids,
                            type="workspace",
                            legacy_role__isnull=True,
                            deleted_at__isnull=True,
                        ).values_list("id", flat=True)
                    )
                    role_serializer = WorkspaceMemberCustomRolesSerializer(
                        data={"custom_role_ids": active_custom_role_ids},
                        context={
                            "workspace": workspace_invite.workspace,
                            "member": workspace_member,
                            "actor": request.user if request.user.is_authenticated else user,
                        },
                    )
                    if role_serializer.is_valid():
                        role_serializer.save()

                    # Set the user last_workspace_id to the accepted workspace
                    user.last_workspace_id = workspace_invite.workspace.id
                    user.save()
                    track_event.delay(
                        user_id=user.id,
                        event_name=USER_JOINED_WORKSPACE,
                        slug=slug,
                        event_properties={
                            "user_id": user.id,
                            "workspace_id": workspace_invite.workspace.id,
                            "workspace_slug": workspace_invite.workspace.slug,
                            "role": workspace_invite.role,
                            "joined_at": str(timezone.now()),
                        },
                    )

                    # Delete the invitation
                    workspace_invite.delete()

                return Response(
                    {"message": "Workspace Invitation Accepted"},
                    status=status.HTTP_200_OK,
                )

            # Workspace invitation rejected
            return Response(
                {"message": "Workspace Invitation was not accepted"},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"error": "You have already responded to the invitation request"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def get(self, request, slug, pk):
        workspace_invitation = WorkspaceMemberInvite.objects.get(workspace__slug=slug, pk=pk)
        serializer = WorkSpaceMemberInviteSerializer(workspace_invitation)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserWorkspaceInvitationsViewSet(BaseViewSet):
    serializer_class = WorkSpaceMemberInviteSerializer
    model = WorkspaceMemberInvite

    def get_queryset(self):
        return self.filter_queryset(
            super().get_queryset().filter(email=self.request.user.email).select_related("workspace")
        )

    @invalidate_cache(path="/api/workspaces/", user=False)
    @invalidate_cache(path="/api/users/me/workspaces/", multiple=True)
    def create(self, request):
        invitations = request.data.get("invitations", [])
        workspace_invitations = WorkspaceMemberInvite.objects.filter(
            pk__in=invitations, email=request.user.email
        ).order_by("-created_at")

        # If the user is already a member of workspace and was deactivated then activate the user
        for invitation in workspace_invitations:
            invalidate_cache_directly(
                path=f"/api/workspaces/{invitation.workspace.slug}/members/",
                user=False,
                request=request,
                multiple=True,
            )
            # Update the WorkspaceMember for this specific invitation
            WorkspaceMember.objects.filter(workspace_id=invitation.workspace_id, member=request.user).update(
                is_active=True, role=invitation.role
            )

            # Track event
            track_event.delay(
                user_id=request.user.id,
                event_name=USER_JOINED_WORKSPACE,
                slug=invitation.workspace.slug,
                event_properties={
                    "user_id": request.user.id,
                    "workspace_id": invitation.workspace.id,
                    "workspace_slug": invitation.workspace.slug,
                    "role": invitation.role,
                    "joined_at": str(timezone.now()),
                },
            )

        # Bulk create the user for all the workspaces
        WorkspaceMember.objects.bulk_create(
            [
                WorkspaceMember(
                    workspace=invitation.workspace,
                    member=request.user,
                    role=invitation.role,
                    created_by=request.user,
                )
                for invitation in workspace_invitations
            ],
            ignore_conflicts=True,
        )

        joined_members = list(
            WorkspaceMember.objects.filter(
                workspace_id__in=[invitation.workspace_id for invitation in workspace_invitations],
                member=request.user,
                is_active=True,
            ).select_related("workspace")
        )
        invitations_by_workspace_id = {
            invitation.workspace_id: invitation for invitation in workspace_invitations
        }
        for workspace_member in joined_members:
            invitation = invitations_by_workspace_id.get(workspace_member.workspace_id)
            if not invitation:
                continue
            active_custom_role_ids = list(
                workspace_member.workspace.workspace_roles.filter(
                    id__in=invitation.custom_role_ids,
                    type="workspace",
                    legacy_role__isnull=True,
                    deleted_at__isnull=True,
                ).values_list("id", flat=True)
            )
            role_serializer = WorkspaceMemberCustomRolesSerializer(
                data={"custom_role_ids": active_custom_role_ids},
                context={
                    "workspace": workspace_member.workspace,
                    "member": workspace_member,
                    "actor": request.user,
                },
            )
            if role_serializer.is_valid():
                role_serializer.save()

        # Delete joined workspace invites
        workspace_invitations.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
