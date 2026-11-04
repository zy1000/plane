# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""/test/ 下用例相关老接口的统一鉴权（2026-11-04 权限补漏）。

这些接口挂在工作区级路由上，以前只查「是不是工作区成员」（指到模板库时再查模板 key），
有的连这个都没有。现在一律先把请求指向的对象（用例 / 模块 / 用例库 / 标签 / 评论）换成它所在的
用例库，再按库分流：

- 模板库（is_template）：查工作区模板 key（读 workspace.case_template.view|manage，写 manage）。
- 产品用例库：能看到这个产品，且在产品上持有给定的用例 key（取自关联项目的项目权限并集，
  见 permissions/base.py::_get_user_product_permission_keys）。
- 还没挂产品的存量库（只有 project，用例挪到产品前的数据）：查那个项目里的同名 key。

对象必须属于 URL 里的工作区，否则 404；任何一个对象不通过，整条请求 403。
测试计划上下文查计划所在项目的 project.test_plan.*；工作项上下文查工作项所在项目的工作项 / 缺陷 key；
用例评审查评审所属产品的 project.case_review.*。

每个函数返回 None 表示放行，否则返回一个可以直接 return 的 Response。
"""

import uuid

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, has_workspace_permission, is_workspace_member
from plane.db.models import (
    CaseLabel,
    CaseModule,
    CaseReview,
    Issue,
    Product,
    TestCase,
    TestCaseComment,
    TestCaseRepository,
    TestPlan,
)

CASE_VIEW = (PermissionKey.PROJECT_TEST_CASE_VIEW,)
CASE_CREATE = (PermissionKey.PROJECT_TEST_CASE_CREATE,)
CASE_EDIT = (PermissionKey.PROJECT_TEST_CASE_EDIT,)
CASE_DELETE = (PermissionKey.PROJECT_TEST_CASE_DELETE,)
CASE_IMPORT = (PermissionKey.PROJECT_TEST_CASE_IMPORT,)
CASE_EXPORT = (PermissionKey.PROJECT_TEST_CASE_EXPORT,)

TEMPLATE_READ = (PermissionKey.WORKSPACE_CASE_TEMPLATE_VIEW, PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE)
TEMPLATE_MANAGE = (PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE,)

FORBIDDEN = "您没有所需的用例权限。"
NOT_FOUND = "用例或用例库不存在。"


def _forbidden(message=FORBIDDEN):
    return Response({"error": message}, status=status.HTTP_403_FORBIDDEN)


def _not_found(message=NOT_FOUND):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def _bad_request(message):
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


def as_id_list(value):
    """query / body 里的 id 统一成字符串列表：单值、列表、逗号分隔都认，空值去掉。"""
    if value is None or value == "":
        return []
    if isinstance(value, (list, tuple, set)):
        items = value
    else:
        items = str(value).split(",")
    return [str(item).strip() for item in items if item is not None and str(item).strip()]


def _clean(values):
    """去重并校验 UUID；有脏 id 返回 None。"""
    cleaned = set()
    for value in values or ():
        try:
            cleaned.add(str(uuid.UUID(str(value))))
        except (ValueError, TypeError, AttributeError):
            return None
    return cleaned


def _member_error(request, slug):
    if not is_workspace_member(request.user, slug):
        return _forbidden("You must be an active workspace member.")
    return None


def _repository_ids_of(model, lookup, slug, ids):
    """把一批对象 id 换成所在用例库 id；有对象不在本工作区返回 None。"""
    if not ids:
        return set()
    rows = dict(
        model.objects.filter(**{f"{lookup}workspace__slug": slug}, id__in=list(ids)).values_list("id", f"{lookup}id")
    )
    if len(rows) != len(ids):
        return None
    return {str(value) for value in rows.values() if value}


def _project_keys(user, slug, project_id):
    from plane.app.permissions.base import resolve_project_grant

    return resolve_project_grant(user, slug, project_id).keys


def _product_keys(user, product):
    from plane.app.permissions.base import _get_user_product_permission_keys

    return _get_user_product_permission_keys(user, product)


def _wanted(keys):
    return {key.value if hasattr(key, "value") else str(key) for key in keys}


def repository_permission_error(request, slug, repository_ids, *, keys, template_keys):
    """逐个用例库判断（已确认属于本工作区）。template_keys=None 表示这个操作不允许落在模板库上。"""
    from plane.utils.product import can_view_product

    wanted = _wanted(keys)
    repositories = TestCaseRepository.objects.filter(workspace__slug=slug, id__in=list(repository_ids)).values(
        "id", "is_template", "product_id", "project_id"
    )
    products = {}
    for repository in repositories:
        if repository["is_template"]:
            if template_keys is None or not has_workspace_permission(request.user, slug, *template_keys):
                return _forbidden("您没有所需的用例模板库权限。")
            continue
        product_id = repository["product_id"]
        if product_id:
            if product_id not in products:
                products[product_id] = Product.objects.filter(id=product_id, workspace__slug=slug).select_related(
                    "workspace"
                ).first()
            product = products[product_id]
            if product is None or not can_view_product(request.user, product):
                return _forbidden("您没有所需的产品权限。")
            if not (_product_keys(request.user, product) & wanted):
                return _forbidden()
            continue
        if repository["project_id"]:
            if not (_project_keys(request.user, slug, repository["project_id"]) & wanted):
                return _forbidden()
            continue
        return _forbidden()
    return None


def case_scope_error(
    request,
    slug,
    *,
    keys,
    template_keys=TEMPLATE_READ,
    repository_ids=(),
    case_ids=(),
    module_ids=(),
    label_ids=(),
    comment_ids=(),
    require_target=True,
):
    """请求指向的用例 / 模块 / 库 / 标签 / 评论都要通过（见模块说明）。

    keys：产品库（或存量项目库）上要的用例 key，任一即可；template_keys：模板库上要的工作区 key，
    None 表示不允许落在模板库。什么对象都没给时 require_target=True 返回 400。
    """
    error = _member_error(request, slug)
    if error is not None:
        return error
    groups = {
        "repository": _clean(repository_ids),
        "case": _clean(case_ids),
        "module": _clean(module_ids),
        "label": _clean(label_ids),
        "comment": _clean(comment_ids),
    }
    if any(value is None for value in groups.values()):
        return _not_found()
    if not any(groups.values()):
        return _bad_request("缺少用例或用例库。") if require_target else None

    repo_ids = set()
    if groups["repository"]:
        found = {
            str(value)
            for value in TestCaseRepository.objects.filter(
                workspace__slug=slug, id__in=list(groups["repository"])
            ).values_list("id", flat=True)
        }
        if found != groups["repository"]:
            return _not_found()
        repo_ids |= found
    for name, model, lookup in (
        ("case", TestCase, "repository__"),
        ("module", CaseModule, "repository__"),
        ("label", CaseLabel, "repository__"),
    ):
        resolved = _repository_ids_of(model, lookup, slug, groups[name])
        if resolved is None:
            return _not_found()
        repo_ids |= resolved
    if groups["comment"]:
        rows = dict(
            TestCaseComment.objects.filter(
                case__repository__workspace__slug=slug, id__in=list(groups["comment"])
            ).values_list("id", "case__repository_id")
        )
        if len(rows) != len(groups["comment"]):
            return _not_found("评论不存在。")
        repo_ids |= {str(value) for value in rows.values() if value}

    return repository_permission_error(request, slug, repo_ids, keys=keys, template_keys=template_keys)


def readable_repository_q(request, slug, *, keys=CASE_VIEW, template_keys=TEMPLATE_READ, field="id"):
    """没指定库的列表接口（全工作区标签 / 模块 / 库）用：只留下这个人能读的用例库。

    返回 Q(**{f"{field}__in": [...]})；field 是查询里指向用例库 id 的字段名（如 "repository_id"）。
    """
    from plane.utils.product import can_view_product
    from plane.utils.visibility import visible_project_scope

    user = request.user
    wanted = _wanted(keys)
    allowed = set()
    repositories = list(
        TestCaseRepository.objects.filter(workspace__slug=slug).values("id", "is_template", "product_id", "project_id")
    )
    can_template = template_keys is not None and has_workspace_permission(user, slug, *template_keys)
    product_ok = {}
    project_ok = {}
    project_scope = None
    for repository in repositories:
        repository_id = str(repository["id"])
        if repository["is_template"]:
            if can_template:
                allowed.add(repository_id)
            continue
        product_id = repository["product_id"]
        if product_id:
            if product_id not in product_ok:
                product = Product.objects.filter(id=product_id).select_related("workspace").first()
                product_ok[product_id] = bool(
                    product and can_view_product(user, product) and (_product_keys(user, product) & wanted)
                )
            if product_ok[product_id]:
                allowed.add(repository_id)
            continue
        project_id = repository["project_id"]
        if project_id:
            if project_scope is None:
                project_scope = visible_project_scope(user, slug)
            if project_id not in project_ok:
                project_ok[project_id] = project_scope.contains(project_id) and bool(
                    _project_keys(user, slug, project_id) & wanted
                )
            if project_ok[project_id]:
                allowed.add(repository_id)
    return Q(**{f"{field}__in": list(allowed)})


def product_scope_error(request, slug, product_ids, *, keys):
    """用例评审等直接挂在产品上的对象：能看到产品，且在产品上持有任一 key。"""
    from plane.utils.product import can_view_product

    error = _member_error(request, slug)
    if error is not None:
        return error
    ids = _clean(product_ids)
    if ids is None:
        return _not_found("产品不存在。")
    if not ids:
        return _bad_request("缺少产品。")
    products = list(Product.objects.filter(workspace__slug=slug, id__in=list(ids)).select_related("workspace"))
    if len(products) != len(ids):
        return _not_found("产品不存在。")
    wanted = _wanted(keys)
    for product in products:
        if not can_view_product(request.user, product):
            return _forbidden("您没有所需的产品权限。")
        if not (_product_keys(request.user, product) & wanted):
            return _forbidden()
    return None


def review_scope_error(request, slug, review_ids, *, keys):
    """用例评审：按评审所属产品判断；还没挂产品的存量评审按它的项目判断。"""
    ids = _clean(review_ids)
    if ids is None:
        return _not_found("评审不存在。")
    if not ids:
        return _bad_request("缺少评审。")
    rows = list(
        CaseReview.objects.filter(
            Q(product__workspace__slug=slug) | Q(project__workspace__slug=slug), id__in=list(ids)
        ).values("id", "product_id", "project_id")
    )
    if len(rows) != len(ids):
        return _not_found("评审不存在。")
    product_ids = {str(row["product_id"]) for row in rows if row["product_id"]}
    project_ids = {str(row["project_id"]) for row in rows if not row["product_id"] and row["project_id"]}
    if len(product_ids) + len(project_ids) == 0:
        return _forbidden()
    if product_ids:
        error = product_scope_error(request, slug, product_ids, keys=keys)
        if error is not None:
            return error
    if project_ids:
        return project_scope_error(request, slug, project_ids, keys=keys)
    return None


def project_scope_error(request, slug, project_ids, *, keys):
    """项目上下文（测试计划、项目用例池）：项目属于本工作区，且在项目里持有任一 key。"""
    from plane.db.models import Project

    error = _member_error(request, slug)
    if error is not None:
        return error
    ids = _clean(project_ids)
    if ids is None:
        return _not_found("项目不存在。")
    if not ids:
        return _bad_request("缺少项目。")
    found = {
        str(value) for value in Project.objects.filter(workspace__slug=slug, id__in=list(ids)).values_list("id", flat=True)
    }
    if found != ids:
        return _not_found("项目不存在。")
    wanted = _wanted(keys)
    for project_id in found:
        if not (_project_keys(request.user, slug, project_id) & wanted):
            return _forbidden("您没有所需的项目权限。")
    return None


def plan_scope_error(request, slug, plan_ids, *, keys):
    """测试计划上下文：按计划所在项目的 project.test_plan.* 判断。"""
    ids = _clean(plan_ids)
    if ids is None:
        return _not_found("测试计划不存在。")
    if not ids:
        return _bad_request("缺少测试计划。")
    rows = dict(
        TestPlan.objects.filter(project__workspace__slug=slug, id__in=list(ids)).values_list("id", "project_id")
    )
    if len(rows) != len(ids):
        return _not_found("测试计划不存在。")
    return project_scope_error(request, slug, {str(value) for value in rows.values()}, keys=keys)


def issue_scope_error(request, slug, issue_ids, *, action):
    """工作项上下文：按工作项所在项目的工作项 / 缺陷权限判断（缺陷类别的类型走 project.defect.*）。
    action：view / edit。"""
    from plane.app.permissions.base import has_project_issue_permission, issue_type_permission_info

    error = _member_error(request, slug)
    if error is not None:
        return error
    ids = _clean(issue_ids)
    if ids is None:
        return _not_found("工作项不存在。")
    if not ids:
        return _bad_request("缺少工作项。")
    issues = list(
        Issue.objects.filter(workspace__slug=slug, id__in=list(ids)).values("id", "project_id", "type_id")
    )
    if len(issues) != len(ids):
        return _not_found("工作项不存在。")
    for issue in issues:
        if action == "view":
            # 查看不按类型限定，has_project_issue_permission 只管写动作：按类型类别取模块，查项目里的 *.view
            module, _ = issue_type_permission_info(request.user, issue["type_id"])
            allowed = f"{module}.view" in _project_keys(request.user, slug, issue["project_id"])
        else:
            allowed = has_project_issue_permission(
                request.user, slug, str(issue["project_id"]), action, issue_type_id=issue["type_id"]
            )
        if not allowed:
            return _forbidden("您没有所需的工作项权限。")
    return None


def user_can_access_cases(user, slug, case_ids, *, keys, template_keys=TEMPLATE_READ) -> bool:
    """没有 request 的地方（附件访问判断）用：这个人对这些用例有没有给定的权限。"""
    from types import SimpleNamespace

    return case_scope_error(SimpleNamespace(user=user), slug, keys=keys, template_keys=template_keys, case_ids=case_ids) is None
