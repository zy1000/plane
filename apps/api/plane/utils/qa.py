import uuid

from plane.db.models import CaseReview, CaseReviewRecord, CaseReviewThrough, TestCase, WorkspaceMember


def invalid_workspace_member_ids(slug, member_ids):
    """返回不是该工作区活跃成员的 id 集合（字符串），空集合即全部合法；非法 UUID 也视为不合法。"""
    wanted = set()
    invalid = set()
    for member_id in member_ids:
        try:
            wanted.add(str(uuid.UUID(str(member_id))))
        except (ValueError, TypeError, AttributeError):
            invalid.add(str(member_id))
    if wanted:
        valid = {
            str(member_id)
            for member_id in WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member_id__in=wanted,
                deleted_at__isnull=True,
                is_active=True,
            ).values_list("member_id", flat=True)
        }
        invalid |= wanted - valid
    return invalid


def set_review_case_assignees(crt_ids, assignee_ids):
    """整体覆盖一批评审用例的评审人。

    必须先删再插：软删不会清 through 行，复活的评审用例会残留旧评审人。
    """
    crt_ids = list(crt_ids)
    if not crt_ids:
        return
    through = CaseReviewThrough.assignees.through
    through.objects.filter(casereviewthrough_id__in=crt_ids).delete()
    assignee_ids = list(dict.fromkeys(assignee_ids or []))
    if assignee_ids:
        through.objects.bulk_create(
            [
                through(casereviewthrough_id=crt_id, user_id=user_id)
                for crt_id in crt_ids
                for user_id in assignee_ids
            ],
            batch_size=1000,
        )


def sync_review_reviewer_summary(cr: CaseReview):
    """把评审单上的 assignees / mode 同步成用例级评审人的派生汇总。

    评审人的权威数据源是 CaseReviewThrough.assignees，评审单上这两个字段只用于
    列表展示、筛选、项目概览与分析页，不参与任何评审结论判定：
    - assignees：该评审单下所有用例评审人的并集
    - mode：任一用例评审人多于 1 人即「多人评审」
    """
    per_case = {}
    for crt_id, user_id in CaseReviewThrough.assignees.through.objects.filter(
        casereviewthrough__review=cr
    ).values_list("casereviewthrough_id", "user_id"):
        per_case.setdefault(crt_id, set()).add(user_id)

    union = set()
    for user_ids in per_case.values():
        union |= user_ids

    cr.assignees.set(union)
    cr.mode = (
        CaseReview.ReviewMode.MULTIPLE
        if any(len(user_ids) > 1 for user_ids in per_case.values())
        else CaseReview.ReviewMode.SINGLE
    )
    cr.save(update_fields=["mode", "updated_at"])


def update_review_status(cr: CaseReview):
    """用例评审状态变更"""
    through_results = set(
        CaseReviewThrough.objects.filter(review=cr).values_list('result', flat=True)
    )
    if (
            CaseReviewThrough.Result.NOT_START in through_results or
            CaseReviewThrough.Result.PROCESS in through_results or
            CaseReviewThrough.Result.RE_REVIEW in through_results
    ):
        cr.state = CaseReview.State.PROGRESS
    else:
        cr.state = CaseReview.State.COMPLETED
    cr.save()

def update_case_review_status(cr, crt):
    """按该条用例自己的评审人重算它的评审结论。

    评审人是用例级的（CaseReviewThrough.assignees），评审单上的 mode 不参与判定。
    每个评审人只看最后一条非「建议」记录，优先级：
    没人/没记录 → 未评审 > 不通过 > 重新提审 > 有人没评（评审中）> 全通过 > 其余评审中
    """
    assignee_ids = list(crt.assignees.values_list('id', flat=True))
    if not assignee_ids:
        crt.result = CaseReviewThrough.Result.NOT_START
        crt.save()
        update_review_status(cr)
        return

    records = (
        CaseReviewRecord.objects
        .filter(crt=crt, assignee_id__in=assignee_ids)
        .exclude(result=CaseReviewRecord.Result.SUGGEST)
        .order_by('assignee_id', '-created_at')
    )
    last_by_assignee = {}
    for r in records:
        if r.assignee_id not in last_by_assignee:
            last_by_assignee[r.assignee_id] = r.result

    if not last_by_assignee:
        crt.result = CaseReviewThrough.Result.NOT_START
    elif any(res == CaseReviewRecord.Result.FAIL for res in last_by_assignee.values()):
        crt.result = CaseReviewThrough.Result.FAIL
    elif any(res == CaseReviewRecord.Result.RE_REVIEW for res in last_by_assignee.values()):
        crt.result = CaseReviewThrough.Result.RE_REVIEW
    elif any(aid not in last_by_assignee for aid in assignee_ids):
        crt.result = CaseReviewThrough.Result.PROCESS
    elif all(res == CaseReviewRecord.Result.PASS for res in last_by_assignee.values()):
        crt.result = CaseReviewThrough.Result.PASS
    else:
        crt.result = CaseReviewThrough.Result.PROCESS
    crt.save()

    update_review_status(cr)


def re_approval_case(case: TestCase):
    crts = CaseReviewThrough.objects.filter(case=case)
    for crt in crts:
        assignees = crt.assignees.values_list('id', flat=True)
        for assignee in assignees:
            record = CaseReviewRecord.objects.filter(
                result__in=[CaseReviewRecord.Result.PASS, CaseReviewRecord.Result.FAIL],
                assignee=assignee, crt=crt).first()
            if not record: continue
            CaseReviewRecord.objects.create(result=CaseReviewThrough.Result.RE_REVIEW, assignee=record.assignee,
                                            crt=crt, reason='用例内容变更')
        update_case_review_status(crt.review, crt)

