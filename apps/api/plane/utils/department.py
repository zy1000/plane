"""部门设置页的查询：部门树计数 + 人员分页。只统计本工作区的活跃非 bot 成员。

部门（Department）是全局表，由「人员信息」集成维护；这里只读。
"""

from django.db.models import Case, Count, IntegerField, Q, Value, When

from plane.db.models import Department, User, WorkspaceMember

UNASSIGNED = "none"
LOGIN_NEVER = "never"
LOGIN_EVER = "ever"


def workspace_users(workspace):
    member_ids = WorkspaceMember.objects.filter(
        workspace=workspace, is_active=True, member__is_bot=False
    ).values("member_id")
    return User.objects.filter(id__in=member_ids)


def department_tree(workspace):
    """两层树；count = 本工作区成员里归属该部门（三级含子部门）的人数。没人的部门也返回。"""
    users = workspace_users(workspace)
    direct = dict(
        users.filter(extra_info__organization__isnull=False)
        .values("extra_info__organization_id")
        .annotate(n=Count("id"))
        .values_list("extra_info__organization_id", "n")
    )
    departments = list(Department.objects.order_by("name"))
    children = {}
    for department in departments:
        if department.parent_id:
            children.setdefault(department.parent_id, []).append(department)

    def node(department):
        kids = sorted(children.get(department.id, []), key=lambda d: (-direct.get(d.id, 0), d.name))
        kid_nodes = [
            {"id": str(kid.id), "name": kid.name, "count": direct.get(kid.id, 0), "children": []} for kid in kids
        ]
        return {
            "id": str(department.id),
            "name": department.name,
            "count": direct.get(department.id, 0) + sum(item["count"] for item in kid_nodes),
            "children": kid_nodes,
        }

    tree = [node(department) for department in departments if not department.parent_id]
    total = users.count()
    unassigned = users.filter(Q(extra_info__isnull=True) | Q(extra_info__organization__isnull=True)).count()
    return {
        "tree": tree,
        "total": total,
        "unassigned": unassigned,
        "center_count": len(tree),
        "department_count": sum(len(item["children"]) for item in tree),
        "assigned": total - unassigned,
    }


def _scope(workspace, department, include_children):
    users = workspace_users(workspace)
    if not department:
        return users
    if department == UNASSIGNED:
        return users.filter(Q(extra_info__isnull=True) | Q(extra_info__organization__isnull=True))
    if include_children:
        return users.filter(
            Q(extra_info__organization_id=department) | Q(extra_info__organization__parent_id=department)
        )
    return users.filter(extra_info__organization_id=department)


def _person(user):
    extra = getattr(user, "extra_info", None)
    organization = extra.organization if extra and extra.organization_id else None
    leader = extra.leader if extra and extra.leader_id else None
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "email": user.email,
        "employee_id": extra.employee_id if extra else None,
        "ad_account": extra.ad_account if extra else None,
        "department": {"id": str(organization.id), "name": organization.name, "path": organization.path}
        if organization
        else None,
        "leader": {"id": str(leader.id), "display_name": leader.display_name, "avatar_url": leader.avatar_url}
        if leader
        else None,
        "last_login_time": user.last_login_time,
    }


def department_people(workspace, *, department=None, include_children=True, search="", leader=None, login=None, page=1, per_page=50):
    scope = _scope(workspace, department, include_children)
    # 上级下拉的候选：当前部门范围内出现过的上级（不受其它筛选影响，切筛选时选项不跳）
    leaders = list(
        scope.filter(extra_info__leader__isnull=False)
        .values("extra_info__leader_id", "extra_info__leader__display_name")
        .annotate(n=Count("id"))
        .order_by("-n", "extra_info__leader__display_name")
    )
    people = scope
    search = (search or "").strip()
    if search:
        people = people.filter(
            Q(display_name__icontains=search)
            | Q(email__icontains=search)
            | Q(extra_info__employee_id__icontains=search)
            | Q(extra_info__ad_account__icontains=search)
        )
    if leader:
        people = people.filter(extra_info__leader_id=leader)
    if login == LOGIN_NEVER:
        people = people.filter(last_login_time__isnull=True)
    elif login == LOGIN_EVER:
        people = people.filter(last_login_time__isnull=False)

    total = people.count()
    offset = (page - 1) * per_page
    rows = (
        people.select_related("avatar_asset", "extra_info__organization__parent", "extra_info__leader__avatar_asset")
        # 有部门的人在前（「全部人员」里没工号的 LDAP 账号别顶在第一页），再按工号
        .annotate(
            _unassigned=Case(
                When(extra_info__organization__isnull=False, then=Value(0)), default=Value(1), output_field=IntegerField()
            )
        )
        .order_by("_unassigned", "extra_info__employee_id", "display_name")[offset : offset + per_page]
    )
    return {
        "results": [_person(user) for user in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "leaders": [
            {"id": str(item["extra_info__leader_id"]), "display_name": item["extra_info__leader__display_name"], "count": item["n"]}
            for item in leaders
        ],
    }
