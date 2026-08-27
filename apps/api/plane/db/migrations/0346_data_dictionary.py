import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

SORT_ORDER_STEP = 10000

LEVEL_ITEMS = ("P+", "P", "A", "B", "C", "裁剪")

# 与 plane/utils/data_dictionary.py::SYSTEM_DICTIONARIES 保持一致。
# 迁移不能 import 运行时代码（那边 import 了模型），所以这里复制一份；改规格要两处同步。
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


def seed_system_dictionaries(apps, schema_editor):
    """给存量工作区预置 6 个系统字典。新建的工作区由列表接口的 ensure_system_dictionaries 兜。

    历史模型带的是普通 Manager（看得见软删行），所以 get 时显式加 deleted_at__isnull=True；
    get_or_create 创建时会自动剥掉带 __ 的 lookup。
    """
    Workspace = apps.get_model("db", "Workspace")
    DataDictionary = apps.get_model("db", "DataDictionary")
    DataDictionaryItem = apps.get_model("db", "DataDictionaryItem")

    workspace_ids = (
        Workspace.objects.filter(deleted_at__isnull=True)
        .values_list("id", flat=True)
        .iterator()
    )
    for workspace_id in workspace_ids:
        for index, spec in enumerate(SYSTEM_DICTIONARIES):
            dictionary, created = DataDictionary.objects.get_or_create(
                workspace_id=workspace_id,
                key=spec["key"],
                deleted_at__isnull=True,
                defaults={
                    "name": spec["name"],
                    "description": spec["description"],
                    "is_system": True,
                    "sort_order": (index + 1) * SORT_ORDER_STEP,
                },
            )
            if created and spec["items"]:
                # bulk_create 绕过 save()：workspace 与 sort_order 显式给
                DataDictionaryItem.objects.bulk_create(
                    [
                        DataDictionaryItem(
                            dictionary=dictionary,
                            workspace_id=workspace_id,
                            label=label,
                            sort_order=(position + 1) * SORT_ORDER_STEP,
                        )
                        for position, label in enumerate(spec["items"])
                    ]
                )


def unseed_system_dictionaries(apps, schema_editor):
    # 反向时 0347 已回滚、Product 上没有 FK 引用，硬删安全（items 随 CASCADE 一起删）
    DataDictionary = apps.get_model("db", "DataDictionary")
    DataDictionary.objects.filter(
        is_system=True, key__in=[spec["key"] for spec in SYSTEM_DICTIONARIES]
    ).delete()


class Migration(migrations.Migration):
    """工作区级数据字典：DataDictionary（字典头）+ DataDictionaryItem（字典值）。

    产品的阶段 / 类别 / 状态 / 三个研发等级在 0347 里引用 DataDictionaryItem。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0345_requirement_per_change_approval"),
    ]

    operations = [
        migrations.CreateModel(
            name="DataDictionary",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("key", models.CharField(max_length=64, verbose_name="字典编码")),
                ("name", models.CharField(max_length=255, verbose_name="字典名称")),
                (
                    "description",
                    models.TextField(blank=True, default="", verbose_name="描述"),
                ),
                (
                    "is_system",
                    models.BooleanField(default=False, verbose_name="是否系统预置"),
                ),
                (
                    "sort_order",
                    models.FloatField(default=65535, verbose_name="排序"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="data_dictionaries",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "db_table": "data_dictionaries",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        migrations.CreateModel(
            name="DataDictionaryItem",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("label", models.CharField(max_length=255, verbose_name="字典值")),
                (
                    "sort_order",
                    models.FloatField(default=65535, verbose_name="排序"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "dictionary",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="db.datadictionary",
                        verbose_name="所属字典",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="data_dictionary_items",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "db_table": "data_dictionary_items",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="datadictionary",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "key"),
                name="data_dictionary_unique_workspace_key_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="datadictionary",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name"),
                name="data_dictionary_unique_workspace_name_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="datadictionaryitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("dictionary", "label"),
                name="data_dictionary_item_unique_dictionary_label_active",
            ),
        ),
        migrations.RunPython(
            seed_system_dictionaries, unseed_system_dictionaries, elidable=True
        ),
    ]
