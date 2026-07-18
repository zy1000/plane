# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import defaultdict

from plane.db.models import (
    ProjectGroupRole,
    ProjectMember,
    ProjectMemberRole,
)


def get_user_project_role_ids(user, workspace_slug: str, project_id: str) -> set:
    """Return direct and workspace-group-derived project role IDs for an active project member."""
    if not user or getattr(user, "is_anonymous", True):
        return set()

    project_member = ProjectMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        project_id=project_id,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    if not project_member:
        return set()

    direct_role_ids = ProjectMemberRole.objects.filter(
        member=project_member,
        deleted_at__isnull=True,
        role__deleted_at__isnull=True,
    ).values_list("role_id", flat=True)
    group_role_ids = ProjectGroupRole.objects.filter(
        project_id=project_id,
        deleted_at__isnull=True,
        role__deleted_at__isnull=True,
        group__deleted_at__isnull=True,
        group__workspace__slug=workspace_slug,
        group__group_members__deleted_at__isnull=True,
        group__group_members__member__deleted_at__isnull=True,
        group__group_members__member__is_active=True,
        group__group_members__member__member=user,
    ).values_list("role_id", flat=True)
    return set(direct_role_ids) | set(group_role_ids)


def build_project_member_role_sources(project_members) -> dict:
    """Build permission provenance for a project-member collection without per-row queries."""
    project_members = list(project_members)
    sources_by_member_id = defaultdict(list)
    if not project_members:
        return sources_by_member_id

    member_ids = [project_member.id for project_member in project_members]
    project_ids = {project_member.project_id for project_member in project_members}
    user_ids = {project_member.member_id for project_member in project_members if project_member.member_id}
    project_member_id_by_scope = {
        (project_member.project_id, project_member.member_id): project_member.id
        for project_member in project_members
        if project_member.member_id
    }

    direct_rows = ProjectMemberRole.objects.filter(
        member_id__in=member_ids,
        deleted_at__isnull=True,
        role__deleted_at__isnull=True,
    ).values("member_id", "role_id", "role__name")
    for row in direct_rows:
        sources_by_member_id[row["member_id"]].append(
            {
                "type": "direct_role",
                "role": {"id": row["role_id"], "name": row["role__name"]},
                "group": None,
            }
        )

    group_rows = (
        ProjectGroupRole.objects.filter(
            project_id__in=project_ids,
            deleted_at__isnull=True,
            role__deleted_at__isnull=True,
            group__deleted_at__isnull=True,
            group__group_members__deleted_at__isnull=True,
            group__group_members__member__deleted_at__isnull=True,
            group__group_members__member__is_active=True,
            group__group_members__member__member_id__in=user_ids,
        )
        .values(
            "project_id",
            "role_id",
            "role__name",
            "group_id",
            "group__name",
            "group__group_members__member__member_id",
        )
        .distinct()
    )
    for row in group_rows:
        project_member_id = project_member_id_by_scope.get(
            (
                row["project_id"],
                row["group__group_members__member__member_id"],
            )
        )
        if not project_member_id:
            continue
        sources_by_member_id[project_member_id].append(
            {
                "type": "group_role",
                "role": {"id": row["role_id"], "name": row["role__name"]},
                "group": {"id": row["group_id"], "name": row["group__name"]},
            }
        )

    return sources_by_member_id
