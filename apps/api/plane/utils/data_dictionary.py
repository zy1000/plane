"""数据字典：系统字典规格、幂等预置、值的归一化 / 批量写入、产品 / 项目引用检查与计数。

迁移里有 SYSTEM_DICTIONARIES 的副本（迁移不能 import 运行时代码）：产品六项在 0346，项目三项在 0348，
项目代号在 0355，改这里要同步改那边。
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q

from plane.db.models import DataDictionary, DataDictionaryItem, Product, Project

SORT_ORDER_STEP = 10000

LEVEL_ITEMS = ("P+", "P", "A", "B", "C", "裁剪")

SYSTEM_DICTIONARIES = (
    {"key": "product_stage", "name": "产品阶段", "description": "", "items": ()},
    {
        "key": "product_category",
        "name": "产品类别",
        "description": "",
        "items": (
            "01-三相CT表",
            "01-三相DC表",
            "01-三相VT表",
            "01-单相表",
            "02-中继器",
            "02-网关",
            "02-集中器",
            "03-其他模块",
            "03-无线模块",
            "03-电信模块",
            "03-载波模块",
            "04-Reader",
            "04-机械水表",
            "04-膜式气表",
            "04-超声波气表",
            "04-超声波水表",
            "05-CIU",
            "06-工具",
            "06-工具软件",
            "07-外置阀门",
            "07-断路器",
            "08-表箱",
            "09-纯软件",
            "10-系统",
            "2D-并网柜",
            "2I-储能一体柜",
            "11-其他",
            "2R-户储柜",
            "2P-电池包(电池PACK)",
            "2C-变流升压一体舱",
            "2B-电池储能柜",
            "2A-交流柜",
            "2H-高压盒",
            "3E-EMU(能量管理单元)",
            "3B-BMS(电池管理系统)",
            "99-非产品",
        ),
    },
    {
        "key": "product_status",
        "name": "产品状态",
        "description": "",
        "items": ("待启动", "活跃中", "维护", "已取消", "已暂停", "EOL"),
    },
    {
        "key": "product_hardware_level",
        "name": "硬件研发等级",
        "description": "",
        "items": LEVEL_ITEMS,
    },
    {
        "key": "product_structure_level",
        "name": "结构研发等级",
        "description": "",
        "items": LEVEL_ITEMS,
    },
    {
        "key": "product_software_level",
        "name": "软件研发等级",
        "description": "",
        "items": LEVEL_ITEMS,
    },
    # ---- 项目（0348）。追加在产品字典之后，enumerate 的下标决定 sort_order，别往中间插 ----
    {"key": "project_business_unit", "name": "所属BU", "description": "", "items": ()},
    {
        "key": "project_status",
        "name": "项目状态",
        "description": "",
        "items": ("待启动", "活跃中", "维护", "已完成", "已暂停", "已取消"),
    },
    {
        "key": "project_type",
        "name": "项目类型",
        "description": "",
        "items": ("开拓型项目", "交付型项目", "预研型项目", "维护型项目"),
    },
    # ---- 项目代号（0355）：Project.code 仍是字符串列，取值必须是这个字典里某个值的 label；无预置值 ----
    {"key": "project_code", "name": "项目代号", "description": "", "items": ()},
)
SYSTEM_DICTIONARY_KEYS = tuple(spec["key"] for spec in SYSTEM_DICTIONARIES)

# Product 字段 -> 系统字典 key。ProductSerializer 校验、删除前引用检查、测试 helper 三处共用。
PRODUCT_DICTIONARY_FIELD_KEYS = {
    "stage": "product_stage",
    "category": "product_category",
    "status": "product_status",
    "hardware_level": "product_hardware_level",
    "structure_level": "product_structure_level",
    "software_level": "product_software_level",
}

# Project 字段 -> 系统字典 key。ProjectSerializer 校验、删除前引用检查、测试 helper 三处共用。
PROJECT_DICTIONARY_FIELD_KEYS = {
    "business_unit": "project_business_unit",
    "status": "project_status",
    "project_type": "project_type",
}

# Project.code 不是 FK：存的是 project_code 字典里某个值的 label，所以不进上面的映射（引用检查按 label 另查）。
PROJECT_CODE_DICTIONARY_KEY = "project_code"

# 字典值列长；批量写入前先按它过滤，混进一条超长的整批 bulk_create 都会 DataError
LABEL_MAX_LENGTH = DataDictionaryItem._meta.get_field("label").max_length
BULK_BATCH_SIZE = 500


def system_dictionary_name(workspace, spec):
    """用户自建了同名字典时，系统字典的 name 加 key 后缀。

    否则 (workspace, name) 唯一约束会把系统字典永远挡在门外 —— 产品 / 项目的必填字典字段就再也填不了。
    """
    name = spec["name"]
    taken = (
        DataDictionary.objects.filter(workspace=workspace, name=name)
        .exclude(key=spec["key"])
        .exists()
    )
    return f"{name}（{spec['key']}）" if taken else name


def ensure_system_dictionaries(workspace):
    """幂等：只补缺失的系统字典；已存在的一律不碰（不补值、不覆盖用户改过的 name / description）。

    字典列表与创建接口每次都会调它，所以新建的工作区不需要 signal。
    """
    existing = set(
        DataDictionary.objects.filter(
            workspace=workspace, key__in=SYSTEM_DICTIONARY_KEYS
        ).values_list("key", flat=True)
    )
    for index, spec in enumerate(SYSTEM_DICTIONARIES):
        if spec["key"] in existing:
            continue
        name = system_dictionary_name(workspace, spec)
        try:
            # 字典头与预置值同一事务：并发首次调用要么看到完整字典，要么看不到
            with transaction.atomic():
                dictionary, created = DataDictionary.objects.get_or_create(
                    workspace=workspace,
                    key=spec["key"],
                    defaults={
                        "name": name,
                        "description": spec["description"],
                        "is_system": True,
                        "sort_order": (index + 1) * SORT_ORDER_STEP,
                    },
                )
                if created and spec["items"]:
                    # bulk_create 绕过 save()：workspace 与 sort_order 必须显式给
                    DataDictionaryItem.objects.bulk_create(
                        [
                            DataDictionaryItem(
                                dictionary=dictionary,
                                workspace=workspace,
                                label=label,
                                sort_order=(position + 1) * SORT_ORDER_STEP,
                            )
                            for position, label in enumerate(spec["items"])
                        ]
                    )
        except IntegrityError:
            # 并发首次调用彼此撞 key / name：跳过，下次调用会补上，别让列表接口 500
            continue


def is_project_code_in_dictionary(workspace_id, code):
    """项目代号是否是本工作区 project_code 字典里的某个值（label 精确匹配）。"""
    return DataDictionaryItem.objects.filter(
        workspace_id=workspace_id,
        dictionary__key=PROJECT_CODE_DICTIONARY_KEY,
        label=code,
    ).exists()


def classify_labels(raw_values):
    """strip、去 NUL、去空、超长跳过、按出现顺序去重。

    不做大小写 / 全半角归一：字典唯一约束与 validate_label 都是精确匹配，这里口径要一致。
    返回 (labels, skipped)，skipped 每项 {"label", "reason": "blank" | "too_long"}。
    """
    labels, seen, skipped = [], set(), []
    for value in raw_values:
        if not isinstance(value, str):
            skipped.append({"label": "", "reason": "blank"})
            continue
        # Postgres 拒绝 NUL 字节
        label = value.replace("\x00", "").strip()
        if not label:
            skipped.append({"label": "", "reason": "blank"})
            continue
        if len(label) > LABEL_MAX_LENGTH:
            skipped.append({"label": label[:LABEL_MAX_LENGTH], "reason": "too_long"})
            continue
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels, skipped


def normalize_labels(raw_values):
    """classify_labels 的计数版：返回 (labels, skipped_blank, skipped_too_long)，简道云同步用。"""
    labels, skipped = classify_labels(raw_values)
    blank = sum(1 for entry in skipped if entry["reason"] == "blank")
    return labels, blank, len(skipped) - blank


def bulk_create_items(dictionary, labels, actor=None):
    """把字典里还没有的 label 追加到末尾，返回 (created_items, existing_labels)。

    调用方须处在 atomic 内并持有 dictionary 的 select_for_update 行锁（并发串行化，差集才精确）。
    bulk_create 绕过 save()：workspace / sort_order / created_by 都要显式给；ignore_conflicts 只是并发单条插入的兜底，
    撞约束的行不会写库但实例仍有 uuid，所以真正写进去的行要按 label 回查。
    """
    existing = set(
        DataDictionaryItem.objects.filter(dictionary=dictionary).values_list("label", flat=True)
    )
    to_create = [label for label in labels if label not in existing]
    existing_labels = [label for label in labels if label in existing]
    if not to_create:
        return [], existing_labels
    base = (
        DataDictionaryItem.objects.filter(dictionary=dictionary).aggregate(largest=Max("sort_order"))["largest"]
        or 0
    )
    DataDictionaryItem.objects.bulk_create(
        [
            DataDictionaryItem(
                dictionary=dictionary,
                workspace_id=dictionary.workspace_id,
                label=label,
                sort_order=base + (index + 1) * SORT_ORDER_STEP,
                created_by_id=getattr(actor, "id", None),
            )
            for index, label in enumerate(to_create)
        ],
        ignore_conflicts=True,
        batch_size=BULK_BATCH_SIZE,
    )
    created = list(
        DataDictionaryItem.objects.filter(dictionary=dictionary, label__in=to_create).order_by(
            "sort_order", "created_at", "id"
        )
    )
    return created, existing_labels


def _reference_filter(field_keys, item_ids):
    item_ids = list(item_ids)
    query = Q()
    for field in field_keys:
        query |= Q(**{f"{field}__in": item_ids})
    return query


def product_reference_filter(item_ids):
    return _reference_filter(PRODUCT_DICTIONARY_FIELD_KEYS, item_ids)


def project_reference_filter(item_ids):
    return _reference_filter(PROJECT_DICTIONARY_FIELD_KEYS, item_ids)


def _is_referenced(item_ids, code_labels=(), workspace_id=None):
    item_ids = list(item_ids)
    # all_objects：软删的产品 / 项目（含模板项目）仍持有 FK，硬删字典值会撞 DB 的 RESTRICT
    if item_ids and (
        Product.all_objects.filter(product_reference_filter(item_ids)).exists()
        or Project.all_objects.filter(project_reference_filter(item_ids)).exists()
    ):
        return True
    # project_code 按 label 引用（字符串列，无 DB 约束）：只算活跃非模板项目，且必须按工作区过滤，label 会跨工作区撞
    code_labels = list(code_labels)
    if not code_labels:
        return False
    return Project.objects.filter(workspace_id=workspace_id, code__in=code_labels).exists()


def _code_labels(dictionary, labels):
    return labels if dictionary.key == PROJECT_CODE_DICTIONARY_KEY else ()


def is_item_in_use(item):
    return _is_referenced([item.id], _code_labels(item.dictionary, [item.label]), item.workspace_id)


def is_dictionary_in_use(dictionary):
    rows = list(
        DataDictionaryItem.all_objects.filter(dictionary=dictionary).values_list("id", "label")
    )
    if not rows:
        return False
    return _is_referenced(
        [item_id for item_id, _ in rows],
        _code_labels(dictionary, [label for _, label in rows]),
        dictionary.workspace_id,
    )


def _field_for_key(key):
    """字典 key → (模型, FK 字段名, 展示实体)。project_code 不是 FK，由调用方单独处理。"""
    for field, dictionary_key in PRODUCT_DICTIONARY_FIELD_KEYS.items():
        if dictionary_key == key:
            return Product, field, "product"
    for field, dictionary_key in PROJECT_DICTIONARY_FIELD_KEYS.items():
        if dictionary_key == key:
            return Project, field, "project"
    return None, None, None


def dictionary_item_usage(dictionary):
    """设置页「引用」列：每个值被多少活跃产品 / 项目引用（count），以及会不会挡住删除（blocking，与 is_item_in_use 同口径）。

    返回 {"entity": "product" | "project" | None, "items": [{"item_id", "count", "blocking"}]}；自定义字典没有引用方，items 为空。
    """
    rows = list(DataDictionaryItem.objects.filter(dictionary=dictionary).values_list("id", "label"))
    if dictionary.key == PROJECT_CODE_DICTIONARY_KEY:
        hits = {
            row["code"]: row["n"]
            for row in Project.objects.filter(
                workspace_id=dictionary.workspace_id, code__in=[label for _, label in rows]
            )
            .values("code")
            .annotate(n=Count("id"))
        }
        return {
            "entity": "project",
            "items": [
                {"item_id": str(item_id), "count": hits.get(label, 0), "blocking": label in hits}
                for item_id, label in rows
            ],
        }
    model, field, entity = _field_for_key(dictionary.key)
    if model is None:
        return {"entity": None, "items": []}
    item_ids = [item_id for item_id, _ in rows]
    active = {
        row[field]: row["n"]
        for row in model.objects.filter(workspace_id=dictionary.workspace_id, **{f"{field}__in": item_ids})
        .values(field)
        .annotate(n=Count("id"))
    }
    # 展示计数只算活跃对象；删除闸门看 all_objects（软删 / 模板仍持 FK）
    blocking = set(model.all_objects.filter(**{f"{field}__in": item_ids}).values_list(field, flat=True).distinct())
    return {
        "entity": entity,
        "items": [
            {"item_id": str(item_id), "count": active.get(item_id, 0), "blocking": item_id in blocking}
            for item_id, _ in rows
        ],
    }
