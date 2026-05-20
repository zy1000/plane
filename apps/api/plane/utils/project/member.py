from django.db.models import Min

from plane.db.models import User, Project, ProjectUserProperty, ProjectMember
from plane.db.models.project import ROLE
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
                role=ROLE.MEMBER.value,
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
