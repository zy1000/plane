from django.db.models import Min

from plane.db.models import User, Project, ProjectUserProperty, ProjectMember
from plane.bgtasks.project_add_user_email_task import project_add_user_email
from plane.utils.host import base_host


def add_user_to_project(users: list[User], project: Project | str):
    """将用户添加到某个项目里面"""
    member_sort_orders = (
        ProjectUserProperty.objects.filter(
            workspace__slug=project.workspace.slug,
            user__in=users,
        )
        .values("user_id")
        .annotate(min_sort_order=Min("sort_order"))
    )
    sort_order_map = {
        str(item["user_id"]): item["min_sort_order"] for item in member_sort_orders
    }
    bulk_project_members = []
    bulk_issue_props = []

    for user in users:
        member_id = str(user.id)
        min_sort_order = sort_order_map.get(member_id)
        bulk_project_members.append(
            ProjectMember(
                member=user,
                project=project,
                workspace_id=project.workspace_id,
            )
        )
        # Create a new issue property
        bulk_issue_props.append(
            ProjectUserProperty(
                user=user,
                project=project,
                workspace_id=project.workspace_id,
                sort_order=(
                    min_sort_order - 10000 if min_sort_order is not None else 65535
                ),
            )
        )
    project_members = ProjectMember.objects.bulk_create(
        bulk_project_members, batch_size=10, ignore_conflicts=True
    )

    _ = ProjectUserProperty.objects.bulk_create(
        bulk_issue_props, batch_size=10, ignore_conflicts=True
    )
    copy_workspace_job_roles(project, [user.id for user in users])


def copy_workspace_job_roles(project, user_ids):
    """新加进项目的人默认带上他在工作区的角色（之后在项目成员页可以改）。"""
    from plane.db.models import ProjectMemberJobRole, WorkspaceMemberJobRole

    members = {
        pm.member_id: pm
        for pm in ProjectMember.objects.filter(project=project, member_id__in=list(user_ids), deleted_at__isnull=True)
    }
    if not members:
        return
    existing = set(
        ProjectMemberJobRole.objects.filter(member__in=list(members.values())).values_list("member_id", "job_role_id")
    )
    rows = []
    for user_id, job_role_id in WorkspaceMemberJobRole.objects.filter(
        workspace_id=project.workspace_id, member__member_id__in=list(members)
    ).values_list("member__member_id", "job_role_id"):
        member = members[user_id]
        if (member.id, job_role_id) not in existing:
            rows.append(
                ProjectMemberJobRole(
                    project=project, workspace_id=project.workspace_id, member=member, job_role_id=job_role_id
                )
            )
            existing.add((member.id, job_role_id))
    ProjectMemberJobRole.objects.bulk_create(rows)


def add_project_admins(project, user_ids):
    """建项目时把创建人与负责人加进项目（已在项目里的重新激活）。

    不绑任何权限组：没有系统组，默认也不给成员加组。负责人（为空时创建人）靠直通拿全部权限，
    其余人要什么权限由项目管理员在权限组页配置。"""
    for user_id in user_ids:
        member, created = ProjectMember.objects.get_or_create(project=project, member_id=user_id)
        if not created and not member.is_active:
            member.is_active = True
            member.save(update_fields=["is_active"])
    copy_workspace_job_roles(project, user_ids)
