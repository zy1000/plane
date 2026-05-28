from dataclasses import dataclass, field

from plane.db.models import Release, ReleaseIssue, ReleaseStatus, StateGroup, FileAsset


@dataclass
class ReleaseStateCheckResult:
    """状态流转校验结果，allowed 为 True 时 reasons 为空。"""

    allowed: bool
    reasons: list[str] = field(default_factory=list)

    def __bool__(self) -> bool:
        return self.allowed


def has_required_schedule_fields(release: Release):
    """检查开始日期、结束日期等字段是否填写"""
    if any([
        release.start_date is None,
        release.target_date is None,
        release.test_handoff_date is None,
    ]):
        return False
    return True


def has_issues(release: Release):
    return ReleaseIssue.objects.filter(release=release).exists()


def all_issues_done(release: Release):
    """判断发布下面的工作项是否全部完成"""
    return not ReleaseIssue.objects.filter(release=release).exclude(
        issue__state__group__in=[StateGroup.COMPLETED, StateGroup.CANCELLED]).exists()


def all_issues_cancelled(release: Release):
    """判断发布下的工作项是否全部取消"""
    return not ReleaseIssue.objects.filter(release=release).exclude(issue__state__group=StateGroup.CANCELLED).exists()


def has_attachment(release: Release):
    """判断发布下是否有附件"""
    return FileAsset.objects.filter(release=release).exists()


def has_test_plan(release: Release):
    """判断发布是否有关联测试计划"""
    return release.plans.filter(deleted_at__isnull=True).exists()


# 不需要额外业务校验、仅做"是否允许"判断的合法流转白名单
_WHITELISTED_TRANSITIONS: set[tuple[str, str]] = {
    # 待测试 -> 测试中 / 已驳回
    (ReleaseStatus.PENDING_TEST, ReleaseStatus.TESTING),
    (ReleaseStatus.PENDING_TEST, ReleaseStatus.REJECTED),
    # 测试中 -> 已驳回
    (ReleaseStatus.TESTING, ReleaseStatus.REJECTED),
}


def _is_whitelisted_no_check(current: str, next_status: str) -> bool:
    # 任意非已取消 -> 已取消
    if next_status == ReleaseStatus.CANCELLED and current != ReleaseStatus.CANCELLED:
        return True
    if current == ReleaseStatus.CANCELLED or current == ReleaseStatus.REJECTED:
        return True
    return (current, next_status) in _WHITELISTED_TRANSITIONS


def _result(reasons: list[str]) -> ReleaseStateCheckResult:
    return ReleaseStateCheckResult(allowed=not reasons, reasons=reasons)


def check_release_state(release: Release, next_status: ReleaseStatus) -> ReleaseStateCheckResult:
    """校验发布状态流转，返回是否允许及失败原因列表。"""
    reasons: list[str] = []
    current = release.status

    if current == next_status:
        return _result(reasons)

    # 未开始 -> 进行中
    if current == ReleaseStatus.NOT_STARTED and next_status == ReleaseStatus.IN_PROGRESS:
        if release.start_date is None:
            reasons.append("请填写开始时间")
        if release.target_date is None:
            reasons.append("请填写结束时间")
        if release.test_handoff_date is None:
            reasons.append("请填写转测日期")
        if not has_issues(release):
            reasons.append("请先规划工作项")
        return _result(reasons)

    # 进行中 -> 待测试
    if current == ReleaseStatus.IN_PROGRESS and next_status == ReleaseStatus.PENDING_TEST:
        if has_issues(release) and all_issues_cancelled(release):
            reasons.append("发布下工作项已全部取消，只能改为已取消")
        else:
            if not all_issues_done(release):
                reasons.append("存在未完成的工作项")
            if not has_attachment(release):
                reasons.append("请上传发布附件")
        return _result(reasons)

    # 测试中 -> 已完成
    if current == ReleaseStatus.TESTING and next_status == ReleaseStatus.COMPLETED:
        if not has_test_plan(release):
            reasons.append("请关联测试计划")
        return _result(reasons)

    if _is_whitelisted_no_check(current, next_status):
        return ReleaseStateCheckResult(allowed=True, reasons=[])

    current_label = ReleaseStatus(current).label if current else current
    next_label = ReleaseStatus(next_status).label if next_status else next_status
    return ReleaseStateCheckResult(
        allowed=False,
        reasons=[f"当前状态「{current_label}」不允许变更为「{next_label}」"],
    )
