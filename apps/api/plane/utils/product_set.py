"""产品集：一行 ``is_set=True`` 的产品（见 ``Product.is_set``）。

产品集自己的需求 / 用例 / 工作项 / 关联项目沿用产品的全部能力，这里只放产品集独有的两件事：
集内产品的加入与移出、列表页的汇总数字。
"""

from django.db.models import Count
from django.utils import timezone

from plane.db.models import Issue, Product, Requirement, RequirementProductScope, TestCase
from plane.utils.product import filter_visible_products
from plane.utils.profile_metrics import DEFECT_TYPE_CATEGORY_NAME

#: 「未关闭缺陷」里算已关闭的状态组
CLOSED_STATE_GROUPS = ("completed", "cancelled")


class ProductSetError(Exception):
    """加入 / 移出产品时的业务拒绝。code 给前端分支，detail 是附带数据。"""

    def __init__(self, code, message, status=400, **detail):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail

    def payload(self):
        return {"error": self.message, "code": self.code, **self.detail}


def member_products_queryset(product_set, user):
    """集内产品，按当前用户的产品可见范围收窄（看不到的产品当作不存在）。"""
    queryset = Product.objects.filter(workspace_id=product_set.workspace_id, product_set_id=product_set.id)
    return filter_visible_products(queryset, user, product_set.workspace)


def _count_by_product(queryset, field="product_id"):
    return {row[field]: row["count"] for row in queryset.order_by().values(field).annotate(count=Count("id"))}


def product_set_stats(product_sets, user):
    """列表页每个产品集的汇总：集内产品、需求数、用例数、未关闭缺陷数。返回 {产品集 id（字符串）: 数据}。"""
    stats = {
        str(product_set.id): {"products": [], "requirement_count": 0, "case_count": 0, "open_defect_count": 0}
        for product_set in product_sets
    }
    if not product_sets:
        return stats
    set_ids = [product_set.id for product_set in product_sets]
    workspace = product_sets[0].workspace

    members = (
        filter_visible_products(
            Product.objects.filter(workspace_id=workspace.id, product_set_id__in=set_ids), user, workspace
        )
        .order_by("product_set_joined_at", "created_at")
        .values("id", "name", "identifier", "product_set_id")
    )
    for member in members:
        stats[str(member["product_set_id"])]["products"].append(
            {"id": member["id"], "name": member["name"], "identifier": member["identifier"]}
        )

    counts = (
        ("requirement_count", _count_by_product(Requirement.objects.filter(product_id__in=set_ids))),
        (
            "case_count",
            _count_by_product(
                TestCase.objects.filter(repository__product_id__in=set_ids, repository__is_template=False),
                "repository__product_id",
            ),
        ),
        (
            "open_defect_count",
            _count_by_product(
                Issue.issue_objects.filter(
                    product_id__in=set_ids,
                    type__category__name=DEFECT_TYPE_CATEGORY_NAME,
                    project__archived_at__isnull=True,
                ).exclude(state__group__in=CLOSED_STATE_GROUPS)
            ),
        ),
    )
    for key, by_set in counts:
        for set_id, count in by_set.items():
            stats[str(set_id)][key] = count
    return stats


def member_requirement_counts(product_set, product_ids):
    """「产品」页签两列：各产品引用了几条产品集需求、转为自有了几条（没删的）。"""
    return {
        "referenced": _count_by_product(
            RequirementProductScope.objects.filter(
                product_id__in=product_ids, requirement__product_id=product_set.id
            )
        ),
        "converted": _count_by_product(
            Requirement.objects.filter(product_id__in=product_ids, origin_product_id=product_set.id)
        ),
    }


def add_products_to_set(product_set, product_ids, user):
    """把一批产品加入产品集，返回加入的产品。任何一个不合格整批拒绝，不做部分加入。"""
    product_ids = list(dict.fromkeys(str(product_id) for product_id in product_ids))
    if not product_ids:
        raise ProductSetError("PRODUCT_SET_PRODUCTS_REQUIRED", "请选择要加入的产品。")

    workspace = product_set.workspace
    products = list(
        filter_visible_products(
            Product.objects.filter(workspace_id=workspace.id, id__in=product_ids, is_set=False),
            user,
            workspace,
        ).select_for_update(of=("self",))
    )
    found_ids = {str(product.id) for product in products}
    missing_ids = [product_id for product_id in product_ids if product_id not in found_ids]
    if missing_ids:
        raise ProductSetError(
            "PRODUCT_SET_PRODUCT_NOT_FOUND", "有产品不存在或不可加入产品集。", product_ids=missing_ids
        )

    # 一个产品只能属于一个产品集：已在别的产品集里的，要先在那边移出
    taken = [product for product in products if product.product_set_id and product.product_set_id != product_set.id]
    if taken:
        raise ProductSetError(
            "PRODUCT_ALREADY_IN_SET",
            "有产品已属于其他产品集，一个产品只能属于一个产品集。",
            status=409,
            product_ids=[str(product.id) for product in taken],
        )

    added = [product for product in products if product.product_set_id is None]
    now = timezone.now()
    Product.objects.filter(id__in=[product.id for product in added]).update(
        product_set_id=product_set.id, product_set_joined_at=now, updated_at=now, updated_by=user
    )
    return added


def remove_product_from_set(product_set, product_id, user):
    """把产品移出产品集。产品不在这个集里时返回 False。

    它对产品集需求的引用（使用范围行）一并拿掉；已转为自有的需求是它自己的，不动。
    调用方要包在事务里。
    """
    updated = Product.objects.filter(
        id=product_id, workspace_id=product_set.workspace_id, product_set_id=product_set.id
    ).update(product_set=None, product_set_joined_at=None, updated_at=timezone.now(), updated_by=user)
    if updated:
        RequirementProductScope.objects.filter(
            product_id=product_id, requirement__product_id=product_set.id
        ).delete(soft=False)
    return bool(updated)
