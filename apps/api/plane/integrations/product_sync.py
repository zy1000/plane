"""简道云「产品」表单 → 本工作区产品。

一条远端记录 = 一个本地产品，按远端 ``_id``（存 ``Product.external_id``）认。规则（2026-11-12 拍板）：

- 只同步产品本身，**不同步产品与项目的关联**（远端产品表自带的研发项目、产品-项目关联表都不读）
- 开发编号（identifier）= ``kf_no``，名称 = PMS项目名称 ``pms_proj_name``，项目代号（code）= ``proj_no``
- 本地未绑定的产品占着同一个开发编号 / 名称：给**本地**产品改（开发编号末尾加 ``L``、名称加「（本地）」），远端的另建
- 每次同步用远端值覆盖本地（含空值）；远端删了的本地不删，只报告
- 产品类别、产品状态、项目代号缺的值补进字典；三个研发等级按 label 匹配，匹配不上留空并报告
- 产品负责人（owner）= 远端产品负责人，项目负责人 = 远端研发项目负责人，按工号匹配本工作区活跃成员。
  owner 是必填：新建时为空 / 找不到用工作区所有者，更新时为空 / 找不到保持本地原值；项目负责人找不到留空
- 产品阶段、测试负责人、评审人、图标远端没有对应字段，同步不碰

首次要建两千多个产品、每条一个事务（本地实测约 6 s，库慢时会贴近请求超时），所以 ``run_async``：设置页按钮投 Celery 执行。
"""

from crum import impersonate
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from plane.app.serializers.product import IDENTIFIER_PATTERN
from plane.db.models import Product
from plane.utils.data_dictionary import (
    PRODUCT_DICTIONARY_FIELD_KEYS,
    PROJECT_CODE_DICTIONARY_KEY,
    ensure_system_dictionaries,
)
from plane.utils.exception_logger import log_exception

from .base import DIRECTION_PULL, IntegrationSpec
from .jiandaoyun import fetch_entry_rows
from .project_sync import (
    DETAIL_LIMIT,
    LOCAL_RENAME_SUFFIX,
    _date,
    _description_html,
    _dictionary_items,
    _ensure_dictionary_labels,
    _members_by_employee_id,
    _person,
    _text,
)

EXTERNAL_SOURCE = "jiandaoyun_product"

FIELD_IDENTIFIER = "kf_no"  # 开发编号 → identifier
FIELD_NAME = "pms_proj_name"  # PMS项目名称 → 名称（远端「产品名称」大多没填）
FIELD_CODE = "proj_no"  # 项目代号
FIELD_CATEGORY = "prd_ty"  # 产品类别
FIELD_STATUS = "prd_rd_stat"  # 产品研发状态
FIELD_HARDWARE_LEVEL = "harw_rd_lv"
FIELD_STRUCTURE_LEVEL = "stru_rd_lv"
FIELD_SOFTWARE_LEVEL = "sofw_rd_lv"
FIELD_START = "star_date"  # 启动日期
FIELD_MODEL = "inr_mono"  # 内部型号 → 产品型号
FIELD_EXTERNAL_MODEL = "ext_mono"  # 外部型号
FIELD_O_CLOSE = "o_pha_clos_date"  # O阶段关闭日期
FIELD_V_CLOSE = "v_pha_clos_date"  # V阶段关闭日期
FIELD_DESCRIPTION = "prd_desc"
FIELD_OWNER = "prd_duty_per"  # 产品负责人（人员字段 {name, username: 工号}）
FIELD_LEAD = "rd_proj_duty_per"  # 研发项目负责人
REMOTE_FIELDS = (
    FIELD_IDENTIFIER,
    FIELD_NAME,
    FIELD_CODE,
    FIELD_CATEGORY,
    FIELD_STATUS,
    FIELD_HARDWARE_LEVEL,
    FIELD_STRUCTURE_LEVEL,
    FIELD_SOFTWARE_LEVEL,
    FIELD_START,
    FIELD_MODEL,
    FIELD_EXTERNAL_MODEL,
    FIELD_O_CLOSE,
    FIELD_V_CLOSE,
    FIELD_DESCRIPTION,
    FIELD_OWNER,
    FIELD_LEAD,
)

REQUIRED_SETTINGS = (
    "JIANDAOYUN_API_BASE_URL",
    "JIANDAOYUN_API_TOKEN",
    "JIANDAOYUN_APP_KEY",
    "JIANDAOYUN_PRODUCT_APP_ID",
    "JIANDAOYUN_PRODUCT_ENTRY_ID",
)

NAME_MAX_LENGTH = Product._meta.get_field("name").max_length
IDENTIFIER_MAX_LENGTH = Product._meta.get_field("identifier").max_length
# 开发编号只允许字母数字，本地让位时没法用中文后缀
LOCAL_IDENTIFIER_SUFFIX = "L"

# 远端补值的字典字段；三个研发等级只匹配不补值
DICTIONARY_ADD_FIELDS = ("category", "status")
DICTIONARY_FIELDS = ("category", "status", "hardware_level", "structure_level", "software_level")
# 覆盖比较的字段；FK 比 *_id
SYNCED_FIELDS = (
    "name",
    "identifier",
    "code",
    *DICTIONARY_FIELDS,
    "owner",
    "project_lead",
    "start_date",
    "model_number",
    "external_model",
    "o_phase_close_date",
    "v_phase_close_date",
    "description_html",
)
FK_FIELDS = {*DICTIONARY_FIELDS, "owner", "project_lead"}


def normalize_rows(rows):
    """远端行 → 记录。缺名称 / 开发编号、开发编号不合本地格式、超长、远端内部重名 / 重号的跳过（后出现的那条）。"""
    records, skipped = [], []
    seen_names, seen_identifiers = set(), set()
    for row in rows:
        external_id = _text(row.get("_id"))
        name = _text(row.get(FIELD_NAME))
        identifier = _text(row.get(FIELD_IDENTIFIER)).upper()
        if not external_id or not name or not identifier:
            reason = "missing_key"
        elif not IDENTIFIER_PATTERN.match(identifier):
            reason = "invalid_identifier"
        elif len(name) > NAME_MAX_LENGTH:
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
        records.append(
            {
                "external_id": external_id,
                "name": name,
                "identifier": identifier,
                # 与 Product.save() 同口径：代号空时回落名称
                "code": _text(row.get(FIELD_CODE)) or name,
                "category": _text(row.get(FIELD_CATEGORY)),
                "status": _text(row.get(FIELD_STATUS)),
                "hardware_level": _text(row.get(FIELD_HARDWARE_LEVEL)),
                "structure_level": _text(row.get(FIELD_STRUCTURE_LEVEL)),
                "software_level": _text(row.get(FIELD_SOFTWARE_LEVEL)),
                "owner": _person(row.get(FIELD_OWNER)),
                "project_lead": _person(row.get(FIELD_LEAD)),
                "start_date": _date(row.get(FIELD_START)),
                "model_number": _text(row.get(FIELD_MODEL)) or None,
                "external_model": _text(row.get(FIELD_EXTERNAL_MODEL)) or None,
                "o_phase_close_date": _date(row.get(FIELD_O_CLOSE)),
                "v_phase_close_date": _date(row.get(FIELD_V_CLOSE)),
                "description_html": _description_html(_text(row.get(FIELD_DESCRIPTION))),
            }
        )
    return records, skipped


class _ProductSync:
    def __init__(self, workspace, actor, remote_identifiers):
        self.workspace = workspace
        # 更新 / 改名记在触发人名下；定时任务没有触发人，记在工作区所有者名下
        self.editor = actor or workspace.owner
        products = list(Product.objects.filter(workspace=workspace))
        self.bound = {p.external_id: p for p in products if p.external_source == EXTERNAL_SOURCE and p.external_id}
        self.by_name = {p.name: p for p in products}
        self.by_identifier = {p.identifier: p for p in products}
        # 本地让位时避开远端这一轮要用的开发编号
        self.remote_identifiers = remote_identifiers
        self.users = _members_by_employee_id(workspace)
        self.items = {
            field: _dictionary_items(workspace, PRODUCT_DICTIONARY_FIELD_KEYS[field]) for field in DICTIONARY_FIELDS
        }
        self.counts = {"created": 0, "updated": 0, "unchanged": 0}
        self.local_renamed, self.skipped = [], []
        self.unmatched_people = {}  # (工号, 姓名) -> {"owner": n, "project_lead": n}
        self.unmatched_values = {field: set() for field in DICTIONARY_FIELDS}

    # ---- 字段解析 ----

    def _user(self, person, role):
        employee_id, name = person
        if not employee_id:
            return None
        user = self.users.get(employee_id)
        if user is None:
            entry = self.unmatched_people.setdefault((employee_id, name), {"owner": 0, "project_lead": 0})
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
        desired = {field: record[field] for field in SYNCED_FIELDS if field not in FK_FIELDS}
        for field in DICTIONARY_FIELDS:
            desired[field] = self._item(field, record[field])
        desired["owner"] = self._user(record["owner"], "owner")
        desired["project_lead"] = self._user(record["project_lead"], "project_lead")
        return desired

    # ---- 单条处理 ----

    def _skip(self, record, reason):
        self.skipped.append({"name": record["name"], "identifier": record["identifier"], "reason": reason})

    def _free_identifier(self, identifier):
        """本地产品让出开发编号后用的新编号：末尾加 L，还撞就 L2、L3…（超长时截掉原编号的尾巴）。"""
        index = 1
        while True:
            suffix = LOCAL_IDENTIFIER_SUFFIX if index == 1 else f"{LOCAL_IDENTIFIER_SUFFIX}{index}"
            candidate = identifier[: IDENTIFIER_MAX_LENGTH - len(suffix)] + suffix
            if candidate not in self.by_identifier and candidate not in self.remote_identifiers:
                return candidate
            index += 1

    def _free_name(self, name):
        """本地产品让出名称后用的新名称：加「（本地）」，还撞就再加序号。"""
        base = name[: NAME_MAX_LENGTH - len(LOCAL_RENAME_SUFFIX) - 3] + LOCAL_RENAME_SUFFIX
        candidate, index = base, 2
        while candidate in self.by_name:
            candidate = f"{base}{index}"
            index += 1
        return candidate

    def _make_way(self, record, product):
        """远端要用的开发编号 / 名称被别的本地产品占着时，算出它们各自要改成什么。

        返回 ({产品: {字段: 新值}}, 跳过原因)。占着的是另一条远端记录同步来的产品就跳过：
        它这轮也让出的话下次同步能过；两条互换则每轮都跳过，靠跳过明细人工处理。
        """
        changes = {}
        for field, index, free in (
            ("identifier", self.by_identifier, self._free_identifier),
            ("name", self.by_name, self._free_name),
        ):
            holder = index.get(record[field])
            if holder is None or holder is product:
                continue
            if holder.external_source == EXTERNAL_SOURCE:
                return {}, f"{field}_taken_by_synced"
            changes.setdefault(holder, {})[field] = free(record[field])
        return changes, None

    def _rename_local(self, holder, fields):
        # 用 update 不动内存里的对象：同一事务里后面的新建 / 更新失败回滚时，索引和对象仍与库一致
        Product.objects.filter(pk=holder.pk).update(**fields, updated_at=timezone.now(), updated_by=self.editor)

    def _create(self, record, desired):
        owner = desired["owner"] or self.workspace.owner
        # 创建人 = 产品负责人
        with impersonate(owner):
            product = Product(
                workspace=self.workspace,
                external_source=EXTERNAL_SOURCE,
                external_id=record["external_id"],
                **{**desired, "owner": owner},
            )
            product.save()
        return product

    def _update(self, product, desired):
        changed = []
        for field in SYNCED_FIELDS:
            value = desired[field]
            if field == "owner" and value is None:
                # owner 必填：远端为空 / 找不到人时保持本地原值
                continue
            if field in FK_FIELDS:
                if getattr(product, f"{field}_id") != (value.id if value is not None else None):
                    changed.append(field)
            elif getattr(product, field) != value:
                changed.append(field)
        if not changed:
            return False
        for field in changed:
            setattr(product, field, desired[field])
        with impersonate(self.editor):
            product.save(update_fields=[*changed, "updated_at", "updated_by"])
        return True

    def apply(self, record):
        product = self.bound.get(record["external_id"])
        old_name = product.name if product is not None else None
        old_identifier = product.identifier if product is not None else None

        local_changes, skip_reason = self._make_way(record, product)
        if skip_reason:
            self._skip(record, skip_reason)
            return

        desired = self._desired(record)
        with transaction.atomic():
            for holder, fields in local_changes.items():
                self._rename_local(holder, fields)
            if product is None:
                product = self._create(record, desired)
                outcome = "created"
            else:
                outcome = "updated" if self._update(product, desired) else "unchanged"

        # 事务提交后再改内存对象与索引，失败时不会和库对不上
        for holder, fields in local_changes.items():
            for field, value in fields.items():
                index = self.by_identifier if field == "identifier" else self.by_name
                old_value = getattr(holder, field)
                del index[old_value]
                setattr(holder, field, value)
                index[value] = holder
                self.local_renamed.append({"field": field, "from": old_value, "to": value})
        if old_name is not None and old_name != product.name:
            self.by_name.pop(old_name, None)
        if old_identifier is not None and old_identifier != product.identifier:
            self.by_identifier.pop(old_identifier, None)
        self.by_name[product.name] = product
        self.by_identifier[product.identifier] = product
        self.bound[record["external_id"]] = product
        self.counts[outcome] += 1


def sync_products(workspace, actor=None):
    # HTTP 全部在事务之外
    rows, pages = fetch_entry_rows(
        settings.JIANDAOYUN_PRODUCT_APP_ID,
        settings.JIANDAOYUN_PRODUCT_ENTRY_ID,
        REMOTE_FIELDS,
    )
    records, skipped = normalize_rows(rows)

    ensure_system_dictionaries(workspace)
    dictionary_added = {
        field: _ensure_dictionary_labels(
            workspace, PRODUCT_DICTIONARY_FIELD_KEYS[field], [record[field] for record in records], actor
        )
        for field in DICTIONARY_ADD_FIELDS
    }
    dictionary_added["project_code"] = _ensure_dictionary_labels(
        workspace, PROJECT_CODE_DICTIONARY_KEY, [record["code"] for record in records], actor
    )

    sync = _ProductSync(workspace, actor, {record["identifier"] for record in records})
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
        key=lambda entry: -(entry["owner"] + entry["project_lead"]),
    )
    return {
        "remote_total": len(rows),
        **sync.counts,
        "local_renamed": len(sync.local_renamed),
        "skipped": len(sync.skipped),
        "remote_missing": len(remote_missing),
        "product_owner_unmatched": sum(entry["owner"] for entry in unmatched_people),
        "project_lead_unmatched": sum(entry["project_lead"] for entry in unmatched_people),
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


def _synced_products(workspace):
    return Product.objects.filter(workspace=workspace, external_source=EXTERNAL_SOURCE)


def _describe_target(workspace):
    return {"kind": "products", "synced_count": _synced_products(workspace).count()}


def _remote_info():
    return {
        "app_id": settings.JIANDAOYUN_PRODUCT_APP_ID,
        "entry_id": settings.JIANDAOYUN_PRODUCT_ENTRY_ID,
    }


SPEC = IntegrationSpec(
    key="jiandaoyun_product",
    name="产品",
    provider="jiandaoyun",
    direction=DIRECTION_PULL,
    description=(
        "从简道云「产品」表单同步产品：名称取 PMS项目名称，开发编号、项目代号等以简道云为准；"
        "每次以简道云为准覆盖，简道云删除的产品本地保留；不同步产品与项目的关联。"
        "每天定时同步一次（仅限已同步过的工作区），也可手动触发。"
    ),
    required_settings=REQUIRED_SETTINGS,
    run=sync_products,
    describe_target=_describe_target,
    remote_info=_remote_info,
    # 只在手动同步过的工作区每日跟进，别给每个工作区都建一遍
    schedule_filter=lambda workspace: _synced_products(workspace).exists(),
    run_async=True,
)
