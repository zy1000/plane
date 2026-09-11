"""阶段评审实例的领域编排：状态推进、结论落地、负责人解析。

裁剪表签批生效时生成的那批 ``StageReview``（见 ``utils/review_tailoring.py``），
以及手工补建的评审，都在这里走同一套规则。三条贯穿全文的约定：

1. **状态只能顺着走，一次一步。** ``未评审 → 评审中 → 审核中 → 已评审`` 每一步都是
   一个显式动作，没有「直接改状态」的写入口 —— 前端也就没有状态下拉框。退回同样
   只允许回到**上一步**，不允许从已评审一键打回未评审。这样「谁在什么时候把它推到
   哪一步」在 ``StageReviewActivity`` 里是一条连续的线。
2. **结论在提交审核那一刻定稿。** ``result`` 不是随便改的字段：它只在 ``submit()``
   里写入，条件通过必须带原因，O 阶段的两种类型必须同时给生产方式与出货评估。校验
   集中在 ``_validate_result``，模型的 ``clean()`` 只兜底「字段与 kind 不匹配」。
3. **评审与评审活动一视同仁。** 两者是同一张表的两行，父评审**不汇总**子活动的结论
   （产品决策）—— 所以这里没有任何「子活动没评完就不许提交父评审」的联动，各推各的。

负责人解析（``resolve_role_candidates``）是模板落地到具体产品的那一跳：模板上存的是
角色名称文本（发起者 / 主导者 / 审核者），这里按「该产品下担任这个角色的人」筛，
筛不出来就退回到全部项目成员 —— 角色没配好不该让人选不出负责人。
"""

from django.core.exceptions import ValidationError
from django.db.models import Q

from plane.db.models import (
    FileAsset,
    ProductMember,
    ProjectMember,
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewResult,
    StageReviewStatus,
    User,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.db.models.stage_review import O_STAGE_KINDS


class StageReviewError(Exception):
    """带错误码的领域异常。视图统一翻成 400 / 409，前端按 code 出中文文案。"""

    def __init__(self, message, *, code="STAGE_REVIEW_INVALID", detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail or {}


#: 顺序推进：当前状态 → 下一步。倒过来就是退回一步（``PREVIOUS_STATUS``）。
NEXT_STATUS = {
    StageReviewStatus.NOT_STARTED: StageReviewStatus.IN_REVIEW,
    StageReviewStatus.IN_REVIEW: StageReviewStatus.IN_APPROVAL,
    StageReviewStatus.IN_APPROVAL: StageReviewStatus.COMPLETED,
}
PREVIOUS_STATUS = {next_: current for current, next_ in NEXT_STATUS.items()}

#: 每一步的按钮文案，写进活动记录的 comment 里，读历史时不用再翻代码
ADVANCE_VERB = {
    StageReviewStatus.NOT_STARTED: "开始评审",
    StageReviewStatus.IN_REVIEW: "提交审核",
    StageReviewStatus.IN_APPROVAL: "审核通过",
}


def write_activity(
    review,
    *,
    actor,
    verb,
    field=None,
    old_value=None,
    new_value=None,
    comment="",
    extra=None,
    review_comment=None,
):
    """同步写一条变更历史，与产生它的动作在同一个事务里。

    口径同 ``ReviewTailoringActivity``：事件全部由评审自己的几个动作产生，异步化
    换不来什么，却会带来「状态推进了但历史丢了」。``created_by`` 显式给 —— crum
    在后台任务里没有请求上下文。
    """
    return StageReviewActivity.objects.create(
        workspace_id=review.workspace_id,
        project_id=review.project_id,
        stage_review=review,
        actor=actor,
        created_by=actor,
        updated_by=actor,
        verb=verb,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        comment=comment,
        extra=extra or {},
        stage_review_comment=review_comment,
    )


def _validated(review):
    """跑模型校验，把 Django 的 ValidationError 翻成带错误码的领域异常。

    不翻的话它会一路冒到 DRF 外面变成 500 —— 而这里挡下来的全是「字段与 kind 不匹配」
    「结束日期早于开始日期」这类用户改得动的问题。
    """
    try:
        review.full_clean(exclude=["workspace", "project", "product", "stage", "parent"])
    except ValidationError as exc:
        messages = getattr(exc, "message_dict", {})
        first = next(iter(messages.values()), ["数据不合法"])[0] if messages else "数据不合法"
        raise StageReviewError(first, code="STAGE_REVIEW_INVALID", detail={"fields": messages})
    return review


# --- 结论校验 -------------------------------------------------------------


def _validate_result(review, payload):
    """提交审核时的结论校验。返回要写回评审的字段字典。

    O 阶段的生产方式与出货评估在这里**必填** —— 它们是 O 阶段放行与否的实际依据，
    留空的话审核的人看不到该看的东西。非 O 阶段传了就报错，不做静默丢弃。
    """
    result = payload.get("result") or ""
    if result not in StageReviewResult.values:
        raise StageReviewError(
            "评审结果必填", code="STAGE_REVIEW_RESULT_REQUIRED", detail={"field": "result"}
        )

    reason = (payload.get("conditional_reason") or "").strip()
    if result == StageReviewResult.CONDITIONAL and not reason:
        raise StageReviewError(
            "条件通过必须填写原因",
            code="STAGE_REVIEW_CONDITIONAL_REASON_REQUIRED",
            detail={"field": "conditional_reason"},
        )
    # 换成别的结论时把上一次的原因清掉，免得详情页挂着一段对不上的说明
    fields = {
        "result": result,
        "conditional_reason": reason if result == StageReviewResult.CONDITIONAL else "",
    }

    production_mode = payload.get("production_mode") or ""
    shipment_assessment = payload.get("shipment_assessment") or ""
    if review.kind in O_STAGE_KINDS:
        if not production_mode:
            raise StageReviewError(
                "生产方式必填",
                code="STAGE_REVIEW_PRODUCTION_MODE_REQUIRED",
                detail={"field": "production_mode"},
            )
        if not shipment_assessment:
            raise StageReviewError(
                "出货评估必填",
                code="STAGE_REVIEW_SHIPMENT_ASSESSMENT_REQUIRED",
                detail={"field": "shipment_assessment"},
            )
        fields["production_mode"] = production_mode
        fields["shipment_assessment"] = shipment_assessment
    elif production_mode or shipment_assessment:
        raise StageReviewError(
            "生产方式 / 出货评估只属于 O 阶段的评审类型",
            code="STAGE_REVIEW_O_STAGE_FIELD_NOT_ALLOWED",
        )
    return fields


# --- 状态推进 -------------------------------------------------------------


def advance(review, *, actor, payload=None):
    """把评审推进一步。调用方负责事务与行锁。

    ``评审中 → 审核中`` 这一跳顺带把结论写进去 —— 结论与「提交」是同一个动作的两
    面，分成两个接口会出现「提交了但没结论」的中间态。
    """
    if review.status not in NEXT_STATUS:
        raise StageReviewError(
            "已评审的评审不能再往前推进", code="STAGE_REVIEW_ALREADY_COMPLETED"
        )

    old_status = review.status
    new_status = NEXT_STATUS[old_status]
    update_fields = ["status"]

    if old_status == StageReviewStatus.IN_REVIEW:
        for field, value in _validate_result(review, payload or {}).items():
            setattr(review, field, value)
            update_fields.append(field)

    review.status = new_status
    review.updated_by = actor
    update_fields.append("updated_by")
    review.save(update_fields=update_fields)

    write_activity(
        review,
        actor=actor,
        verb="updated",
        field="status",
        old_value=old_status,
        new_value=new_status,
        comment=ADVANCE_VERB[old_status],
        extra={"result": review.result} if review.result else None,
    )
    return review


def rollback(review, *, actor):
    """退回上一步。只回一步，且不清结论 —— 退回多半是为了改结论再提一次。"""
    if review.status not in PREVIOUS_STATUS:
        raise StageReviewError(
            "未评审的评审没有上一步可退", code="STAGE_REVIEW_NO_PREVIOUS_STATUS"
        )

    old_status = review.status
    new_status = PREVIOUS_STATUS[old_status]
    update_fields = ["status", "updated_by"]

    # 退回到未评审 = 这一轮从没提交过结论，把结论一起抹掉，避免列表里出现
    # 「未评审 + 通过」这种读不懂的组合
    if new_status == StageReviewStatus.NOT_STARTED:
        review.result = ""
        review.conditional_reason = ""
        update_fields += ["result", "conditional_reason"]

    review.status = new_status
    review.updated_by = actor
    review.save(update_fields=update_fields)

    write_activity(
        review,
        actor=actor,
        verb="updated",
        field="status",
        old_value=old_status,
        new_value=new_status,
        comment="退回",
    )
    return review


# --- 负责人解析 -----------------------------------------------------------


#: 候选人是从哪一层找出来的。前端按它决定要不要提示「这不是产品配的人」
ROLE_SOURCE_PRODUCT = "product"
ROLE_SOURCE_WORKSPACE = "workspace"
ROLE_SOURCE_PROJECT = "project"


def _active_users(user_ids):
    return User.objects.filter(id__in=list(user_ids), is_active=True).order_by("display_name")


def _workspace_role_holders(workspace_id, role_name):
    """工作区里担任某个角色的人：直接绑定的 + 通过用户组绑定的。

    两条路都要查 —— 权限体系本身就允许把角色挂在用户组上（``WorkspaceGroupRole``），
    只看直接绑定会出现「明明在组里配了，这里却选不出人」。
    """
    role_ids = list(
        WorkspaceRole.objects.filter(
            workspace_id=workspace_id,
            name=role_name,
            type=WorkspaceRole.RoleType.WORKSPACE,
        ).values_list("id", flat=True)
    )
    if not role_ids:
        return set()

    direct = WorkspaceMemberRole.objects.filter(
        workspace_id=workspace_id, role_id__in=role_ids, member__is_active=True
    ).values_list("member__member_id", flat=True)

    group_ids = WorkspaceGroupRole.objects.filter(role_id__in=role_ids).values_list(
        "group_id", flat=True
    )
    via_group = WorkspaceGroupMember.objects.filter(
        group_id__in=list(group_ids), member__is_active=True
    ).values_list("member__member_id", flat=True)

    return {uid for uid in [*direct, *via_group] if uid}


def resolve_role_candidates(review, role):
    """按角色名筛出这条评审的候选人，**三级回退**：

    1. **产品**下担任这个角色的人（``ProductMember`` × ``ProductRole.name``）——
       角色名是模板快照（发起者 / 主导者 / 审核者那三列），这是设计上的正路。
    2. **工作区**里担任这个角色的人（``WorkspaceRole`` type=workspace，直接绑定或
       通过用户组绑定）—— 像「DQA」「NPI主管」这种全公司就那几个人的岗位，配在工作区
       一次比每个产品配一遍现实。
    3. 都找不到就回落到**该项目的全部成员**：角色没配好不该让人选不出负责人。

    ``role`` 取 ``leader`` / ``auditor``。返回 ``(users, source)``，``source`` 是上面
    三档之一，前端据此决定提示哪一句。
    """
    role_name = (getattr(review, f"{role}_role", "") or "").strip()
    if role_name:
        product_user_ids = ProductMember.objects.filter(
            product_id=review.product_id,
            custom_roles__name=role_name,
            member__isnull=False,
        ).values_list("member_id", flat=True)
        users = _active_users(product_user_ids)
        if users.exists():
            return users, ROLE_SOURCE_PRODUCT

        workspace_user_ids = _workspace_role_holders(review.workspace_id, role_name)
        if workspace_user_ids:
            users = _active_users(workspace_user_ids)
            if users.exists():
                return users, ROLE_SOURCE_WORKSPACE

    project_user_ids = ProjectMember.objects.filter(
        project_id=review.project_id, is_active=True
    ).values_list("member_id", flat=True)
    return _active_users(project_user_ids), ROLE_SOURCE_PROJECT


# --- 手工新建 -------------------------------------------------------------


def create_manual_review(*, project, product, stage, actor, data):
    """手工补一条评审。``template`` 恒为空，**不回写任何裁剪格子**。

    它属于流程之外的补充：下次修订裁剪表既不会认领它，也不会把它删掉。父节点必须
    是同项目同产品的评审，层级与 kind 的合法性交给模型 ``clean()``。
    """
    parent = None
    parent_id = data.get("parent_id")
    if parent_id:
        parent = StageReview.objects.filter(
            pk=parent_id, project_id=project.id, product_id=product.id
        ).first()
        if parent is None:
            raise StageReviewError(
                "所属评审不存在或不属于同一个产品",
                code="STAGE_REVIEW_PARENT_INVALID",
            )

    review = StageReview(
        workspace_id=project.workspace_id,
        project=project,
        product=product,
        stage=parent.stage if parent else stage,
        kind=data["kind"],
        parent=parent,
        title=data["title"],
        description_html=data.get("description_html") or "",
        work_instruction=data.get("work_instruction") or "",
        leader_id=data.get("leader_id"),
        auditor_id=data.get("auditor_id"),
        start_date=data.get("start_date"),
        end_date=data.get("end_date"),
        status=StageReviewStatus.NOT_STARTED,
        created_by=actor,
        updated_by=actor,
    )
    _validated(review)
    review.save()
    write_activity(review, actor=actor, verb="created", comment="手工新建评审")
    return review


def update_review(review, *, actor, validated_data):
    """详情页里改字段。状态与结论不在这里改 —— 那两列只能由动作推进。"""
    changed = []
    for field, value in validated_data.items():
        if getattr(review, field) != value:
            setattr(review, field, value)
            changed.append(field)
    if not changed:
        return review

    review.updated_by = actor
    _validated(review)
    review.save(update_fields=[*changed, "updated_by"])
    for field in changed:
        write_activity(
            review, actor=actor, verb="updated", field=field, new_value=getattr(review, field)
        )
    return review


def delete_review(review):
    """删一条手工评审（连同它下面的活动）。裁剪生成的那些只能靠裁剪表修订删掉。

    软删的级联是 Celery 任务且把 PROTECT 当 CASCADE（见 ``db/mixins.py``），投递还
    发生在事务提交之前 —— 所以子评审、活动、评论、附件一律在这里同步删干净，口径同
    ``utils/review_tailoring.py::_delete_stage_reviews``。
    """
    if review.template_id is not None:
        raise StageReviewError(
            "裁剪生成的评审要在裁剪表里取消勾选后删除",
            code="STAGE_REVIEW_FROM_TAILORING_UNDELETABLE",
        )

    all_ids = list(
        StageReview.objects.filter(Q(id=review.id) | Q(parent_id=review.id))
        .order_by("id")
        .values_list("id", flat=True)
    )
    StageReviewActivity.objects.filter(stage_review_id__in=all_ids).delete()
    StageReviewComment.objects.filter(stage_review_id__in=all_ids).delete()
    FileAsset.objects.filter(
        Q(stage_review_id__in=all_ids)
        | Q(stage_review_comment__stage_review_id__in=all_ids)
    ).delete()
    StageReview.objects.filter(id__in=all_ids).delete()
