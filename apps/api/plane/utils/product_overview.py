"""产品概览页的聚合数字。

概览是只读汇总，各块的数据源与对应页签同口径，这里只做计数，不出明细：

- 需求：产品下未删除的需求（``Requirement.product``），状态五档 + 评审中 + 逾期 / 临期
  + 待审批变更单 + 有用例覆盖的条数。
- 测试：产品用例库（非模板）里的用例数、用例库数、进行中的用例评审数。

关联项目、发布两块前端直接复用对应页签的接口，不在这里重复。
"""

from datetime import timedelta

from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from plane.db.models import (
    CaseReview,
    Requirement,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementItemStatus,
    RequirementTestCase,
    TestCase,
    TestCaseRepository,
)

#: 未交付完的状态：逾期 / 临期只看这些（已发布、已关闭不算）
OPEN_REQUIREMENT_STATUSES = (
    RequirementItemStatus.NOT_STARTED,
    RequirementItemStatus.PROJECTED,
    RequirementItemStatus.IN_PROGRESS,
)
#: 临期窗口：与项目概览「7 天内到期」同一口径（含今天起 7 天）
DUE_SOON_DAYS = 7


def requirement_summary(product):
    """需求块：状态分布 + 四个风险数 + 用例覆盖。"""
    requirements = Requirement.objects.filter(product_id=product.id)
    today = timezone.localdate()
    open_status = Q(status__in=OPEN_REQUIREMENT_STATUSES)

    status_counts = {status: 0 for status in RequirementItemStatus.values}
    for row in requirements.order_by().values("status").annotate(count=Count("id")):
        if row["status"] in status_counts:
            status_counts[row["status"]] = row["count"]

    risk = requirements.aggregate(
        in_review=Count("id", filter=Q(pending_change_item__isnull=False)),
        overdue=Count("id", filter=open_status & Q(target_date__lt=today)),
        due_soon=Count(
            "id",
            filter=open_status
            & Q(
                target_date__gte=today,
                target_date__lte=today + timedelta(days=DUE_SOON_DAYS),
            ),
        ),
    )

    # 覆盖率只看未关闭的需求：已关闭的不再需要用例。
    # 用 Exists 而不是反向关联过滤：反向 join 上写 deleted_at__isnull 会把「没有关联行」也算进来
    active = requirements.exclude(status=RequirementItemStatus.CLOSED)
    covered_count = active.filter(
        Exists(
            RequirementTestCase.objects.filter(
                requirement_id=OuterRef("pk"), case__deleted_at__isnull=True
            )
        )
    ).count()

    return {
        "total": sum(status_counts.values()),
        "status_counts": status_counts,
        "in_review_count": risk["in_review"] or 0,
        "overdue_count": risk["overdue"] or 0,
        "due_soon_count": risk["due_soon"] or 0,
        "pending_change_request_count": RequirementChangeRequest.objects.filter(
            product_id=product.id, status=RequirementChangeStatus.PENDING
        ).count(),
        "coverage": {
            "covered_count": covered_count,
            "total": active.count(),
        },
    }


def test_summary(product, *, can_view_cases, can_view_reviews):
    """测试块：没权限的数字给 None，前端显示「—」。"""
    repositories = TestCaseRepository.objects.filter(product_id=product.id, is_template=False)
    return {
        "case_count": (
            TestCase.objects.filter(repository__in=repositories).count() if can_view_cases else None
        ),
        "repository_count": repositories.count() if can_view_cases else None,
        "active_review_count": (
            CaseReview.objects.filter(
                product_id=product.id, state=CaseReview.State.PROGRESS
            ).count()
            if can_view_reviews
            else None
        ),
    }
