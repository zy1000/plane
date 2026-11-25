"""产品「工作项」页签的取数：只认工作项自身的产品关联（IssueProduct 行；缺陷可关联多个产品）。

产品属于某个产品集时，挂在产品集上的工作项（在产品集里提的缺陷）集内每个产品都算有，
一并列出，行上带 from_product_set。

范围 = 本产品的工作项 ∩ 当前用户能访问的项目（与工作项详情接口 allow_project_member 同口径，
能进项目就能点开详情），归档项目不列。左栏按状态组计数：计数跟随搜索与筛选，不跟随所选状态组。
"""

import re

from django.db.models import Count, Q

from plane.db.models import Issue, IssueAssignee, IssueProduct
from plane.utils.visibility import visible_projects_q

STATE_GROUPS = ("backlog", "unstarted", "started", "completed", "cancelled")

# 「KF11A210-128」整串当编号搜
_IDENTIFIER_RE = re.compile(r"^\s*([A-Za-z0-9_]+)-(\d+)\s*$")

_ROW_FIELDS = (
    "id",
    "project_id",
    "project__identifier",
    "project__name",
    "sequence_id",
    "name",
    "priority",
    "target_date",
    "state_id",
    "state__name",
    "state__color",
    "state__group",
    "type_id",
    "type__name",
    "type__logo_props",
    "created_at",
)


def _page_product_ids(product):
    return [product.id, product.product_set_id] if product.product_set_id else [product.id]


def product_work_item_queryset(user, product):
    return Issue.issue_objects.filter(
        workspace_id=product.workspace_id,
        id__in=IssueProduct.objects.filter(product_id__in=_page_product_ids(product)).values("issue_id"),
        project__archived_at__isnull=True,
    ).filter(visible_projects_q(user, product.workspace, "project"))


def apply_search(queryset, search):
    search = (search or "").strip()
    if not search:
        return queryset
    match = _IDENTIFIER_RE.match(search)
    if match:
        return queryset.filter(
            project__identifier__iexact=match.group(1), sequence_id=int(match.group(2))
        )
    condition = Q(name__icontains=search)
    if search.isdigit():
        condition |= Q(sequence_id=int(search))
    return queryset.filter(condition)


def state_group_counts(queryset):
    return queryset.order_by().aggregate(
        all=Count("id"),
        **{group: Count("id", filter=Q(state__group=group)) for group in STATE_GROUPS},
    )


def facets(queryset, product=None):
    """筛选下拉的候选：只列本产品工作项里实际出现过的项目 / 类型 / 模块 / 负责人。
    模块取本产品（及所属产品集）那几条关联行上的模块。"""
    base = queryset.order_by()
    projects = list(
        base.values("project_id", "project__identifier", "project__name")
        .distinct()
        .order_by("project__name")
    )
    types = list(
        base.filter(type_id__isnull=False)
        .values("type_id", "type__name", "type__logo_props")
        .distinct()
        .order_by("type__name")
    )
    links = IssueProduct.objects.filter(issue_id__in=base.values("id"), product_module_id__isnull=False)
    if product is not None:
        links = links.filter(product_id__in=_page_product_ids(product))
    modules = list(
        links.order_by()
        .values("product_module_id", "product_module__name")
        .distinct()
        .order_by("product_module__name")
    )
    assignee_ids = list(
        IssueAssignee.objects.filter(
            issue_id__in=base.values("id"), deleted_at__isnull=True
        )
        .values_list("assignee_id", flat=True)
        .distinct()
    )
    return {
        "projects": [
            {"id": row["project_id"], "identifier": row["project__identifier"], "name": row["project__name"]}
            for row in projects
        ],
        "types": [
            {"id": row["type_id"], "name": row["type__name"], "logo_props": row["type__logo_props"]}
            for row in types
        ],
        "modules": [
            {"id": row["product_module_id"], "name": row["product_module__name"]} for row in modules
        ],
        "assignee_ids": assignee_ids,
    }


def page_rows(queryset, *, offset, limit, product=None):
    """product：当前页面的产品；工作项没关联它本身，就是从所属产品集带过来的。
    模块取工作项在本产品（没有就取产品集）那一行上的模块。"""
    rows = list(queryset.order_by("-created_at").values(*_ROW_FIELDS)[offset : offset + limit])
    own_links = {}
    set_links = {}
    if product is not None:
        for issue_id, product_id, module_id, module_name in IssueProduct.objects.filter(
            issue_id__in=[row["id"] for row in rows], product_id__in=_page_product_ids(product)
        ).values_list("issue_id", "product_id", "product_module_id", "product_module__name"):
            target = own_links if product_id == product.id else set_links
            target[issue_id] = (module_id, module_name)
    assignees = {}
    for issue_id, assignee_id in IssueAssignee.objects.filter(
        issue_id__in=[row["id"] for row in rows], deleted_at__isnull=True
    ).values_list("issue_id", "assignee_id"):
        assignees.setdefault(issue_id, []).append(assignee_id)
    return [
        {
            "id": row["id"],
            "project_id": row["project_id"],
            "project_identifier": row["project__identifier"],
            "project_name": row["project__name"],
            "sequence_id": row["sequence_id"],
            "name": row["name"],
            "priority": row["priority"],
            "target_date": row["target_date"],
            "state": (
                {
                    "id": row["state_id"],
                    "name": row["state__name"],
                    "color": row["state__color"],
                    "group": row["state__group"],
                }
                if row["state_id"]
                else None
            ),
            "type": (
                {"id": row["type_id"], "name": row["type__name"], "logo_props": row["type__logo_props"]}
                if row["type_id"]
                else None
            ),
            "product_module": _module_payload(own_links.get(row["id"]) or set_links.get(row["id"])),
            "assignee_ids": assignees.get(row["id"], []),
            "from_product_set": product is not None and row["id"] not in own_links,
        }
        for row in rows
    ]


def _module_payload(link):
    if not link or not link[0]:
        return None
    return {"id": link[0], "name": link[1]}
