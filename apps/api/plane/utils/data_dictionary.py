"""数据字典：系统字典规格、幂等预置、产品引用检查。

迁移 0346 里有一份 SYSTEM_DICTIONARIES 的副本（迁移不能 import 运行时代码），改这里要同步改那边。
"""

from django.db import IntegrityError, transaction
from django.db.models import Q

from plane.db.models import DataDictionary, DataDictionaryItem, Product

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
        try:
            # 字典头与预置值同一事务：并发首次调用要么看到完整字典，要么看不到
            with transaction.atomic():
                dictionary, created = DataDictionary.objects.get_or_create(
                    workspace=workspace,
                    key=spec["key"],
                    defaults={
                        "name": spec["name"],
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
            # (workspace, name) 撞上用户自建的同名字典：跳过，别让列表接口 500
            continue


def product_reference_filter(item_ids):
    item_ids = list(item_ids)
    query = Q()
    for field in PRODUCT_DICTIONARY_FIELD_KEYS:
        query |= Q(**{f"{field}__in": item_ids})
    return query


def is_item_in_use(item):
    # all_objects：软删的产品仍持有 FK，硬删字典值会撞 DB 的 RESTRICT
    return Product.all_objects.filter(product_reference_filter([item.id])).exists()


def is_dictionary_in_use(dictionary):
    item_ids = list(
        DataDictionaryItem.all_objects.filter(dictionary=dictionary).values_list(
            "id", flat=True
        )
    )
    if not item_ids:
        return False
    return Product.all_objects.filter(product_reference_filter(item_ids)).exists()
