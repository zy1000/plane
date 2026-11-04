"""角色（数据字典 ``job_role``）：成员是干什么的。与权限组无关，只用来「找人」。

找人顺序统一：研发矩阵（项目 × 产品）里填的人 → 项目里挂了这个角色的活跃成员 →
工作区里挂了这个角色的成员。审批人、阶段评审负责人 / 审核人候选、需求负责人都走这里。
"""

from plane.db.models import (
    DataDictionary,
    DataDictionaryItem,
    ProductTeamAssignment,
    ProjectMember,
    ProjectMemberJobRole,
    WorkspaceMember,
    WorkspaceMemberJobRole,
)

JOB_ROLE_DICTIONARY_KEY = "job_role"


def job_role_dictionary(workspace_id):
    return DataDictionary.objects.filter(workspace_id=workspace_id, key=JOB_ROLE_DICTIONARY_KEY).first()


def job_role_items(workspace_id):
    return DataDictionaryItem.objects.filter(
        workspace_id=workspace_id, dictionary__key=JOB_ROLE_DICTIONARY_KEY
    ).order_by("sort_order", "created_at")


def job_role_ids_by_label(workspace_id, labels):
    """评审模板里存的是角色名文本，按字典值的文字对上 id。"""
    labels = [label.strip() for label in labels if label and label.strip()]
    if not labels:
        return []
    return list(job_role_items(workspace_id).filter(label__in=labels).values_list("id", flat=True))


def validate_job_role_ids(workspace_id, job_role_ids):
    """只保留本工作区角色字典里的 id；返回 (有效 id 列表, 无效 id 列表)。"""
    wanted = {str(value) for value in job_role_ids or [] if value}
    valid = {str(value) for value in job_role_items(workspace_id).filter(id__in=wanted).values_list("id", flat=True)}
    return sorted(valid), sorted(wanted - valid)


def matrix_holders(project_id, job_role_ids, product_ids=None):
    """研发矩阵里填的人。``product_ids`` 为空表示本项目所有产品。"""
    queryset = ProductTeamAssignment.objects.filter(
        project_id=project_id,
        job_role_id__in=list(job_role_ids),
        member__is_active=True,
        product__product_projects__project_id=project_id,
        product__product_projects__deleted_at__isnull=True,
    )
    if product_ids:
        queryset = queryset.filter(product_id__in=list(product_ids))
    active_members = ProjectMember.objects.filter(
        project_id=project_id, is_active=True, deleted_at__isnull=True
    ).values_list("member_id", flat=True)
    return set(queryset.filter(member_id__in=active_members).values_list("member_id", flat=True))


def project_holders(project_id, job_role_ids):
    """项目里挂了这些角色的活跃成员。"""
    return set(
        ProjectMemberJobRole.objects.filter(
            project_id=project_id,
            job_role_id__in=list(job_role_ids),
            member__is_active=True,
            member__deleted_at__isnull=True,
        ).values_list("member__member_id", flat=True)
    )


def workspace_holders(workspace_id, job_role_ids):
    return set(
        WorkspaceMemberJobRole.objects.filter(
            workspace_id=workspace_id,
            job_role_id__in=list(job_role_ids),
            member__is_active=True,
            member__deleted_at__isnull=True,
        ).values_list("member__member_id", flat=True)
    )


def resolve_project_job_role_users(project_id, job_role_ids, product_ids=None):
    """审批人按角色找人，**每个角色各自回退**：矩阵里这个项目 ×（工作项关联的）产品给这个角色填了人
    就用矩阵，否则用项目里挂这个角色的人；几个角色的结果取并集。
    不能整体判断——只给 A 角色填了矩阵时，B 角色的人不能因此丢掉。"""
    users = set()
    for job_role_id in dict.fromkeys(value for value in job_role_ids if value):
        users |= matrix_holders(project_id, [job_role_id], product_ids) or project_holders(project_id, [job_role_id])
    return users


def member_job_role_map(member_ids, *, project=False):
    """{成员行 id: [角色 id, ...]}，列表接口一次查完。"""
    model = ProjectMemberJobRole if project else WorkspaceMemberJobRole
    result = {}
    for member_id, job_role_id in model.objects.filter(member_id__in=list(member_ids)).values_list(
        "member_id", "job_role_id"
    ):
        result.setdefault(member_id, []).append(job_role_id)
    return result


def set_member_job_roles(member, job_role_ids, *, project=False):
    """整份替换一个成员的角色。``job_role_ids`` 已校验。"""
    model = ProjectMemberJobRole if project else WorkspaceMemberJobRole
    wanted = {str(value) for value in job_role_ids}
    existing = {str(value) for value in model.objects.filter(member=member).values_list("job_role_id", flat=True)}
    model.objects.filter(member=member).exclude(job_role_id__in=wanted).delete(soft=False)
    to_add = wanted - existing
    if project:
        model.objects.bulk_create(
            [
                model(member=member, job_role_id=value, project_id=member.project_id, workspace_id=member.workspace_id)
                for value in to_add
            ]
        )
    else:
        model.objects.bulk_create(
            [model(member=member, job_role_id=value, workspace_id=member.workspace_id) for value in to_add]
        )


def default_project_job_roles(workspace_id, user_id):
    """新加进项目时默认带上他在工作区的角色。"""
    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id, member_id=user_id, deleted_at__isnull=True
    ).first()
    if member is None:
        return []
    return list(member.job_role_links.values_list("job_role_id", flat=True))
