"""研发矩阵（项目 × 产品 × 角色 → 成员）的读写规则。

矩阵只回答「找谁」，鉴权不读它（见 db/models/product.py::ProductTeamAssignment）。
写入口在这里统一校验：产品是本项目的活跃关联、角色在本工作区角色字典里、成员是本项目活跃成员。
"""

from django.db import transaction

from plane.db.models import Product, ProductProject, ProductTeamAssignment, ProjectMember, ProjectMemberJobRole
from plane.utils.job_role import job_role_items, validate_job_role_ids


class ProductTeamError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _job_role_columns(workspace_id):
    return [
        {"id": str(item.id), "label": item.label, "color": item.color}
        for item in job_role_items(workspace_id).only("id", "label", "color")
    ]


def _cells(queryset):
    """[{product_id, job_role_id, member_ids}]，一格一行。"""
    cells = {}
    for product_id, job_role_id, member_id in queryset.values_list("product_id", "job_role_id", "member_id"):
        cells.setdefault((str(product_id), str(job_role_id)), []).append(str(member_id))
    return [
        {"product_id": product_id, "job_role_id": job_role_id, "member_ids": member_ids}
        for (product_id, job_role_id), member_ids in cells.items()
    ]


def linked_products(project_id):
    return Product.objects.filter(
        product_projects__project_id=project_id, product_projects__deleted_at__isnull=True
    ).order_by("identifier")


def project_matrix(project):
    """项目「研发产品」页：关联产品为行、角色为列。"""
    products = list(linked_products(project.id).values("id", "name", "identifier", "code"))
    product_ids = [row["id"] for row in products]
    assignments = ProductTeamAssignment.objects.filter(
        project_id=project.id,
        product_id__in=product_ids,
        member__is_active=True,
    ).order_by("created_at")
    cells = _cells(assignments)
    # 角色字典往往有几十个值；默认只展示本项目用得上的列（有成员挂着或矩阵里已填），其余由前端「更多角色」加列
    used = {
        str(value)
        for value in ProjectMemberJobRole.objects.filter(
            project_id=project.id, member__is_active=True
        ).values_list("job_role_id", flat=True)
    } | {cell["job_role_id"] for cell in cells}
    return {
        "products": [{**row, "id": str(row["id"])} for row in products],
        "job_roles": _job_role_columns(project.workspace_id),
        "used_job_role_ids": sorted(used),
        "cells": cells,
    }


def replace_matrix_cell(project, product_id, job_role_id, member_ids):
    """整格替换。成员顺序按传入顺序保存（created_at 递增）。"""
    if not ProductProject.objects.filter(project_id=project.id, product_id=product_id).exists():
        raise ProductTeamError("该产品不是本项目的关联产品。")
    valid, invalid = validate_job_role_ids(project.workspace_id, [job_role_id])
    if invalid or not valid:
        raise ProductTeamError("角色不存在。")
    wanted = []
    for value in member_ids or []:
        value = str(value)
        if value and value not in wanted:
            wanted.append(value)
    active = {
        str(value)
        for value in ProjectMember.objects.filter(
            project_id=project.id, member_id__in=wanted, is_active=True
        ).values_list("member_id", flat=True)
    }
    outsiders = [value for value in wanted if value not in active]
    if outsiders:
        raise ProductTeamError("只能选择本项目的活跃成员。")

    cell = ProductTeamAssignment.objects.filter(project_id=project.id, product_id=product_id, job_role_id=job_role_id)
    with transaction.atomic():
        existing = {str(value) for value in cell.values_list("member_id", flat=True)}
        cell.exclude(member_id__in=wanted).delete(soft=False)
        ProductTeamAssignment.objects.bulk_create(
            [
                ProductTeamAssignment(
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    product_id=product_id,
                    job_role_id=job_role_id,
                    member_id=value,
                )
                for value in wanted
                if value not in existing
            ]
        )
    return {"product_id": str(product_id), "job_role_id": str(job_role_id), "member_ids": wanted}


def product_team(product):
    """产品「研发团队」只读页：按关联项目分组的矩阵行。"""
    links = (
        ProductProject.objects.filter(product_id=product.id, project__archived_at__isnull=True)
        .select_related("project")
        .order_by("project__name")
    )
    projects = [link.project for link in links]
    assignments = ProductTeamAssignment.objects.filter(
        product_id=product.id, project_id__in=[project.id for project in projects], member__is_active=True
    ).order_by("created_at")
    by_project = {}
    for row in assignments.values_list("project_id", "job_role_id", "member_id"):
        project_id, job_role_id, member_id = (str(value) for value in row)
        cells = by_project.setdefault(project_id, {})
        cells.setdefault(job_role_id, []).append(member_id)
    return {
        "job_roles": _job_role_columns(product.workspace_id),
        "projects": [
            {
                "id": str(project.id),
                "name": project.name,
                "identifier": project.identifier,
                "cells": [
                    {"job_role_id": job_role_id, "member_ids": member_ids}
                    for job_role_id, member_ids in by_project.get(str(project.id), {}).items()
                ],
            }
            for project in projects
        ],
    }
