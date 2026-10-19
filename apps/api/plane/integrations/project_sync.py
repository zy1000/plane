"""简道云「研发项目」表单 → 本工作区项目。

一条远端记录 = 一个本地项目，按远端 ``_id``（存 ``Project.external_id``）认。规则（2026-10-19 拍板）：

- 名称 = 研发项目编号，项目ID（identifier）= 研发项目ID；本地未绑定的项目和它撞名，就给本地项目改名
- 每次同步用远端值覆盖本地（含空值）；远端删了的本地不删，只报告
- BU、项目代号缺的值补进字典；状态 / 类型按 label 匹配，匹配不上留空并报告
- 负责人 / 产品经理按工号匹配本工作区活跃成员，找不到留空；一个工号多个账号时取 @kaifa.cn 那个
- 研发模式只在创建时按名称取（空 → 默认模式）；之后不跟远端，项目本来就不允许换模式
- 新建项目走 ``setup_new_project``，和界面新建一模一样；创建人 = 负责人，找不到用工作区所有者
- 不写项目活动：首次一下 700 条，还会触发通知 / webhook

首次要建 700 个项目（约 0.3 s / 个），所以 ``run_async``：设置页按钮投 Celery 执行。
"""

import html
import random
from datetime import datetime, timedelta, timezone

from crum import impersonate
from django.conf import settings
from django.db import transaction

from plane.db.models import (
    DataDictionary,
    DataDictionaryItem,
    DevMode,
    Project,
    ProjectIdentifier,
    ProjectMember,
    WorkspaceMember,
)
from plane.db.models.project import ROLE
from plane.db.models.user import UserExtraInfo
from plane.utils.data_dictionary import (
    PROJECT_CODE_DICTIONARY_KEY,
    PROJECT_DICTIONARY_FIELD_KEYS,
    bulk_create_items,
    ensure_system_dictionaries,
    normalize_labels,
)
from plane.utils.dev_mode import default_dev_mode
from plane.utils.exception_logger import log_exception
from plane.utils.project.defaults import setup_new_project

from .base import DIRECTION_PULL, IntegrationError, IntegrationSpec
from .jiandaoyun import fetch_entry_rows

EXTERNAL_SOURCE = "jiandaoyun_rd_project"

FIELD_RD_NO = "rd_proj_no"  # 研发项目编号 → 名称
FIELD_RD_ID = "_widget_1792118792302"  # 研发项目ID → identifier
FIELD_CODE = "proj_no"  # 项目代号
FIELD_BU = "bu"
FIELD_STATUS = "proj_stat"
FIELD_TYPE = "proj_ty"
FIELD_LEAD = "rd_proj_duty_per"  # 研发项目负责人（人员字段 {name, username: 工号}）
FIELD_PRODUCT_MANAGER = "rd_prd_mger"  # 研发产品经理
FIELD_START = "plan_star_date"  # 计划开始日期
FIELD_END = "plan_end_date"  # 计划完成日期
FIELD_DESCRIPTION = "proj_txt"
FIELD_DEV_MODE = "_widget_1789954576759"  # 研发模型
REMOTE_FIELDS = (
    FIELD_RD_NO,
    FIELD_RD_ID,
    FIELD_CODE,
    FIELD_BU,
    FIELD_STATUS,
    FIELD_TYPE,
    FIELD_LEAD,
    FIELD_PRODUCT_MANAGER,
    FIELD_START,
    FIELD_END,
    FIELD_DESCRIPTION,
    FIELD_DEV_MODE,
)

REQUIRED_SETTINGS = (
    "JIANDAOYUN_API_BASE_URL",
    "JIANDAOYUN_API_TOKEN",
    "JIANDAOYUN_APP_KEY",
    "JIANDAOYUN_RD_PROJECT_APP_ID",
    "JIANDAOYUN_RD_PROJECT_ENTRY_ID",
)

NAME_MAX_LENGTH = Project._meta.get_field("name").max_length
IDENTIFIER_MAX_LENGTH = ProjectIdentifier._meta.get_field("name").max_length
LOCAL_RENAME_SUFFIX = "（本地）"
# 同一工号在本系统有两个账号（如 @kaifa.cn 与 @security.kaifa.cn）时优先认这个后缀
PREFERRED_EMAIL_SUFFIX = "@kaifa.cn"
# 简道云日期是 UTC 时刻：2024-09-29T16:00:00.000Z = 北京 09-30
BEIJING = timezone(timedelta(hours=8))
# 快照放 Redis，每类明细只带前这么多条
DETAIL_LIMIT = 100
# 新建项目随机给一个 emoji 图标，和界面新建一致；取值照抄前端 packages/constants 的 RANDOM_EMOJI_CODES
PROJECT_EMOJI_CODES = (
    "8986",
    "9200",
    "128204",
    "127773",
    "127891",
    "128076",
    "128077",
    "128187",
    "128188",
    "128512",
    "128522",
    "128578",
)

# 覆盖比较的字段；FK 比 *_id
SYNCED_FIELDS = (
    "name",
    "identifier",
    "code",
    "business_unit",
    "status",
    "project_type",
    "project_lead",
    "product_manager",
    "start_date",
    "end_date",
    "description",
    "description_html",
)
FK_FIELDS = {"business_unit", "status", "project_type", "project_lead", "product_manager"}


def _text(value):
    return value.replace("\x00", "").strip() if isinstance(value, str) else ""


def _random_logo_props():
    return {"in_use": "emoji", "emoji": {"value": random.choice(PROJECT_EMOJI_CODES)}}


def _date(value):
    text = _text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(BEIJING).date()
    except ValueError:
        return None


def _person(value):
    """人员字段 → (工号, 姓名)；空返回 ("", "")。"""
    if not isinstance(value, dict):
        return "", ""
    return _text(value.get("username")), _text(value.get("name"))


def _description_html(text):
    # 项目设置页展示 description_html；纯文本按行转成段内换行
    if not text:
        return "<p></p>"
    return "<p>" + html.escape(text).replace("\n", "<br>") + "</p>"


def normalize_rows(rows):
    """远端行 → 记录。缺编号 / ID、超长、远端内部重名 / 重 ID 的跳过（后出现的那条）。"""
    records, skipped = [], []
    seen_names, seen_identifiers = set(), set()
    for row in rows:
        external_id = _text(row.get("_id"))
        name = _text(row.get(FIELD_RD_NO))
        identifier = _text(row.get(FIELD_RD_ID)).upper()
        if not external_id or not name or not identifier:
            reason = "missing_key"
        elif len(name) > NAME_MAX_LENGTH or len(identifier) > IDENTIFIER_MAX_LENGTH:
            reason = "too_long"
        elif name in seen_names:
            reason = "duplicate_name"
        elif identifier in seen_identifiers:
            reason = "duplicate_identifier"
        else:
            reason = None
        if reason:
            skipped.append({"name": name, "identifier": identifier, "reason": reason})
            continue
        seen_names.add(name)
        seen_identifiers.add(identifier)
        lead_employee_id, lead_name = _person(row.get(FIELD_LEAD))
        manager_employee_id, manager_name = _person(row.get(FIELD_PRODUCT_MANAGER))
        description = _text(row.get(FIELD_DESCRIPTION))
        records.append(
            {
                "external_id": external_id,
                "name": name,
                "identifier": identifier,
                # 与 Project.save() 同口径：代号空时回落名称
                "code": _text(row.get(FIELD_CODE)) or name,
                "business_unit": _text(row.get(FIELD_BU)),
                "status": _text(row.get(FIELD_STATUS)),
                "project_type": _text(row.get(FIELD_TYPE)),
                "lead": (lead_employee_id, lead_name),
                "product_manager": (manager_employee_id, manager_name),
                "start_date": _date(row.get(FIELD_START)),
                "end_date": _date(row.get(FIELD_END)),
                "description": description,
                "description_html": _description_html(description),
                "dev_mode": _text(row.get(FIELD_DEV_MODE)),
            }
        )
    return records, skipped


def _ensure_dictionary_labels(workspace, key, labels, actor):
    """把缺的 label 追加进字典，返回新加的 label。"""
    labels, _, _ = normalize_labels(labels)
    with transaction.atomic():
        # 行锁把并发同步串行化，差集才精确（同 project_code.py）
        dictionary = DataDictionary.objects.select_for_update().filter(workspace=workspace, key=key).first()
        if dictionary is None:
            raise IntegrationError("INTEGRATION_TARGET_MISSING", f"dictionary '{key}' not found")
        created, _ = bulk_create_items(dictionary, labels, actor=actor)
    return [item.label for item in created]


def _dictionary_items(workspace, key):
    return {
        item.label: item
        for item in DataDictionaryItem.objects.filter(dictionary__workspace=workspace, dictionary__key=key)
    }


def _members_by_employee_id(workspace):
    member_ids = WorkspaceMember.objects.filter(
        workspace=workspace, is_active=True, deleted_at__isnull=True
    ).values_list("member_id", flat=True)
    candidates = {}
    for info in (
        UserExtraInfo.objects.filter(user_id__in=member_ids)
        .exclude(employee_id__isnull=True)
        .exclude(employee_id="")
        .select_related("user")
    ):
        candidates.setdefault(info.employee_id.strip(), []).append(info.user)

    def rank(user):
        last_login = user.last_login.timestamp() if user.last_login else 0
        return (not (user.email or "").lower().endswith(PREFERRED_EMAIL_SUFFIX), -last_login)

    return {employee_id: sorted(users, key=rank)[0] for employee_id, users in candidates.items()}


def _ensure_admin_member(project, user):
    member = ProjectMember.objects.filter(project=project, member=user).first()
    if member is None:
        ProjectMember.objects.create(project=project, member=user, role=ROLE.ADMIN.value)
    elif not member.is_active or member.role != ROLE.ADMIN.value:
        member.is_active = True
        member.role = ROLE.ADMIN.value
        member.save(update_fields=["is_active", "role", "updated_at", "updated_by"])


class _ProjectSync:
    def __init__(self, workspace, actor):
        self.workspace = workspace
        # 更新 / 改名记在触发人名下；定时任务没有触发人，记在工作区所有者名下
        # （没有当前用户时 BaseModel.save 会把 created_by 也清空）
        self.editor = actor or workspace.owner
        projects = list(Project.all_objects.filter(workspace=workspace, deleted_at__isnull=True))
        self.bound = {p.external_id: p for p in projects if p.external_source == EXTERNAL_SOURCE and p.external_id}
        # 名称 / identifier 的唯一约束对模板项目同样生效，所以全量参与冲突判断
        self.by_name = {p.name: p for p in projects}
        # ProjectIdentifier 表里可能有项目已不在的残留行，同样占着 identifier
        self.identifier_owner = dict(
            ProjectIdentifier.objects.filter(workspace=workspace, deleted_at__isnull=True).values_list(
                "name", "project_id"
            )
        )
        self.users = _members_by_employee_id(workspace)
        self.dev_modes = {mode.name: mode for mode in DevMode.objects.filter(workspace=workspace)}
        self.default_dev_mode = default_dev_mode(workspace.id)
        self.items = {
            field: _dictionary_items(workspace, key) for field, key in PROJECT_DICTIONARY_FIELD_KEYS.items()
        }
        self.counts = {"created": 0, "updated": 0, "unchanged": 0}
        self.local_renamed, self.skipped = [], []
        self.unmatched_people = {}  # (工号, 姓名) -> {"lead": n, "product_manager": n}
        self.unmatched_values = {"status": set(), "project_type": set(), "business_unit": set(), "dev_mode": set()}

    # ---- 字段解析 ----

    def _user(self, person, role):
        employee_id, name = person
        if not employee_id:
            return None
        user = self.users.get(employee_id)
        if user is None:
            entry = self.unmatched_people.setdefault((employee_id, name), {"lead": 0, "product_manager": 0})
            entry[role] += 1
        return user

    def _item(self, field, label):
        if not label:
            return None
        item = self.items[field].get(label)
        if item is None:
            self.unmatched_values[field].add(label)
        return item

    def _desired(self, record):
        return {
            "name": record["name"],
            "identifier": record["identifier"],
            "code": record["code"],
            "business_unit": self._item("business_unit", record["business_unit"]),
            "status": self._item("status", record["status"]),
            "project_type": self._item("project_type", record["project_type"]),
            "project_lead": self._user(record["lead"], "lead"),
            "product_manager": self._user(record["product_manager"], "product_manager"),
            "start_date": record["start_date"],
            "end_date": record["end_date"],
            "description": record["description"],
            "description_html": record["description_html"],
        }

    # ---- 单条处理 ----

    def _skip(self, record, reason):
        self.skipped.append({"name": record["name"], "identifier": record["identifier"], "reason": reason})

    def _rename_local(self, project):
        """本地未绑定的项目让出名称：加「（本地）」，还撞就再加序号。"""
        base = project.name[: NAME_MAX_LENGTH - len(LOCAL_RENAME_SUFFIX) - 3] + LOCAL_RENAME_SUFFIX
        candidate, index = base, 2
        while candidate in self.by_name:
            candidate = f"{base}{index}"
            index += 1
        old_name = project.name
        project.name = candidate
        with impersonate(self.editor):
            project.save(update_fields=["name", "updated_at", "updated_by"])
        return old_name

    def _create(self, record, desired):
        creator = desired["project_lead"] or self.workspace.owner
        # 填了但本地没有的模式在 apply 里已跳过，这里只剩「为空 → 默认模式」
        dev_mode = self.dev_modes[record["dev_mode"]] if record["dev_mode"] else self.default_dev_mode
        with impersonate(creator):
            project = Project(
                workspace=self.workspace,
                external_source=EXTERNAL_SOURCE,
                external_id=record["external_id"],
                dev_mode=dev_mode,
                logo_props=_random_logo_props(),
                **desired,
            )
            project.save()
            ProjectIdentifier.objects.create(name=project.identifier, project=project, workspace=self.workspace)
            setup_new_project(project, creator)
        return project

    def _update(self, project, desired):
        changed = []
        for field in SYNCED_FIELDS:
            value = desired[field]
            if field in FK_FIELDS:
                if getattr(project, f"{field}_id") != (value.id if value is not None else None):
                    changed.append(field)
            elif getattr(project, field) != value:
                changed.append(field)
        if not changed:
            return False
        lead_changed = "project_lead" in changed
        for field in changed:
            setattr(project, field, desired[field])
        with impersonate(self.editor):
            project.save(update_fields=[*changed, "updated_at", "updated_by"])
            if "identifier" in changed:
                updated = ProjectIdentifier.objects.filter(project=project).update(name=project.identifier)
                if not updated:
                    ProjectIdentifier.objects.create(
                        name=project.identifier, project=project, workspace=self.workspace
                    )
            if lead_changed and project.project_lead_id is not None:
                _ensure_admin_member(project, project.project_lead)
        return True

    def apply(self, record):
        project = self.bound.get(record["external_id"])
        old_name = project.name if project is not None else None
        old_identifier = project.identifier if project is not None else None

        # 研发模式只在创建时取、建好就改不了：填了本地没有的模式就先不建，免得落成默认模式再也改不回来；
        # 本地补上这个模式后，下次同步就会建
        if project is None and record["dev_mode"] and record["dev_mode"] not in self.dev_modes:
            self.unmatched_values["dev_mode"].add(record["dev_mode"])
            self._skip(record, "dev_mode_not_found")
            return

        identifier_holder = self.identifier_owner.get(record["identifier"])
        if identifier_holder is not None and (project is None or identifier_holder != project.id):
            self._skip(record, "identifier_taken")
            return
        # 名称被本地未绑定的项目占着：下面在同一事务里给它改名
        name_holder = self.by_name.get(record["name"])
        if name_holder is project:
            name_holder = None
        elif name_holder is not None and name_holder.external_source == EXTERNAL_SOURCE:
            # 另一条远端记录占着这个名称：它这轮也改名让出（链式改名）的话，下次同步就能过；
            # 两条互换则每轮都跳过、不会自己解开（identifier 同理）。名称末段即研发项目 ID，
            # 互换只会是远端手工对调 ID，靠跳过明细发现后手动给其中一个本地项目改名
            self._skip(record, "name_taken_by_synced")
            return

        desired = self._desired(record)
        with transaction.atomic():
            renamed_from = self._rename_local(name_holder) if name_holder is not None else None
            if project is None:
                project = self._create(record, desired)
                outcome = "created"
            else:
                outcome = "updated" if self._update(project, desired) else "unchanged"

        # 事务提交后再改内存索引，失败时索引不会和库对不上
        if renamed_from is not None:
            del self.by_name[renamed_from]
            self.by_name[name_holder.name] = name_holder
            self.local_renamed.append({"from": renamed_from, "to": name_holder.name})
        if old_name is not None and old_name != project.name:
            self.by_name.pop(old_name, None)
        if old_identifier is not None and old_identifier != project.identifier:
            self.identifier_owner.pop(old_identifier, None)
        self.by_name[project.name] = project
        self.identifier_owner[project.identifier] = project.id
        self.bound[record["external_id"]] = project
        self.counts[outcome] += 1


def sync_rd_projects(workspace, actor=None):
    # HTTP 全部在事务之外
    rows, pages = fetch_entry_rows(
        settings.JIANDAOYUN_RD_PROJECT_APP_ID,
        settings.JIANDAOYUN_RD_PROJECT_ENTRY_ID,
        REMOTE_FIELDS,
    )
    records, skipped = normalize_rows(rows)

    ensure_system_dictionaries(workspace)
    dictionary_added = {
        "business_unit": _ensure_dictionary_labels(
            workspace,
            PROJECT_DICTIONARY_FIELD_KEYS["business_unit"],
            [record["business_unit"] for record in records],
            actor,
        ),
        "project_code": _ensure_dictionary_labels(
            workspace, PROJECT_CODE_DICTIONARY_KEY, [record["code"] for record in records], actor
        ),
    }

    sync = _ProjectSync(workspace, actor)
    sync.skipped.extend(skipped)
    for record in records:
        try:
            sync.apply(record)
        except Exception as exc:  # noqa: BLE001
            # 单条失败不挡其它条：事务已回滚，记下来接着跑
            log_exception(exc)
            sync._skip(record, "error")

    remote_ids = {_text(row.get("_id")) for row in rows}
    remote_missing = sorted(p.name for external_id, p in sync.bound.items() if external_id not in remote_ids)
    unmatched_people = sorted(
        (
            {"employee_id": employee_id, "name": name, **roles}
            for (employee_id, name), roles in sync.unmatched_people.items()
        ),
        key=lambda entry: -(entry["lead"] + entry["product_manager"]),
    )
    return {
        "remote_total": len(rows),
        **sync.counts,
        "local_renamed": len(sync.local_renamed),
        "skipped": len(sync.skipped),
        "remote_missing": len(remote_missing),
        "lead_unmatched": sum(entry["lead"] for entry in unmatched_people),
        "product_manager_unmatched": sum(entry["product_manager"] for entry in unmatched_people),
        "dictionary_added": dictionary_added,
        "details": {
            "local_renamed": sync.local_renamed[:DETAIL_LIMIT],
            "skipped": sync.skipped[:DETAIL_LIMIT],
            "remote_missing": remote_missing[:DETAIL_LIMIT],
            "unmatched_people": unmatched_people[:DETAIL_LIMIT],
            "unmatched_values": {field: sorted(values) for field, values in sync.unmatched_values.items()},
        },
        "pages": pages,
    }


def _synced_projects(workspace):
    return Project.all_objects.filter(workspace=workspace, external_source=EXTERNAL_SOURCE, deleted_at__isnull=True)


def _describe_target(workspace):
    return {"kind": "projects", "synced_count": _synced_projects(workspace).count()}


def _remote_info():
    return {
        "app_id": settings.JIANDAOYUN_RD_PROJECT_APP_ID,
        "entry_id": settings.JIANDAOYUN_RD_PROJECT_ENTRY_ID,
    }


SPEC = IntegrationSpec(
    key="jiandaoyun_rd_project",
    name="研发项目",
    provider="jiandaoyun",
    direction=DIRECTION_PULL,
    description=(
        "从简道云「研发项目」表单同步项目：名称取研发项目编号，项目ID 取研发项目ID；"
        "每次以简道云为准覆盖，简道云删除的项目本地保留。每天定时同步一次（仅限已同步过的工作区），也可手动触发。"
    ),
    required_settings=REQUIRED_SETTINGS,
    run=sync_rd_projects,
    describe_target=_describe_target,
    remote_info=_remote_info,
    # 只在手动同步过的工作区每日跟进，别给每个工作区都建一遍
    schedule_filter=lambda workspace: _synced_projects(workspace).exists(),
    run_async=True,
)
