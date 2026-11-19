"""产品「工作项」页签：关联到本产品的工作项（跨项目、只读、分页）。

口径与取数在 utils/product_work_items.py；筛选走工作项富筛选同一套 filters 表达式。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.mixins import get_scoped_product
from plane.utils.filters import IssueFilterSet
from plane.utils.filters.issue_filter_backend import IssueComplexFilterBackend
from plane.utils.product_work_items import (
    STATE_GROUPS,
    apply_search,
    facets,
    page_rows,
    product_work_item_queryset,
    state_group_counts,
)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


def _positive_int(raw, default):
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


class ProductWorkItemsEndpoint(BaseAPIView):
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        base = product_work_item_queryset(request.user, product)
        queryset = apply_search(self.filter_queryset(base), request.query_params.get("search"))
        counts = state_group_counts(queryset)

        state_group = request.query_params.get("state_group")
        if state_group in STATE_GROUPS:
            queryset = queryset.filter(state__group=state_group)
            total = counts[state_group]
        else:
            total = counts["all"]

        per_page = min(_positive_int(request.query_params.get("per_page"), DEFAULT_PER_PAGE), MAX_PER_PAGE)
        page = _positive_int(request.query_params.get("page"), 1)

        return Response(
            {
                "total": total,
                "page": page,
                "per_page": per_page,
                "state_group_counts": counts,
                "facets": facets(base),
                "results": page_rows(queryset, offset=(page - 1) * per_page, limit=per_page),
            },
            status=status.HTTP_200_OK,
        )
