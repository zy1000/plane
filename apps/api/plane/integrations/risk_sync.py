"""简道云「风险」表单 ↔ 本地风险，双向。

一条远端记录 = 一条本地风险，按远端 ``_id``（存 ``Risk.external_id``）认。规则（2026-10-19 ~ 10-20 拍板）：

- 编号用简道云的流水号：本地新建先存、编号为空，出站任务推成功后回填（``bind_created``）
- 入站（简道云「数据推送」→ ``apply_push``）：新建 / 修改按 ``_id`` upsert，删除 → 软删；
  改动记进变更历史、``extra.source = "jiandaoyun"``，改动人按工号对上就记成那个人
- 简道云的批量修改 / 批量删除 / 回收站恢复 / 导入**不发推送**（2026-10-20 实测恢复确实没推），这些只能靠对账补：
  对账见到「本地已删、删除已同步、远端还在」就当作在简道云恢复了，本地跟着恢复
- 人员按工号匹配本工作区活跃成员，对不上的本地留空，原值存 ``external_people``，出站时原样带回
- 影响 / 概率 / 等级可空；类别「进度--变更修改」归到「进度」；未知选项留空并报告
- 研发项目 lookup 对不上本地项目的记录跳过（等每日项目同步后由每日对账补上）
- 手动导入 = 每日对账（``sync_risks``）：以简道云为准覆盖本地；本地还没推成功的不覆盖、重新排队；
  本地有远端无只报告不删
- 防重复不靠远端字段：推送抢先到时按「同项目 + 同名 + 15 分钟内还在等编号」认领本地那条；
  出站新建超时重试前到远端按「同项目 + 同名 + 还没绑定任何本地风险」查一遍
- 实测（2026-10-20）：接口写入简道云**不会**触发它的数据推送（带 is_start_trigger 也不会），所以本地改动
  不会被推回来；推送抢先认领只是兜底

出站任务在 ``bgtasks/risk_sync_task.py``，何时投递在 ``utils/risk.py``。
"""

import logging
from collections import Counter
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from crum import impersonate
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from plane.db.models import (
    FileAsset,
    Project,
    Risk,
    RiskActivity,
    RiskCategory,
    RiskComment,
    RiskIssue,
    RiskLevel,
    RiskStatus,
    RiskStrategy,
    RiskSyncStatus,
)
from plane.utils.exception_logger import log_exception
from plane.utils.risk import compute_risk_level, create_risk, update_risk, write_activity

from . import project_sync
from .base import DIRECTION_PULL, IntegrationSpec
from .jiandaoyun import fetch_entry_rows
from .project_sync import BEIJING, DETAIL_LIMIT, _date, _members_by_employee_id, _person, _text

logger = logging.getLogger("plane")

EXTERNAL_SOURCE = "jiandaoyun_risk"
#: 写进变更历史 extra 的来源标记，前端据此显示「简道云」
ACTIVITY_EXTRA = {"source": "jiandaoyun"}

# 简道云表单的字段名（widget），按表单设计固定；label 见注释
FIELD_CODE = "_widget_1751003340540"  # 编号（流水号，只读）
FIELD_PROJECT = "_widget_1751003492603"  # 研发项目（关联研发项目表的 _id）
FIELD_PROJECT_CODE = "_widget_1751419003692"  # 项目代号（只写，接口写入不触发简道云的联动）
FIELD_PROJECT_NO = "_widget_1751419003693"  # 研发项目编号（只写）
FIELD_PROJECT_LEAD = "_widget_1751003492606"  # 研发项目负责人（只写）
FIELD_STATUS = "_widget_1751007303494"  # 状态
FIELD_CATEGORY = "_widget_1751003335003"  # 风险类别
FIELD_NAME = "_widget_1751003335001"  # 风险名称
FIELD_DESCRIPTION = "_widget_1751003335013"  # 风险描述
FIELD_PROPOSER = "_widget_1751003335005"  # 提出人
FIELD_PROPOSED_DATE = "_widget_1751003335006"  # 提出日期
FIELD_OWNER = "_widget_1751003492698"  # 责任人
FIELD_STAKEHOLDERS = "_widget_1751003335007"  # 相关干系人
FIELD_IMPACT = "_widget_1751003335010"  # 影响程度
FIELD_PROBABILITY = "_widget_1751003335011"  # 发生概率
FIELD_LEVEL = "_widget_1751003335012"  # 风险等级
FIELD_IMPACT_DESCRIPTION = "_widget_1751003335014"  # 影响描述
FIELD_RESPONSE_MEASURES = "_widget_1751003335015"  # 应对措施
FIELD_RISK_LOSS = "_widget_1789693569420"  # 风险损失
FIELD_TRIGGER_FACTORS = "_widget_1751003335008"  # 触发因素
FIELD_STRATEGY = "_widget_1751003335009"  # 风险管理策略
FIELD_IN_PRODUCTION = "_widget_1751003335004"  # 是否列入风险生产/送样
FIELD_PLANNED_DATE = "_widget_1751008076410"  # 计划处理日期
FIELD_CLOSE_DATE = "_widget_1751008076418"  # 实际关闭日期
# 开发编号（_widget_1789870373274）与附件（_widget_1764655658618）不同步
# data/list 不会自动带系统字段，要的得写进 fields
SYSTEM_FIELDS = ("createTime", "updateTime", "creator", "updater")
REMOTE_FIELDS = (
    FIELD_CODE,
    FIELD_PROJECT,
    FIELD_STATUS,
    FIELD_CATEGORY,
    FIELD_NAME,
    FIELD_DESCRIPTION,
    FIELD_PROPOSER,
    FIELD_PROPOSED_DATE,
    FIELD_OWNER,
    FIELD_STAKEHOLDERS,
    FIELD_IMPACT,
    FIELD_PROBABILITY,
    FIELD_LEVEL,
    FIELD_IMPACT_DESCRIPTION,
    FIELD_RESPONSE_MEASURES,
    FIELD_RISK_LOSS,
    FIELD_TRIGGER_FACTORS,
    FIELD_STRATEGY,
    FIELD_IN_PRODUCTION,
    FIELD_PLANNED_DATE,
    FIELD_CLOSE_DATE,
    *SYSTEM_FIELDS,
)

REQUIRED_SETTINGS = (
    "JIANDAOYUN_API_BASE_URL",
    "JIANDAOYUN_API_TOKEN",
    "JIANDAOYUN_APP_KEY",
    "JIANDAOYUN_RISK_APP_ID",
    "JIANDAOYUN_RISK_ENTRY_ID",
)
# 三个写接口都配了才往简道云推；没配 = 只读导入
WRITE_SETTINGS = (
    "JIANDAOYUN_API_CREATE_BASE_URL",
    "JIANDAOYUN_API_UPDATE_BASE_URL",
    "JIANDAOYUN_API_DELETE_BASE_URL",
)


def _by_label(choices):
    return {label: value for value, label in choices}


# 简道云下拉框存的是中文 label，与本地 choices 的 label 一一对应
STATUS_BY_LABEL = _by_label(RiskStatus.choices)
CATEGORY_BY_LABEL = {**_by_label(RiskCategory.choices), "进度--变更修改": RiskCategory.SCHEDULE.value}
STRATEGY_BY_LABEL = _by_label(RiskStrategy.choices)
LEVEL_BY_LABEL = _by_label(RiskLevel.choices)
# 影响 / 概率在简道云是带数字前缀的文案，入站取首位数字，出站要发一模一样的选项文本
IMPACT_LABELS = {1: "1-很低", 2: "2-低", 3: "3-中", 4: "4-高", 5: "5-很高"}
PROBABILITY_LABELS = {
    1: "1-很低(<10%)",
    2: "2-低(11-30%)",
    3: "3-中(31-50%)",
    4: "4-高(51-70%)",
    5: "5-很高(>70%)",
}
BOOL_LABELS = {True: "是", False: "否"}
BOOL_BY_LABEL = {label: value for value, label in BOOL_LABELS.items()}

#: 推送抢先到 / 出站重试时，按同项目 + 同名认领多久以内建的本地风险
CLAIM_WINDOW = timedelta(minutes=15)
NAME_MAX_LENGTH = Risk._meta.get_field("name").max_length
SHORT_TEXT_MAX_LENGTH = Risk._meta.get_field("risk_loss").max_length


def is_push_enabled():
    return all(getattr(settings, name, "") for name in (*REQUIRED_SETTINGS, *WRITE_SETTINGS))


def is_bound(project):
    """简道云同步来的项目才有对应的「研发项目」，风险才推得过去。"""
    return (
        project is not None
        and project.external_source == project_sync.EXTERNAL_SOURCE
        and bool(project.external_id)
    )


# ---- 字段转换 ----------------------------------------------------------------


def _datetime(value):
    text = _text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _remote_date(value):
    """本地日期 → 简道云日期时间：北京 0 点换成 UTC 的 ISO 串（简道云存的就是这个时刻）。"""
    if value is None:
        return ""
    moment = datetime(value.year, value.month, value.day, tzinfo=BEIJING).astimezone(dt_timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _scale(value):
    text = _text(value)
    if text[:1].isdigit():
        number = int(text[0])
        if 1 <= number <= 5:
            return number
    return None


def _people(value):
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def normalize_row(row):
    """远端行 → 本地字段。``people`` 是三个人员字段的原值（存 external_people），``unmatched_values`` 记对不上的选项。"""
    unmatched = {}

    def pick(mapping, field, raw):
        label = _text(raw)
        if not label:
            return ""
        value = mapping.get(label)
        if value is None:
            unmatched[field] = label
            return ""
        return value

    impact = _scale(row.get(FIELD_IMPACT))
    probability = _scale(row.get(FIELD_PROBABILITY))
    level = pick(LEVEL_BY_LABEL, "risk_level", row.get(FIELD_LEVEL)) or compute_risk_level(impact, probability)
    proposed = (
        _date(row.get(FIELD_PROPOSED_DATE))
        or _date(row.get("createTime"))
        or timezone.now().astimezone(BEIJING).date()
    )
    closed = _date(row.get(FIELD_CLOSE_DATE))
    if closed and closed < proposed:
        # 本地规则：实际关闭不能早于提出；简道云不校验，这种值丢掉并报告
        unmatched["actual_close_date"] = f"{closed} < {proposed}"
        closed = None
    code = _text(row.get(FIELD_CODE))
    proposer = _people(row.get(FIELD_PROPOSER))
    owner = _people(row.get(FIELD_OWNER))
    return {
        "external_id": _text(row.get("_id")),
        "code": code or None,
        "project_external_id": _text(row.get(FIELD_PROJECT)),
        "fields": {
            "name": _text(row.get(FIELD_NAME))[:NAME_MAX_LENGTH] or code or "未命名风险",
            "status": pick(STATUS_BY_LABEL, "status", row.get(FIELD_STATUS)) or RiskStatus.DRAFT.value,
            "category": pick(CATEGORY_BY_LABEL, "category", row.get(FIELD_CATEGORY)),
            "description": _text(row.get(FIELD_DESCRIPTION)),
            "impact_description": _text(row.get(FIELD_IMPACT_DESCRIPTION)),
            "response_measures": _text(row.get(FIELD_RESPONSE_MEASURES)),
            "impact_level": impact,
            "probability": probability,
            "risk_level": level,
            "risk_loss": _text(row.get(FIELD_RISK_LOSS))[:SHORT_TEXT_MAX_LENGTH],
            "trigger_factors": _text(row.get(FIELD_TRIGGER_FACTORS))[:SHORT_TEXT_MAX_LENGTH],
            "strategy": pick(STRATEGY_BY_LABEL, "strategy", row.get(FIELD_STRATEGY)),
            "is_in_risk_production": BOOL_BY_LABEL.get(_text(row.get(FIELD_IN_PRODUCTION))),
            "proposed_date": proposed,
            "planned_handle_date": _date(row.get(FIELD_PLANNED_DATE)),
            "actual_close_date": closed,
        },
        "people": {
            "proposer": proposer[0] if proposer else None,
            "owner": owner[0] if owner else None,
            "stakeholders": _people(row.get(FIELD_STAKEHOLDERS)),
        },
        "updater_employee_id": _person(row.get("updater"))[0],
        "unmatched_values": unmatched,
    }


def _employee_ids(users_by_employee_id):
    return {user.id: employee_id for employee_id, user in users_by_employee_id.items()}


def to_remote_values(risk, fields=None, *, users_by_employee_id=None):
    """本地风险 → 简道云 data（{widget: {"value": ...}}）。``fields=None`` 发全部（新建，含项目联动的三项）。

    人员发工号；本地用户没工号就不发这项（简道云保留原值）并记日志。干系人 = 本地有工号的成员 +
    简道云里对不上本系统账号的人（``external_people``），后者不能被冲掉。
    """
    users = users_by_employee_id if users_by_employee_id is not None else _members_by_employee_id(risk.workspace)
    employee_ids = _employee_ids(users)
    wanted = set(fields) if fields is not None else None

    def want(name):
        return wanted is None or name in wanted

    values = {}
    if wanted is None:
        project = risk.project
        values[FIELD_PROJECT] = project.external_id
        values[FIELD_PROJECT_CODE] = project.code or ""
        values[FIELD_PROJECT_NO] = project.name
        lead_employee_id = employee_ids.get(project.project_lead_id)
        if lead_employee_id:
            values[FIELD_PROJECT_LEAD] = lead_employee_id
    if want("name"):
        values[FIELD_NAME] = risk.name
    if want("status"):
        values[FIELD_STATUS] = RiskStatus(risk.status).label
    if want("category"):
        values[FIELD_CATEGORY] = RiskCategory(risk.category).label if risk.category else ""
    if want("description"):
        values[FIELD_DESCRIPTION] = risk.description
    if want("impact_description"):
        values[FIELD_IMPACT_DESCRIPTION] = risk.impact_description
    if want("response_measures"):
        values[FIELD_RESPONSE_MEASURES] = risk.response_measures
    if want("impact_level"):
        values[FIELD_IMPACT] = IMPACT_LABELS.get(risk.impact_level, "")
    if want("probability"):
        values[FIELD_PROBABILITY] = PROBABILITY_LABELS.get(risk.probability, "")
    if want("risk_level"):
        values[FIELD_LEVEL] = RiskLevel(risk.risk_level).label if risk.risk_level else ""
    if want("risk_loss"):
        values[FIELD_RISK_LOSS] = risk.risk_loss
    if want("trigger_factors"):
        values[FIELD_TRIGGER_FACTORS] = risk.trigger_factors
    if want("strategy"):
        values[FIELD_STRATEGY] = RiskStrategy(risk.strategy).label if risk.strategy else ""
    if want("is_in_risk_production"):
        values[FIELD_IN_PRODUCTION] = BOOL_LABELS.get(risk.is_in_risk_production, "")
    if want("proposed_date"):
        values[FIELD_PROPOSED_DATE] = _remote_date(risk.proposed_date)
    if want("planned_handle_date"):
        values[FIELD_PLANNED_DATE] = _remote_date(risk.planned_handle_date)
    if want("actual_close_date"):
        values[FIELD_CLOSE_DATE] = _remote_date(risk.actual_close_date)
    for field, widget in (("proposer", FIELD_PROPOSER), ("owner", FIELD_OWNER)):
        if not want(field):
            continue
        user_id = getattr(risk, f"{field}_id")
        if user_id is None:
            # 本地空着 = 简道云里那个人在本系统对不上账号（本地写接口不允许清空这两项）：照简道云原值推回去，
            # 不能发空串把简道云里的人清掉
            original = (risk.external_people or {}).get(field) or {}
            values[widget] = _text(original.get("username"))
            continue
        employee_id = employee_ids.get(user_id)
        if employee_id:
            values[widget] = employee_id
        else:
            logger.warning("risk push: %s of risk %s has no employee id; remote value kept", field, risk.pk)
    if want("stakeholders"):
        usernames = []
        for user in risk.stakeholders.all():
            employee_id = employee_ids.get(user.id)
            if employee_id:
                usernames.append(employee_id)
            else:
                logger.warning("risk push: stakeholder %s of risk %s has no employee id; dropped", user.pk, risk.pk)
        for person in _people((risk.external_people or {}).get("stakeholders")):
            username = _text(person.get("username"))
            # 远端这个人在本系统没账号：保留；有账号但本地已不在名单里：就是本地删掉了
            if username and username not in users and username not in usernames:
                usernames.append(username)
        values[FIELD_STAKEHOLDERS] = usernames
    return {widget: {"value": value} for widget, value in values.items()}


# ---- 入站 / 对账 --------------------------------------------------------------


class RiskSync:
    """一个工作区内的一批入站写入：人员 / 项目映射只查一次。``users`` 懒加载：删除 / 恢复用不到。"""

    def __init__(self, workspace, actor=None):
        self.workspace = workspace
        # 没有当前用户时 BaseModel.save 会把 created_by 清空：定时任务 / 推送记在工作区所有者名下
        self.editor = actor or workspace.owner
        self._users = None
        self._projects = None
        self.counts = {"created": 0, "recovered": 0, "updated": 0, "unchanged": 0}
        self.skipped = []  # {"code", "name", "reason"}
        self.unmatched_people = {}  # (工号, 姓名) -> {"proposer": n, "owner": n, "stakeholders": n}
        self.unmatched_values = {}  # 本地字段 -> set(远端值)

    @property
    def users(self):
        if self._users is None:
            self._users = _members_by_employee_id(self.workspace)
        return self._users

    @property
    def projects(self):
        if self._projects is None:
            self._projects = {
                project.external_id: project
                for project in Project.objects.filter(
                    workspace=self.workspace, external_source=project_sync.EXTERNAL_SOURCE
                ).exclude(external_id__isnull=True)
                if project.external_id
            }
        return self._projects

    # ---- 字段解析 ----

    def _user(self, person, role):
        if not isinstance(person, dict):
            return None
        employee_id, name = _person(person)
        if not employee_id:
            return None
        user = self.users.get(employee_id)
        if user is None:
            entry = self.unmatched_people.setdefault(
                (employee_id, name), {"proposer": 0, "owner": 0, "stakeholders": 0}
            )
            entry[role] += 1
        return user

    def _desired(self, record):
        people = record["people"]
        data = dict(record["fields"])
        data["proposer"] = self._user(people["proposer"], "proposer")
        data["owner"] = self._user(people["owner"], "owner")
        stakeholders = []
        for person in people["stakeholders"]:
            user = self._user(person, "stakeholders")
            if user is not None and user not in stakeholders:
                stakeholders.append(user)
        data["stakeholders"] = stakeholders
        return data

    def _actor(self, record):
        employee_id = record["updater_employee_id"]
        return self.users.get(employee_id) if employee_id else None

    def _skip(self, record, reason):
        self.skipped.append({"code": record["code"] or "", "name": record["fields"]["name"], "reason": reason})

    # ---- 查找 / 认领 ----

    def find_local(self, external_id):
        return Risk.all_objects.filter(
            workspace=self.workspace, external_source=EXTERNAL_SOURCE, external_id=external_id
        ).first()

    def claim_pending(self, project, record):
        """推送比出站新建的响应先到：把本地那条还在等编号的认成这条远端记录。"""
        risk = (
            Risk.objects.filter(
                project=project,
                external_source=EXTERNAL_SOURCE,
                external_id="",
                sync_status=RiskSyncStatus.PENDING,
                name=record["fields"]["name"],
                created_at__gte=timezone.now() - CLAIM_WINDOW,
            )
            .order_by("created_at")
            .first()
        )
        if risk is None:
            return None
        Risk.all_objects.filter(pk=risk.pk).update(external_id=record["external_id"])
        risk.external_id = record["external_id"]
        logger.info("risk push: claimed local risk %s for remote %s", risk.pk, record["external_id"])
        return risk

    # ---- 单条处理 ----

    def upsert(self, record, *, overwrite_pending=False):
        """按 ``_id`` 新建或覆盖。返回 created / recovered / updated / unchanged / skipped。

        对账时（``overwrite_pending=False``）本地还没推成功的不碰；推送来的改动（True）照常应用 ——
        出站只发改过的字段，两边不会互相冲掉。

        本地已删、远端还在：删除已经两边生效（``synced``）却又出现，只能是在简道云回收站恢复了 ——
        简道云的恢复不发推送（批量操作都不发），只能靠对账发现，本地跟着恢复；删除还没推过去（pending /
        failed）就以本地删除为准，等出站重试。
        """
        for field, label in record["unmatched_values"].items():
            self.unmatched_values.setdefault(field, set()).add(label)
        project = self.projects.get(record["project_external_id"])
        if project is None:
            self._skip(record, "project_not_found")
            return "skipped"
        risk = self.find_local(record["external_id"])
        recovered = False
        if risk is not None:
            if risk.deleted_at is not None:
                if risk.sync_status != RiskSyncStatus.SYNCED:
                    self._skip(record, "deleted_locally")
                    return "skipped"
                recovered = True
            elif not overwrite_pending and risk.sync_status in (RiskSyncStatus.PENDING, RiskSyncStatus.FAILED):
                self._skip(record, "local_unsynced")
                return "skipped"
        desired = self._desired(record)
        actor = self._actor(record)
        with transaction.atomic(), impersonate(actor or self.editor):
            if recovered:
                self.recover(risk)
            if risk is None:
                risk = create_risk(project, actor, desired, push=False, activity_extra=ACTIVITY_EXTRA)
                outcome = "created"
            else:
                moved = risk.project_id != project.id
                if moved:
                    self._move(risk, project, actor)
                changed = update_risk(risk, actor, desired, push=False, activity_extra=ACTIVITY_EXTRA)
                outcome = "recovered" if recovered else ("updated" if changed or moved else "unchanged")
            self._bind(risk, record)
        self.counts[outcome] += 1
        return outcome

    def _move(self, risk, project, actor):
        """简道云把风险挂到了另一个研发项目：本地跟着挪；关联缺陷限同项目，一并解除。"""
        old_project = risk.project
        for row in RiskIssue.objects.filter(risk=risk):
            row.delete()
        risk.project = project
        risk.save(update_fields=["project", "workspace", "updated_at", "updated_by"])
        write_activity(
            risk,
            actor=actor,
            verb="updated",
            field="project",
            old_value=old_project.name,
            new_value=project.name,
            extra=ACTIVITY_EXTRA,
        )

    def _bind(self, risk, record):
        """写绑定与同步状态。不走 save()：不推 updated_at，也不触发任何出站。"""
        desired = {
            "external_source": EXTERNAL_SOURCE,
            "external_id": record["external_id"],
            "external_people": record["people"],
            "sync_status": RiskSyncStatus.SYNCED.value,
            "sync_error": "",
            "synced_at": timezone.now(),
        }
        if record["code"]:
            desired["code"] = record["code"]
        changed = {key: value for key, value in desired.items() if getattr(risk, key) != value}
        if not changed:
            return
        old_code = risk.code
        Risk.all_objects.filter(pk=risk.pk).update(**changed)
        for key, value in changed.items():
            setattr(risk, key, value)
        if "code" in changed:
            write_activity(
                risk, actor=None, verb="updated", field="code", old_value=old_code, new_value=risk.code, extra=ACTIVITY_EXTRA
            )

    def remove(self, risk):
        with impersonate(self.editor):
            risk.delete()

    def recover(self, risk):
        """简道云回收站恢复 → 本地也恢复。级联软删的子行时间戳都晚于风险自己的，按它找回；
        风险删除前就已删掉的（如早先解除的关联）不动。"""
        deleted_at = risk.deleted_at
        with transaction.atomic():
            Risk.all_objects.filter(pk=risk.pk).update(deleted_at=None)
            for model in (RiskIssue, RiskComment, RiskActivity):
                model.all_objects.filter(risk_id=risk.pk, deleted_at__gte=deleted_at).update(deleted_at=None)
            FileAsset.all_objects.filter(
                Q(risk_id=risk.pk) | Q(risk_comment__risk_id=risk.pk), deleted_at__gte=deleted_at
            ).update(deleted_at=None)
            risk.deleted_at = None
            # 变更历史里没有这个字段的句式，前端照 comment 原文显示：「简道云 从回收站恢复了风险」
            write_activity(risk, actor=None, verb="updated", comment="从回收站恢复了风险", extra=ACTIVITY_EXTRA)


def _find_project(external_id):
    if not external_id:
        return None
    return (
        Project.objects.filter(external_source=project_sync.EXTERNAL_SOURCE, external_id=external_id)
        .select_related("workspace")
        .first()
    )


def apply_push(op, data):
    """简道云「数据推送」的一条事件。返回短结果串（日志 / 响应用）；不认识的一律忽略、不报错。"""
    if not isinstance(data, dict):
        return "ignored:no_data"
    entry_id = _text(data.get("entryId"))
    if entry_id and entry_id != settings.JIANDAOYUN_RISK_ENTRY_ID:
        return "ignored:other_entry"
    external_id = _text(data.get("_id"))
    if not external_id:
        return "ignored:no_id"

    if op in ("data_create", "data_update"):
        record = normalize_row(data)
        project = _find_project(record["project_external_id"])
        if project is None:
            # 今天刚建的研发项目本地还没有：等每日项目同步跑完，由每日对账补上
            logger.warning("risk push: project %s not found for remote risk %s", record["project_external_id"], external_id)
            return "ignored:project_not_found"
        sync = RiskSync(project.workspace)
        if sync.find_local(external_id) is None:
            sync.claim_pending(project, record)
        return sync.upsert(record, overwrite_pending=True)

    risk = (
        Risk.all_objects.filter(external_source=EXTERNAL_SOURCE, external_id=external_id)
        .select_related("workspace")
        .first()
    )
    if risk is None:
        return "ignored:not_found"
    if op == "data_remove":
        if risk.deleted_at is not None:
            return "ignored:already_deleted"
        RiskSync(risk.workspace).remove(risk)
        return "removed"
    if op == "data_recover":
        if risk.deleted_at is None:
            return "ignored:not_deleted"
        RiskSync(risk.workspace).recover(risk)
        return "recovered"
    return "ignored:unknown_op"


# ---- 出站辅助（任务在 bgtasks/risk_sync_task.py）---------------------------------


#: 认领时对远端 createTime 的宽限：简道云服务器时钟比本机慢几分钟（2026-10-20 实测约 8 分钟，网关约 30 分钟），
#: 不能拿「本地建它之后」卡死，主要靠「这条远端记录还没绑定任何本地风险」判断
REMOTE_CLOCK_TOLERANCE = timedelta(hours=1)


def find_remote_duplicate(risk):
    """出站新建超时后重试前查一遍：同项目 + 同名、还没被任何本地风险绑定、时间对得上的远端记录，有就认领、不再新建。

    网关的 data/list 按 ``_id`` 过滤不生效，按文本字段 eq 可以，所以按名称查。
    """
    rows, _ = fetch_entry_rows(
        settings.JIANDAOYUN_RISK_APP_ID,
        settings.JIANDAOYUN_RISK_ENTRY_ID,
        (FIELD_PROJECT, FIELD_NAME, FIELD_CODE, "createTime"),
        filter={"rel": "and", "cond": [{"field": FIELD_NAME, "method": "eq", "value": [risk.name]}]},
    )
    candidates = [row for row in rows if _text(row.get(FIELD_PROJECT)) == risk.project.external_id]
    if not candidates:
        return None
    bound = set(
        Risk.all_objects.filter(
            workspace_id=risk.workspace_id,
            external_source=EXTERNAL_SOURCE,
            external_id__in=[_text(row.get("_id")) for row in candidates],
        ).values_list("external_id", flat=True)
    )
    since = risk.created_at - REMOTE_CLOCK_TOLERANCE
    for row in candidates:
        if _text(row.get("_id")) in bound:
            continue
        created = _datetime(row.get("createTime"))
        if created is None or created >= since:
            return row
    return None


def bind_created(risk, row):
    """出站新建成功：记下 ``_id`` 与流水号。流水号没回来就先空着，等推送回流 / 每日对账补。

    新建请求在路上时风险可能已被删除：那时还没有 ``_id``，删除推不过去。这里锁住这一行重读
    （``utils/risk.py::delete_risk`` 也锁同一行），已删就补推一次远端删除 —— 否则远端那条留着，
    对账会把它当成「在简道云恢复了」又把本地恢复回来。
    """
    external_id = _text(row.get("_id"))
    code = _text(row.get(FIELD_CODE)) or None
    try:
        with transaction.atomic():
            current = Risk.all_objects.select_for_update().get(pk=risk.pk)
            deleted = current.deleted_at is not None
            Risk.all_objects.filter(pk=risk.pk).update(
                external_id=external_id,
                code=code or current.code,
                sync_status=(RiskSyncStatus.PENDING if deleted else RiskSyncStatus.SYNCED).value,
                sync_error="",
                synced_at=timezone.now(),
            )
            if code and code != current.code:
                write_activity(
                    current,
                    actor=None,
                    verb="updated",
                    field="code",
                    old_value=current.code,
                    new_value=code,
                    extra=ACTIVITY_EXTRA,
                )
            if deleted:
                from plane.bgtasks.risk_sync_task import push_risk_delete

                transaction.on_commit(lambda: push_risk_delete.delay(str(risk.pk), external_id))
    except IntegrityError as exc:
        # 这条远端记录已被另一条本地风险绑定（推送先到、认领又没认上）：留给人处理
        log_exception(exc)
        Risk.all_objects.filter(pk=risk.pk).update(
            sync_status=RiskSyncStatus.FAILED.value,
            sync_error=f"remote record {external_id} is already bound to another local risk",
        )


# ---- 导入 / 每日对账 ----------------------------------------------------------


def _synced_risks(workspace):
    return Risk.objects.filter(workspace=workspace, external_source=EXTERNAL_SOURCE).exclude(external_id="")


def requeue_unsynced(workspace):
    """没推成功的（failed，含删除失败的）和从没推过的（建它时没配写接口）重新排队。返回排队数。"""
    if not is_push_enabled():
        return 0
    from plane.utils.risk import resync_risk

    alive = Q(deleted_at__isnull=True) & (Q(sync_status=RiskSyncStatus.FAILED) | Q(sync_status="", external_id=""))
    delete_failed = Q(deleted_at__isnull=False, sync_status=RiskSyncStatus.FAILED) & ~Q(external_id="")
    count = 0
    for risk in Risk.all_objects.filter(workspace=workspace, external_source=EXTERNAL_SOURCE).filter(alive | delete_failed):
        if resync_risk(risk):
            count += 1
    return count


def sync_risks(workspace, actor=None):
    """设置页「立即同步」= 每日对账：拉全表、按 _id upsert、报告两边对不上的。"""
    # HTTP 全部在事务之外
    rows, pages = fetch_entry_rows(
        settings.JIANDAOYUN_RISK_APP_ID, settings.JIANDAOYUN_RISK_ENTRY_ID, REMOTE_FIELDS
    )
    sync = RiskSync(workspace, actor)
    remote_ids = set()
    for row in rows:
        record = normalize_row(row)
        if not record["external_id"]:
            continue
        remote_ids.add(record["external_id"])
        try:
            sync.upsert(record)
        except Exception as exc:  # noqa: BLE001
            # 单条失败不挡其它条：事务已回滚，记下来接着跑
            log_exception(exc)
            sync._skip(record, "error")

    remote_missing = sorted(
        risk.code or risk.name for risk in _synced_risks(workspace).exclude(external_id__in=remote_ids)
    )
    requeued = requeue_unsynced(workspace)
    unmatched_people = sorted(
        (
            {"employee_id": employee_id, "name": name, **roles}
            for (employee_id, name), roles in sync.unmatched_people.items()
        ),
        key=lambda entry: -(entry["proposer"] + entry["owner"] + entry["stakeholders"]),
    )
    reasons = Counter(entry["reason"] for entry in sync.skipped)
    return {
        "remote_total": len(rows),
        **sync.counts,
        "skipped": len(sync.skipped) - reasons["local_unsynced"],
        "local_unsynced": reasons["local_unsynced"],
        "remote_missing": len(remote_missing),
        "requeued": requeued,
        "proposer_unmatched": sum(entry["proposer"] for entry in unmatched_people),
        "owner_unmatched": sum(entry["owner"] for entry in unmatched_people),
        "stakeholder_unmatched": sum(entry["stakeholders"] for entry in unmatched_people),
        "details": {
            "skipped": sync.skipped[:DETAIL_LIMIT],
            "remote_missing": remote_missing[:DETAIL_LIMIT],
            "unmatched_people": unmatched_people[:DETAIL_LIMIT],
            "unmatched_values": {field: sorted(values) for field, values in sync.unmatched_values.items()},
        },
        "pages": pages,
    }


def _describe_target(workspace):
    return {"kind": "risks", "synced_count": _synced_risks(workspace).count()}


def _remote_info():
    return {
        "app_id": settings.JIANDAOYUN_RISK_APP_ID,
        "entry_id": settings.JIANDAOYUN_RISK_ENTRY_ID,
    }


SPEC = IntegrationSpec(
    key="jiandaoyun_risk",
    name="风险",
    provider="jiandaoyun",
    direction=DIRECTION_PULL,
    description=(
        "简道云「风险」表单与各项目的风险双向同步：本系统新建 / 修改 / 删除实时推到简道云（编号由简道云生成），"
        "简道云的改动经数据推送回到本系统。这里的同步是全量对账：以简道云为准覆盖本地，本地有简道云没有的只报告。"
        "每天定时对账一次（仅限已导入过的工作区），也可手动触发。"
    ),
    required_settings=REQUIRED_SETTINGS,
    run=sync_risks,
    describe_target=_describe_target,
    remote_info=_remote_info,
    # 首次手动导入之后才每日跟进
    schedule_filter=lambda workspace: _synced_risks(workspace).exists(),
    run_async=True,
)
