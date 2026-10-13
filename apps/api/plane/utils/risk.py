"""风险的业务规则：编号分配、等级计算、增改、关联缺陷、变更历史。

视图只负责鉴权和取对象，规则全在这里，口径同 ``utils/stage_review.py``。
"""

import hashlib
import re
from zoneinfo import ZoneInfo

from django.db import connection, transaction
from django.db.models import Max
from django.utils import timezone

from plane.db.models import Issue, Risk, RiskActivity, RiskIssue, RiskLevel
from plane.utils.html_processor import strip_tags

BEIJING_TZ = ZoneInfo("Asia/Shanghai")
CODE_PREFIX = "PRS"
#: 判定「缺陷」看工作项类型的类别名，口径同 ``views/issue/base.py`` 的缺陷页
DEFECT_CATEGORY_NAME = "缺陷"

#: 影响程度 × 发生概率 → 等级。三段阈值由用户拍板（2026-10-12）
RISK_LEVEL_HIGH_MIN = 12
RISK_LEVEL_LOW_MAX = 5


class RiskError(Exception):
    def __init__(self, message, *, code, detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail or {}


# --- 等级 -------------------------------------------------------------------


def compute_risk_level(impact_level, probability):
    """推算规则**只写在这里**。前端 ``computeRiskLevel`` 是它的镜像（表单即时推算、判断是否手动调整）。"""
    score = int(impact_level) * int(probability)
    if score >= RISK_LEVEL_HIGH_MIN:
        return RiskLevel.HIGH
    if score <= RISK_LEVEL_LOW_MAX:
        return RiskLevel.LOW
    return RiskLevel.MEDIUM


# --- 编号 -------------------------------------------------------------------


def _code_period(now=None):
    """编号里的年月按**北京时间**取：settings 的 TIME_ZONE 是 UTC，按 UTC 算的话每月 1 号
    0–8 点建的单会被编到上个月。"""
    current = now or timezone.now()
    if timezone.is_naive(current):
        current = timezone.make_aware(current)
    return current.astimezone(BEIJING_TZ).strftime("%y%m")


def _lock_key(workspace_id, period):
    digest = hashlib.sha256(f"risk:{workspace_id}:{period}".encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def allocate_risk_code(workspace_id, now=None):
    """``PRS`` + YYMM + 当月流水号，工作区内按月重置。

    必须在 ``transaction.atomic()`` 里调用：先拿 (workspace, 年月) 粒度的 advisory 锁，
    再在 ``all_objects``（含软删，删掉的号不复用）里按**整数**取当月最大流水号 + 1。
    三位起步，超过 999 自然变四位；唯一约束 ``risk_unique_workspace_code`` 兜底。
    """
    period = _code_period(now)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [_lock_key(workspace_id, period)])
    return _next_code(workspace_id, period)


def _next_code(workspace_id, period):
    prefix = f"{CODE_PREFIX}{period}"
    pattern = re.compile(rf"^{prefix}(\d+)$")
    largest = 0
    for code in Risk.all_objects.filter(
        workspace_id=workspace_id, code__startswith=prefix
    ).values_list("code", flat=True):
        matched = pattern.match(code)
        if matched:
            largest = max(largest, int(matched.group(1)))
    return f"{prefix}{largest + 1:03d}"


def preview_risk_code(workspace_id, now=None):
    """新建弹窗里展示的「预计编号」：不加锁、不占号。同一时刻有人先建了，保存时拿到的会顺延。"""
    return _next_code(workspace_id, _code_period(now))


# --- 变更历史 ---------------------------------------------------------------


def write_activity(
    risk,
    *,
    actor,
    verb,
    field=None,
    old_value=None,
    new_value=None,
    comment="",
    extra=None,
    risk_comment=None,
    old_identifier=None,
    new_identifier=None,
):
    """同步写一条变更历史，与产生它的动作在同一个事务里。``created_by`` 显式给。"""
    return RiskActivity.objects.create(
        workspace_id=risk.workspace_id,
        project_id=risk.project_id,
        risk=risk,
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
        risk_comment=risk_comment,
    )


#: 普通字段：记旧值 → 新值
PLAIN_FIELDS = (
    "name",
    "status",
    "category",
    "impact_level",
    "probability",
    "risk_loss",
    "trigger_factors",
    "strategy",
    "is_in_risk_production",
    "proposed_date",
    "planned_handle_date",
    "actual_close_date",
)
#: 人员单选：记 id，前端按 id 翻成人名
MEMBER_FIELDS = ("proposer", "owner")
#: 富文本：只记「改了」，不存两份正文
HTML_FIELDS = ("description_html", "impact_description_html", "response_measures_html")


def _user_ids(users):
    return [str(user.id) for user in users]


# --- 增改 -------------------------------------------------------------------


def create_risk(project, actor, data):
    """``data`` 是 serializer 校验后的 validated_data（含 ``stakeholders`` 的 User 列表）。"""
    stakeholders = data.pop("stakeholders", [])
    with transaction.atomic():
        risk = Risk(project=project, **data)
        risk.code = allocate_risk_code(project.workspace_id)
        # 没手动指定等级就按影响程度 × 发生概率推算
        if not risk.risk_level:
            risk.risk_level = compute_risk_level(risk.impact_level, risk.probability)
        risk.save()
        if stakeholders:
            risk.stakeholders.set(stakeholders)
        write_activity(risk, actor=actor, verb="created", field=None)
    return risk


def update_risk(risk, actor, data):
    """部分更新。等级：请求里带了 ``risk_level`` 就以它为准（手动调整，不动影响程度 / 发生概率）；
    没带而影响程度 / 发生概率变了，就重新推算（覆盖之前的手动值）。等级变了单独记一条历史。

    事务里先 ``select_for_update`` 重读：视图取对象在事务外，两个自动保存并发时各自拿着
    旧快照整条 ``save()`` 会互相覆盖。改动只按 ``update_fields`` 写回，没动的列不碰。
    """
    stakeholders = data.pop("stakeholders", None)
    with transaction.atomic():
        risk = Risk.objects.select_for_update().get(pk=risk.pk)
        changes = []
        for field in PLAIN_FIELDS:
            if field not in data:
                continue
            old = getattr(risk, field)
            new = data[field]
            if old != new:
                setattr(risk, field, new)
                changes.append((field, old, new))
        for field in MEMBER_FIELDS:
            if field not in data:
                continue
            old = getattr(risk, f"{field}_id")
            new_user = data[field]
            new = new_user.id if new_user else None
            if old != new:
                setattr(risk, field, new_user)
                changes.append((field, old, new))
        for field in HTML_FIELDS:
            if field not in data:
                continue
            old = getattr(risk, field) or ""
            new = data[field] or ""
            if old != new:
                setattr(risk, field, new)
                changes.append((field, None, None))

        # serializer 校验的是请求进来时的快照，两条并发 PATCH 各改一头日期也能各自通过；
        # 合并后的行在锁里再核一次
        if (
            risk.proposed_date
            and risk.actual_close_date
            and risk.actual_close_date < risk.proposed_date
        ):
            raise RiskError(
                "实际关闭日期不能早于提出时间",
                code="RISK_CLOSE_BEFORE_PROPOSED",
                detail={"field": "actual_close_date"},
            )

        old_level = risk.risk_level
        computed_level = compute_risk_level(risk.impact_level, risk.probability)
        assessment_changed = any(field in ("impact_level", "probability") for field, _, _ in changes)
        if "risk_level" in data:
            new_level = data["risk_level"]
            # 编辑弹窗整份提交也带着等级：跟着影响程度 / 发生概率一起变、且正好等于推算值的，算推算
            auto_level = assessment_changed and new_level == computed_level
        elif assessment_changed:
            new_level = computed_level
            auto_level = True
        else:
            new_level = old_level
            auto_level = False
        if new_level != old_level:
            risk.risk_level = new_level

        saved = False
        if changes or new_level != old_level:
            dirty = [field for field, _, _ in changes]
            if new_level != old_level:
                dirty.append("risk_level")
            risk.save(update_fields=[*dirty, "updated_at", "updated_by"])
            saved = True
        for field, old, new in changes:
            write_activity(
                risk, actor=actor, verb="updated", field=field, old_value=old, new_value=new
            )
        if new_level != old_level:
            write_activity(
                risk,
                actor=actor,
                verb="updated",
                field="risk_level",
                old_value=old_level,
                new_value=new_level,
                extra={"auto": True} if auto_level else {},
            )

        if stakeholders is not None:
            before = set(risk.stakeholders.values_list("id", flat=True))
            after = {user.id for user in stakeholders}
            if before != after:
                risk.stakeholders.set(stakeholders)
                # 只改了干系人也要推进 updated_at：前端靠它拒掉迟到的旧响应
                if not saved:
                    risk.save(update_fields=["updated_at", "updated_by"])
                for user_id in after - before:
                    write_activity(
                        risk,
                        actor=actor,
                        verb="added",
                        field="stakeholders",
                        new_value=str(user_id),
                        new_identifier=user_id,
                    )
                for user_id in before - after:
                    write_activity(
                        risk,
                        actor=actor,
                        verb="removed",
                        field="stakeholders",
                        old_value=str(user_id),
                        old_identifier=user_id,
                    )
    return risk


# --- 关联缺陷 ---------------------------------------------------------------


def defect_issue_queryset(project_id):
    """本项目里类别为「缺陷」的工作项。

    用 ``Issue.objects`` 而不是 ``issue_objects``：后者把归档的也排掉了，归档不是撤销，
    已关联的缺陷归档后仍要读得到（口径同需求 ↔ 工作项）。草稿不算。
    """
    return Issue.objects.filter(
        project_id=project_id, type__category__name=DEFECT_CATEGORY_NAME
    ).exclude(is_draft=True)


def active_risk_issues(**filters):
    """两头都没软删的关联行。软删级联是异步的，读的时候自己过滤。"""
    return RiskIssue.objects.filter(
        issue__deleted_at__isnull=True, risk__deleted_at__isnull=True, **filters
    )


def _resolve_defects(project_id, issue_ids):
    wanted = {str(issue_id) for issue_id in issue_ids}
    found = {
        str(pk): pk
        for pk in defect_issue_queryset(project_id)
        .filter(id__in=wanted)
        .values_list("id", flat=True)
    }
    missing = sorted(wanted - set(found))
    if missing:
        raise RiskError(
            "只能关联本项目中类别为「缺陷」的工作项",
            code="RISK_ISSUE_NOT_DEFECT",
            detail={"issue_ids": missing},
        )
    return list(found.values())


def link_issues(risk, actor, issue_ids):
    """给一条风险挂若干缺陷。全有或全无；已挂的静默跳过。返回新挂上的 issue id 列表。"""
    pks = _resolve_defects(risk.project_id, issue_ids)
    with transaction.atomic():
        existing = set(
            active_risk_issues(risk=risk, issue_id__in=pks).values_list("issue_id", flat=True)
        )
        fresh = [pk for pk in pks if pk not in existing]
        # bulk_create 不走 save()，workspace_id 要自己填
        RiskIssue.objects.bulk_create(
            [
                RiskIssue(
                    risk=risk,
                    issue_id=pk,
                    project_id=risk.project_id,
                    workspace_id=risk.workspace_id,
                    created_by=actor,
                    updated_by=actor,
                )
                for pk in fresh
            ],
            ignore_conflicts=True,
        )
        for pk in fresh:
            write_activity(
                risk, actor=actor, verb="added", field="issues", new_identifier=pk
            )
    return fresh


def link_risks_to_issue(issue, actor, risk_ids):
    """反向：给一条缺陷挂若干风险。风险必须与缺陷同项目。"""
    if not defect_issue_queryset(issue.project_id).filter(id=issue.id).exists():
        raise RiskError(
            "只有类别为「缺陷」的工作项能关联风险", code="RISK_ISSUE_NOT_DEFECT"
        )
    wanted = {str(risk_id) for risk_id in risk_ids}
    risks = {str(r.id): r for r in Risk.objects.filter(project_id=issue.project_id, id__in=wanted)}
    missing = sorted(wanted - set(risks))
    if missing:
        raise RiskError(
            "风险不存在或不属于本项目", code="RISK_NOT_FOUND", detail={"risk_ids": missing}
        )
    with transaction.atomic():
        existing = set(
            active_risk_issues(issue=issue, risk_id__in=list(risks)).values_list(
                "risk_id", flat=True
            )
        )
        fresh = [r for key, r in risks.items() if r.id not in existing]
        RiskIssue.objects.bulk_create(
            [
                RiskIssue(
                    risk=r,
                    issue=issue,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                    created_by=actor,
                    updated_by=actor,
                )
                for r in fresh
            ],
            ignore_conflicts=True,
        )
        for r in fresh:
            write_activity(r, actor=actor, verb="added", field="issues", new_identifier=issue.id)
    return [r.id for r in fresh]


def unlink_issue(risk, actor, issue_id):
    """解除一条关联。返回是否真的删了。"""
    with transaction.atomic():
        rows = list(active_risk_issues(risk=risk, issue_id=issue_id))
        if not rows:
            return False
        for row in rows:
            row.delete()
        write_activity(
            risk, actor=actor, verb="removed", field="issues", old_identifier=issue_id
        )
    return True


# --- 其它 -------------------------------------------------------------------


def html_is_blank(html):
    """描述必填：去掉标签后没字、也没有图片 / 附件类节点，才算空。"""
    if not html:
        return True
    if strip_tags(html).strip():
        return False
    return not re.search(r"<(img|image-component|video|file-component|mention)", html)
