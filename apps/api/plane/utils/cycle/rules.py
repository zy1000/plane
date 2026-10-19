from dataclasses import dataclass, field

from plane.db.models import (
    Cycle,
    CycleIssue,
    FileAsset,
    RequirementCycle,
    RequirementItemStatus,
    StateGroup,
)
from plane.utils.html_processor import strip_tags


@dataclass
class CycleStateCheckResult:
    """状态流转校验结果，allowed 为 True 时 reasons 为空。"""

    allowed: bool
    reasons: list[str] = field(default_factory=list)

    def __bool__(self) -> bool:
        return self.allowed


def has_issues(cycle: Cycle):
    return CycleIssue.objects.filter(cycle=cycle).exists()


def all_issues_done(cycle: Cycle):
    """判断迭代下面的工作项是否全部完成（忽略已取消）。"""
    return not CycleIssue.objects.filter(cycle=cycle).exclude(
        issue__state__group__in=[StateGroup.COMPLETED, StateGroup.CANCELLED]
    ).exists()

def all_issues_ready(cycle: Cycle):
    return not CycleIssue.objects.filter(cycle=cycle).exclude(
        issue__state__group__in=[StateGroup.COMPLETED, StateGroup.CANCELLED,StateGroup.STARTED]
    ).exists()

def all_issues_cancelled(cycle: Cycle):
    """判断迭代下的工作项是否全部取消。"""
    return not CycleIssue.objects.filter(cycle=cycle).exclude(
        issue__state__group=StateGroup.CANCELLED
    ).exists()


def requirement_statuses(cycle: Cycle) -> list[str]:
    """迭代下关联需求的交付状态列表（软删需求不计）。"""
    return list(
        RequirementCycle.objects.filter(cycle=cycle, requirement__deleted_at__isnull=True).values_list(
            "requirement__status", flat=True
        )
    )


# 需求的「未开始」口径，对应工作项的 backlog / unstarted
UNSTARTED_REQUIREMENT_STATUSES = {RequirementItemStatus.NOT_STARTED, RequirementItemStatus.PROJECTED}


def has_attachment(cycle: Cycle):
    """判断迭代下是否有已上传且未删除的迭代附件。"""
    return FileAsset.objects.filter(
        cycle=cycle,
        entity_type=FileAsset.EntityTypeContext.CYCLE_FILE,
        is_uploaded=True,
        is_deleted=False,
    ).exists()


def has_test_plan(cycle: Cycle):
    """判断迭代下是否至少关联一个未删除的测试计划。"""
    return cycle.plans.filter(deleted_at__isnull=True).exists()


def has_suggested_test_scope(cycle: Cycle) -> bool:
    """判断建议测试范围富文本是否有实际可见内容。"""
    raw = cycle.suggested_test_scope
    if not raw:
        return False
    try:
        text = strip_tags(str(raw))
    except Exception:
        text = str(raw)
    return bool(text.strip())


def _result(reasons: list[str]) -> CycleStateCheckResult:
    return CycleStateCheckResult(allowed=not reasons, reasons=reasons)


def check_cycle_state(cycle: Cycle, next_status: Cycle.Status) -> CycleStateCheckResult:
    """校验迭代状态流转，返回是否允许及失败原因列表。"""
    reasons: list[str] = []
    current = cycle.status

    if current == next_status:
        return _result(reasons)

    if current == Cycle.Status.COMPLETED:
        current_label = Cycle.Status(current).label if current else current
        next_label = Cycle.Status(next_status).label if next_status else next_status
        return CycleStateCheckResult(
            allowed=False,
            reasons=[f"当前状态「{current_label}」不允许变更为「{next_label}」"],
        )

    if current == Cycle.Status.CANCELLED and next_status != Cycle.Status.IN_PROGRESS:
        current_label = Cycle.Status(current).label if current else current
        next_label = Cycle.Status(next_status).label if next_status else next_status
        return CycleStateCheckResult(
            allowed=False,
            reasons=[f"当前状态「{current_label}」不允许变更为「{next_label}」"],
        )

    if next_status == Cycle.Status.CANCELLED:
        return CycleStateCheckResult(allowed=True, reasons=[])

    # 未开始/已取消 -> 进行中
    if current in (Cycle.Status.NOT_STARTED, Cycle.Status.CANCELLED) and next_status == Cycle.Status.IN_PROGRESS:
        if cycle.start_date is None:
            reasons.append("请填写开始时间")
        if cycle.end_date is None:
            reasons.append("请填写结束时间")
        if not has_issues(cycle) and not requirement_statuses(cycle):
            reasons.append("请先规划工作项或关联需求")
        return _result(reasons)

    # 进行中/已退回 -> 测试中
    if current in (Cycle.Status.IN_PROGRESS, Cycle.Status.RETURNED) and next_status == Cycle.Status.TESTING:
        if not has_attachment(cycle):
            reasons.append("请上传迭代附件")
        if not has_suggested_test_scope(cycle):
            reasons.append("请填写建议测试范围")
        if not has_test_plan(cycle):
            reasons.append("请先关联测试计划")
        # 已关闭的需求等同已取消的工作项
        req_statuses = requirement_statuses(cycle)
        if (
            (has_issues(cycle) or req_statuses)
            and all_issues_cancelled(cycle)
            and all(s == RequirementItemStatus.CLOSED for s in req_statuses)
        ):
            reasons.append("迭代下工作项和需求已全部取消，只能改为已取消")
        else:
            if not all_issues_ready(cycle):
                reasons.append("存在未开始的工作项")
            if any(s in UNSTARTED_REQUIREMENT_STATUSES for s in req_statuses):
                reasons.append("存在「未开始」或「已立项」的需求")
        return _result(reasons)

    # 测试中 -> 已退回（无额外前置条件）
    if current == Cycle.Status.TESTING and next_status == Cycle.Status.RETURNED:
        return _result(reasons)

    # 测试中 -> 已完成（无额外前置条件）
    if current == Cycle.Status.TESTING and next_status == Cycle.Status.COMPLETED:
        return _result(reasons)

    current_label = Cycle.Status(current).label if current else current
    next_label = Cycle.Status(next_status).label if next_status else next_status
    return CycleStateCheckResult(
        allowed=False,
        reasons=[f"当前状态「{current_label}」不允许变更为「{next_label}」"],
    )
