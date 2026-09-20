import uuid
from collections import defaultdict

from django.db.models import Count
from django.utils import timezone

from plane.db.models import (
    CaseReview,
    CaseReviewRecord,
    CaseReviewThrough,
    PlanCase,
    PlanCaseReviewRecord,
    ReviewApprovalType,
    TestCase,
    WorkspaceMember,
)


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


def compute_plan_case_review_status(
    last_vote_by_reviewer, reviewer_ids, approval_type, required_count
):
    """按计划的通过规则，把「每位复核人的最后一票」折算成该用例的复核状态。

    - 一票否决：任一复核人不通过 → 不通过（不再看票数）
    - 通过线：all = 全部复核人，n_of_m = required_count
    - 没设复核人或一票没投 → 未复核；投了但没达线 → 复核中
    """
    if not reviewer_ids or not last_vote_by_reviewer:
        return PlanCase.ReviewStatus.NOT_START

    if any(
        result == PlanCaseReviewRecord.Result.FAIL
        for result in last_vote_by_reviewer.values()
    ):
        return PlanCase.ReviewStatus.FAIL

    if approval_type == ReviewApprovalType.N_OF_M:
        required = required_count or len(reviewer_ids)
    else:
        required = len(reviewer_ids)

    approved_count = sum(
        1
        for result in last_vote_by_reviewer.values()
        if result == PlanCaseReviewRecord.Result.PASS
    )
    if approved_count >= required:
        return PlanCase.ReviewStatus.PASS
    return PlanCase.ReviewStatus.PROCESS


def recompute_plan_case_review_statuses(plan, plan_case_ids=None):
    """重算计划下（或指定几条）计划用例的复核状态，返回 {plan_case_id: status}。

    复核人或通过规则变更后也要调用：老票按新规则重新折算。
    每位复核人只算最后一票，已作废（重新执行过）的记录不参与。
    """
    reviewer_ids = [str(rid) for rid in plan.reviewers.values_list("id", flat=True)]

    plan_cases = PlanCase.objects.filter(plan=plan, deleted_at__isnull=True)
    if plan_case_ids is not None:
        plan_cases = plan_cases.filter(id__in=list(plan_case_ids))
    plan_cases = list(plan_cases.only("id", "review_status"))
    if not plan_cases:
        return {}

    votes_by_plan_case = defaultdict(dict)
    if reviewer_ids:
        records = (
            PlanCaseReviewRecord.objects.filter(
                plan_case_id__in=[pc.id for pc in plan_cases],
                reviewer_id__in=reviewer_ids,
                invalidated_at__isnull=True,
                deleted_at__isnull=True,
            )
            .order_by("plan_case_id", "reviewer_id", "-created_at")
            .values_list("plan_case_id", "reviewer_id", "result")
        )
        for plan_case_id, reviewer_id, result in records:
            votes = votes_by_plan_case[plan_case_id]
            # order_by 已把每人最新的一条排在前面，后面的都是旧票
            votes.setdefault(str(reviewer_id), result)

    statuses = {}
    changed = []
    for plan_case in plan_cases:
        status = compute_plan_case_review_status(
            votes_by_plan_case.get(plan_case.id, {}),
            reviewer_ids,
            plan.review_approval_type,
            plan.review_required_count,
        )
        statuses[str(plan_case.id)] = status
        if plan_case.review_status != status:
            plan_case.review_status = status
            changed.append(plan_case)

    if changed:
        PlanCase.objects.bulk_update(changed, ["review_status"], batch_size=1000)

    return statuses


def invalidate_plan_case_review_records(plan_case_ids):
    """作废这些计划用例此前的复核记录（重新执行后旧结论不再算数，但历史保留可查）。"""
    plan_case_ids = list(plan_case_ids or [])
    if not plan_case_ids:
        return
    PlanCaseReviewRecord.objects.filter(
        plan_case_id__in=plan_case_ids, invalidated_at__isnull=True
    ).update(invalidated_at=timezone.now())


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


# 卡片上待评审头像最多显示 5 个，剩下的只用数字表示，评审人多的评审不必把全量 id 发给前端
PENDING_ASSIGNEE_PREVIEW = 5


def build_review_case_rows(rows, current_user_id=None, include_assignees=True):
    """把 values() 取出的评审用例扁平行拼成列表接口的返回结构。

    一次评审能挂上千条用例，让 ORM 逐行实例化 case/repository/module/review 会占掉接口大半耗时，
    这里改成整页一次性取评审人、评审结论和建议数，再在内存里拼。

    include_assignees=False 时不下发整行的评审人 id（评审页的卡片列表一次要上千行，
    这些 uuid 能占掉响应体的一多半，它只需要「我在这条上是什么身份」和几个待评审头像）；
    评审详情页的表格要编辑评审人，仍然取全量。
    """
    rows = list(rows)
    if not rows:
        return []

    crt_ids = [row["id"] for row in rows]

    # 评审人按 User 的默认排序取，和之前 prefetch_related("assignees") 出来的顺序保持一致
    assignees_by_crt = defaultdict(list)
    for crt_id, user_id in (
        CaseReviewThrough.assignees.through.objects.filter(casereviewthrough_id__in=crt_ids)
        .order_by("-user__created_at")
        .values_list("casereviewthrough_id", "user_id")
    ):
        assignees_by_crt[crt_id].append(str(user_id))

    # 每个评审人在该条用例上的最后一条结论，「建议」不算结论
    last_result_by_crt = defaultdict(dict)
    for crt_id, assignee_id, result in (
        CaseReviewRecord.objects.filter(crt_id__in=crt_ids, deleted_at__isnull=True)
        .exclude(result=CaseReviewRecord.Result.SUGGEST)
        .order_by("assignee_id", "-created_at")
        .values_list("crt_id", "assignee_id", "result")
    ):
        if assignee_id:
            last_result_by_crt[crt_id].setdefault(str(assignee_id), result)

    suggestion_counts = {
        item["crt_id"]: item["count"]
        for item in CaseReviewRecord.objects.filter(
            crt_id__in=crt_ids,
            result=CaseReviewRecord.Result.SUGGEST,
            confirmed=False,
            deleted_at__isnull=True,
        )
        .values("crt_id")
        .annotate(count=Count("id"))
    }

    current_user_id = str(current_user_id) if current_user_id else None
    data = []
    for row in rows:
        crt_id = row["id"]
        assignee_ids = assignees_by_crt.get(crt_id, [])
        last_result = last_result_by_crt.get(crt_id, {})
        unreviewed_assignees = []
        for assignee_id in assignee_ids:
            result = last_result.get(assignee_id)
            reviewed = bool(result) and str(result) != str(CaseReviewRecord.Result.RE_REVIEW)
            if not reviewed:
                unreviewed_assignees.append(assignee_id)
        if current_user_id and current_user_id in assignee_ids:
            mine = "todo" if current_user_id in unreviewed_assignees else "done"
        else:
            mine = None
        created_by_id = row["created_by_id"]
        data.append(
            {
                "id": str(crt_id),
                "name": row["case__name"],
                "priority": row["case__priority"],
                "result": row["result"],
                **({"assignees": assignee_ids} if include_assignees else {}),
                "created_by": str(created_by_id) if created_by_id else None,
                "case_id": str(row["case_id"]),
                "code": row["case__code"],
                "repository": row["case__repository__name"],
                "module": row["case__module__name"],
                "suggestion_count": suggestion_counts.get(crt_id, 0),
                "mine": mine,
                "pending_assignees": unreviewed_assignees[:PENDING_ASSIGNEE_PREVIEW],
                "reviewed_count": len(assignee_ids) - len(unreviewed_assignees),
                "reviewer_count": len(assignee_ids),
            }
        )
    return data
