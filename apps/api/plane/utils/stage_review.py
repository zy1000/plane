"""阶段评审实例的领域编排：状态推进、结论落地、负责人解析。

裁剪表签批生效时生成的那批 ``StageReview``（见 ``utils/review_tailoring.py``），
以及手工补建的评审，都在这里走同一套规则。三条贯穿全文的约定：

1. **状态只能顺着走。** ``未评审 → 评审中 → 审核中 → 已评审`` 每一步都是一个显式
   动作，没有「直接改状态」的写入口 —— 前端也就没有状态下拉框。唯一由结论决定落点
   的是「提交审核」：**不通过留在评审中**（整改后再提），其余结论（通过 / 免审 /
   条件通过）一律进审核中 —— 免审免的是评审本身，不是审核。退回只回一步。**已评审是终态**：不能退回，
   内容字段与附件也不能再改（评论仍开放）；点错了只能去裁剪表取消勾选、签批生效删掉
   后重新生成。这样「谁在什么时候把它推到哪一步」在 ``StageReviewActivity`` 里是一条
   连续的线。**每一步由这一步的主人推进和退回**（``_assert_step_owner``）：未评审 / 评审中
   归负责人，审核中归审核者；主人没指定就不能动，也不允许任何人代推 —— 管理权限只决定
   能不能改字段（包括指定负责人 / 审核者），不决定能不能替人签字。提交审核前还必须已经
   指定审核者，否则会停在一个没人能推的审核中。「开始评审」与「审核通过」会顺手把
   空着的开始日期 / 结束日期补成当天（已填的不动），见 ``_auto_fill_date``。
2. **结论在提交审核那一刻定稿。** ``result`` 不是随便改的字段：它只在 ``advance()``
   里写入，除通过外的结论都必须带结论说明，O 阶段的两种类型必须同时给生产方式与出货
   评估。校验集中在 ``_validate_result``，模型的 ``clean()`` 只做兜底。
3. **评审与评审活动一视同仁。** 两者是同一张表的两行，父评审**不汇总**子活动的结论
   （产品决策）—— 所以这里没有任何「子活动没评完就不许提交父评审」的联动，各推各的。

负责人解析（``resolve_role_candidates``）是模板落地到具体产品的那一跳：模板上存的是
角色名称文本（发起者 / 主导者 / 审核者），这里按「该产品下担任这个角色的人」筛，
筛不出来就退回到全部项目成员 —— 角色没配好不该让人选不出负责人。
"""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

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
from plane.db.models.stage_review import ACTIVITY_KINDS, O_STAGE_KINDS


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

#: 「提交审核」这一跳由结论决定落点：不通过留在原地整改，其余一律进审核中
SUBMIT_TARGET = {
    StageReviewResult.REJECTED: StageReviewStatus.IN_REVIEW,
}
REJECT_VERB = "评审不通过"
ROLLBACK_VERB = "退回"

#: 必须带结论说明的结论：不通过要写整改什么，免审要写为什么免，条件通过要写放行条件。
#: 只有「通过」可以不写。
REASON_REQUIRED_RESULTS = (
    StageReviewResult.REJECTED,
    StageReviewResult.WAIVED,
    StageReviewResult.CONDITIONAL,
)


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
    old_identifier=None,
    new_identifier=None,
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
        old_identifier=old_identifier,
        new_identifier=new_identifier,
        stage_review_comment=review_comment,
    )


#: 每个状态由谁推进 / 退回。已评审是终态，不在表里（由 ALREADY_COMPLETED / LOCKED 挡）
STEP_OWNER_FIELD = {
    StageReviewStatus.NOT_STARTED: "leader",
    StageReviewStatus.IN_REVIEW: "leader",
    StageReviewStatus.IN_APPROVAL: "auditor",
}

#: 主人字段 → (没指定的错误码, 不是本人的错误码)
_OWNER_ERRORS = {
    "leader": ("STAGE_REVIEW_LEADER_REQUIRED", "STAGE_REVIEW_NOT_LEADER"),
    "auditor": ("STAGE_REVIEW_AUDITOR_REQUIRED", "STAGE_REVIEW_NOT_AUDITOR"),
}

_OWNER_MESSAGES = {
    "STAGE_REVIEW_LEADER_REQUIRED": "请先指定负责人",
    "STAGE_REVIEW_AUDITOR_REQUIRED": "请先指定审核者",
    "STAGE_REVIEW_NOT_LEADER": "只有负责人能推进或退回这一步",
    "STAGE_REVIEW_NOT_AUDITOR": "只有审核者能审核或退回这一步",
}


def _assert_owner(review, actor, field):
    """``field`` 上的人必须已指定，且就是 ``actor`` 本人。口径同裁剪表签批：只认身份，不认权限。"""
    required_code, not_owner_code = _OWNER_ERRORS[field]
    owner_id = getattr(review, f"{field}_id")
    if owner_id is None:
        raise StageReviewError(
            _OWNER_MESSAGES[required_code], code=required_code, detail={"field": field}
        )
    if owner_id != actor.id:
        owner = getattr(review, field)
        raise StageReviewError(
            _OWNER_MESSAGES[not_owner_code],
            code=not_owner_code,
            detail={"field": field, "owner": owner.display_name if owner else ""},
        )


def _assert_step_owner(review, actor):
    """当前这一步的主人才能推进或退回（见 ``STEP_OWNER_FIELD``）。"""
    field = STEP_OWNER_FIELD.get(review.status)
    if field:
        _assert_owner(review, actor, field)


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

    # 字段名沿用 conditional_reason，语义已是「结论说明」：条件通过与不通过共用
    reason = (payload.get("conditional_reason") or "").strip()
    if result in REASON_REQUIRED_RESULTS and not reason:
        raise StageReviewError(
            "不通过 / 免审 / 条件通过必须填写结论说明",
            code="STAGE_REVIEW_CONDITIONAL_REASON_REQUIRED",
            detail={"field": "conditional_reason"},
        )
    # 通过也可以带说明，直接存提交上来的内容
    fields = {"result": result, "conditional_reason": reason}

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


def _auto_fill_date(review, field, today):
    """``field`` 为空才补成 ``today``，返回补上的值；已填的不动，返回 ``None``。

    补的值不能违反模型「结束日期不能早于开始日期」的约束（``advance`` 不跑 ``full_clean``）：
    开始日期不晚于已填的结束日期，结束日期不早于已填的开始日期。
    """
    if getattr(review, field) is not None:
        return None
    value = today
    if field == "start_date" and review.end_date and review.end_date < value:
        value = review.end_date
    if field == "end_date" and review.start_date and review.start_date > value:
        value = review.start_date
    setattr(review, field, value)
    return value


def advance(review, *, actor, payload=None):
    """把评审往前推。调用方负责事务与行锁。

    「提交审核」（评审中那一跳）顺带把结论写进去 —— 结论与「提交」是同一个动作的两
    面，分成两个接口会出现「提交了但没结论」的中间态。落点由结论决定（``SUBMIT_TARGET``）：
    不通过**不推进**，只记下结论与说明；其余结论都进审核中。

    「审核通过」（审核中那一跳）可以带一段**审核意见**（选填）。它与退回理由同口径，
    是事件属性：只进这条轨迹的 ``extra.approval_comment``，不占评审字段。

    「开始评审」补空的开始日期、「审核通过」补空的结束日期，都取操作人时区的当天
    （``BaseViewSet`` 已按用户时区 activate），各记一条与手工修改同形的日期轨迹。
    """
    if review.status not in NEXT_STATUS:
        raise StageReviewError(
            "已评审的评审不能再往前推进", code="STAGE_REVIEW_ALREADY_COMPLETED"
        )

    _assert_step_owner(review, actor)
    if review.status == StageReviewStatus.IN_REVIEW and review.auditor_id is None:
        # 不区分结论统一要求：否则通过后会停在一个没人能推的审核中
        raise StageReviewError(
            _OWNER_MESSAGES["STAGE_REVIEW_AUDITOR_REQUIRED"],
            code="STAGE_REVIEW_AUDITOR_REQUIRED",
            detail={"field": "auditor"},
        )

    old_status = review.status
    new_status = NEXT_STATUS[old_status]
    previous_result = review.result
    update_fields = ["updated_by"]

    if old_status == StageReviewStatus.IN_REVIEW:
        for field, value in _validate_result(review, payload or {}).items():
            setattr(review, field, value)
            update_fields.append(field)
        new_status = SUBMIT_TARGET.get(review.result, StageReviewStatus.IN_APPROVAL)

    review.updated_by = actor

    if new_status == old_status:
        # 不通过：状态原地不动。轨迹记成一条「结论」事件而不是 status → status，
        # 前端进度条只按 status 记录算日期，不会被它干扰
        review.save(update_fields=update_fields)
        write_activity(
            review,
            actor=actor,
            verb="updated",
            field="result",
            old_value=previous_result or None,
            new_value=review.result,
            comment=REJECT_VERB,
            extra={"status": old_status, "conditional_reason": review.conditional_reason},
        )
        return review

    today = timezone.localdate()
    filled_dates = []
    if old_status == StageReviewStatus.NOT_STARTED:
        filled_dates.append(("start_date", _auto_fill_date(review, "start_date", today)))
    if new_status == StageReviewStatus.COMPLETED:
        filled_dates.append(("end_date", _auto_fill_date(review, "end_date", today)))
    filled_dates = [(field, value) for field, value in filled_dates if value is not None]
    update_fields += [field for field, _ in filled_dates]

    review.status = new_status
    review.save(update_fields=[*update_fields, "status"])

    # 结论说明随「提交审核」这次事件一起记下：之后退回重提会覆盖评审上的字段，
    # 活动时间线要能看到每一次提交当时写的是什么
    extra = (
        {"result": review.result, "conditional_reason": review.conditional_reason}
        if review.result
        else {}
    )
    if old_status == StageReviewStatus.IN_APPROVAL:
        approval_comment = ((payload or {}).get("approval_comment") or "").strip()
        if approval_comment:
            extra["approval_comment"] = approval_comment

    write_activity(
        review,
        actor=actor,
        verb="updated",
        field="status",
        old_value=old_status,
        new_value=new_status,
        comment=ADVANCE_VERB[old_status],
        extra=extra or None,
    )
    for field, value in filled_dates:
        write_activity(
            review,
            actor=actor,
            verb="updated",
            field=field,
            new_value=_activity_value(field, value),
        )
    return review


def assert_not_locked(review):
    """已评审即定稿：内容、附件、状态都不能再动。评论不走这里。"""
    if review.status == StageReviewStatus.COMPLETED:
        raise StageReviewError(
            "已评审的评审已定稿，不能再修改或退回", code="STAGE_REVIEW_LOCKED"
        )


def rollback(review, *, actor, reason=""):
    """退回上一步，**必须写明理由**。只回一步，且不清结论 —— 退回多半是为了改结论再提一次。

    理由是**事件属性**：同一条评审可以被退回多次，每次原因不一样，所以它落在轨迹那条记录的
    ``extra`` 里单独一项，既不占评审的字段，也不与结论说明（``conditional_reason``）共用 ——
    那一项说的是「这次评审的结论为什么是它」，跟「为什么退回去重来」不是一回事。

    已评审不能退回（``assert_not_locked``），所以只剩审核中 → 评审中、评审中 → 未评审。
    """
    assert_not_locked(review)
    if review.status not in PREVIOUS_STATUS:
        raise StageReviewError(
            "未评审的评审没有上一步可退", code="STAGE_REVIEW_NO_PREVIOUS_STATUS"
        )
    _assert_step_owner(review, actor)

    reason = (reason or "").strip()
    if not reason:
        raise StageReviewError(
            "退回必须填写理由",
            code="STAGE_REVIEW_ROLLBACK_REASON_REQUIRED",
            detail={"field": "reason"},
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
        comment=ROLLBACK_VERB,
        extra={"rollback_reason": reason},
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


#: 成员字段：轨迹里值存显示名、identifier 存用户 id，前端据此出「从 A 改为 B」
_MEMBER_FIELDS = ("leader", "auditor")
#: 长文本字段只记「改了」，不把整段 HTML / 原文塞进轨迹 —— 时间线也只写「更新了描述」
_TEXT_ONLY_FIELDS = ("description_html", "work_instruction")


def _activity_value(field, value):
    """把字段值翻成轨迹里给人读的那一份。"""
    if value is None or field in _TEXT_ONLY_FIELDS:
        return None
    if field in _MEMBER_FIELDS:
        return value.display_name
    if field in ("start_date", "end_date"):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return "、".join(str(item) for item in value)
    return str(value)


def _activity_identifier(field, value):
    return value.id if field in _MEMBER_FIELDS and value is not None else None


def update_review(review, *, actor, validated_data):
    """详情页里改字段。状态与结论不在这里改 —— 那两列只能由动作推进。

    每个改动的字段写一条轨迹，**旧值与新值都记**：时间线要写成「把负责人从 A 改为 B」。

    ``stage``（视图已解析成项目模式里的 ``DevModeStage``）只有手工评审能改，走
    ``move_review_stage``；裁剪表生成的评审，阶段由裁剪表决定，要挪请走裁剪表修订。
    """
    assert_not_locked(review)
    validated_data = dict(validated_data)
    stage = validated_data.pop("stage", None)
    if stage is not None and stage.id != review.stage_id:
        if review.template_id is not None:
            raise StageReviewError(
                "阶段由裁剪表决定，请到裁剪表发起修订",
                code="STAGE_REVIEW_STAGE_BY_TAILORING",
            )
        move_review_stage(review, stage=stage, actor=actor)
    changed = []
    for field, value in validated_data.items():
        old = getattr(review, field)
        if old != value:
            setattr(review, field, value)
            changed.append((field, old, value))
    if not changed:
        return review

    review.updated_by = actor
    _validated(review)
    review.save(update_fields=[*(field for field, _, _ in changed), "updated_by"])
    for field, old, new in changed:
        write_activity(
            review,
            actor=actor,
            verb="updated",
            field=field,
            old_value=_activity_value(field, old),
            new_value=_activity_value(field, new),
            old_identifier=_activity_identifier(field, old),
            new_identifier=_activity_identifier(field, new),
        )
    return review


def move_review_stage(review, *, stage, actor, extra=None):
    """把一条评审活动挪到本项目模式的另一个阶段（批次 5）。

    挪过去就**脱离父评审**，直接挂在目标阶段下；评审 id、轨迹、评论、附件都不变。两个入口
    共用这里：手工评审在抽屉里改阶段（``update_review``）、裁剪表修订签批生效
    （``review_tailoring._apply_effective``）。调用方负责确认 ``stage`` 属于项目模式。

    - 只有评审活动能挪，汇总评审挪了会把它下面的活动留在原阶段，父子口径就乱了。
    - 已评审即定稿，不能挪。
    - 不跑「O 类只能在 O 阶段」那条校验：目标阶段不限类型。

    **必须先置空 parent 再改 stage**：``StageReview.save()`` 有父时会把阶段抄回父评审的。
    """
    if review.kind not in ACTIVITY_KINDS:
        raise StageReviewError(
            "只有评审活动能移动阶段", code="STAGE_REVIEW_ONLY_ACTIVITY_CAN_MOVE"
        )
    assert_not_locked(review)
    old_stage = review.stage
    if old_stage is not None and old_stage.id == stage.id:
        return review
    review.parent = None
    review.stage = stage
    review.updated_by = actor
    review.save(update_fields=["parent", "stage", "updated_at", "updated_by"])
    write_activity(
        review,
        actor=actor,
        verb="updated",
        field="stage",
        old_value=old_stage.name if old_stage is not None else None,
        new_value=stage.name,
        old_identifier=old_stage.id if old_stage is not None else None,
        new_identifier=stage.id,
        extra=extra,
    )
    return review


def bulk_update_reviews(reviews, *, actor, changes):
    """列表勾选后批量改属性：逐条走 ``update_review``，规则与活动记录和单条完全一致。

    **部分成功**：已评审的跳过（终态全锁，前端也不让勾）；某条因为自己的旧日期和新值冲突
    （比如新开始日期晚于它已有的结束日期）被模型校验挡下时，只回滚这一条（保存点），其余照改。
    调用方负责外层事务。

    返回 ``(updated, skipped_locked, failed)``：改到的评审对象、跳过的 id、失败明细。
    """
    updated, skipped_locked, failed = [], [], []
    for review in reviews:
        if review.status == StageReviewStatus.COMPLETED:
            skipped_locked.append(str(review.id))
            continue
        try:
            with transaction.atomic():
                update_review(review, actor=actor, validated_data=dict(changes))
        except StageReviewError as exc:
            failed.append(
                {
                    "id": str(review.id),
                    "title": review.title,
                    "code": exc.code,
                    "error": exc.message,
                }
            )
            continue
        updated.append(review)
    return updated, skipped_locked, failed


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
