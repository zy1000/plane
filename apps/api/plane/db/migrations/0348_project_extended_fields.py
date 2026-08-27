import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
from django.utils import timezone

BACKFILL_BATCH_SIZE = 500
SORT_ORDER_STEP = 10000

# 与 plane/utils/data_dictionary.py::SYSTEM_DICTIONARIES 的后三项保持一致。
# 迁移不能 import 运行时代码（那边 import 了模型），所以这里复制一份；改规格要两处同步。
# sort_order 从 6 起算：排在 0346 预置的 6 个产品字典之后，与运行时 ensure_system_dictionaries 的 (index+1)*STEP 一致。
PROJECT_DICTIONARY_INDEX_OFFSET = 6
PROJECT_SYSTEM_DICTIONARIES = (
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
)
PROJECT_DICTIONARY_KEYS = [spec["key"] for spec in PROJECT_SYSTEM_DICTIONARIES]


def seed_project_dictionaries(apps, schema_editor):
    """给存量工作区补 3 个项目字典。新建的工作区由列表接口的 ensure_system_dictionaries 兜。

    与 0346 的差别：0346 跑的时候用户还没有自建字典，这里必须防两种撞车 ——
    同 key（用户自建了 key=project_status 的字典）：跳过；
    同 name（撞 (workspace, name) 唯一约束）：name 加 key 后缀照建，与运行时 system_dictionary_name 一致，
    否则该工作区永远没有这个系统字典、项目也就永远建不了。
    历史模型带的是普通 Manager（看得见软删行），所以查重显式加 deleted_at__isnull=True。
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
        for offset, spec in enumerate(PROJECT_SYSTEM_DICTIONARIES):
            existing = DataDictionary.objects.filter(workspace_id=workspace_id, deleted_at__isnull=True)
            if existing.filter(key=spec["key"]).exists():
                continue
            name = spec["name"]
            if existing.filter(name=name).exists():
                name = f"{name}（{spec['key']}）"
                if existing.filter(name=name).exists():
                    continue
            dictionary = DataDictionary.objects.create(
                workspace_id=workspace_id,
                key=spec["key"],
                name=name,
                description=spec["description"],
                is_system=True,
                sort_order=(PROJECT_DICTIONARY_INDEX_OFFSET + offset + 1) * SORT_ORDER_STEP,
            )
            if spec["items"]:
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


def unseed_project_dictionaries(apps, schema_editor):
    # seed 是本迁移的第一个 operation，反向时最后跑：此时 RemoveField 已把三个 FK 列删掉，
    # 硬删字典不会撞 RESTRICT。只删 is_system 的三把 key，用户自建的同 key 字典不碰；items 随 CASCADE。
    DataDictionary = apps.get_model("db", "DataDictionary")
    DataDictionary.objects.filter(is_system=True, key__in=PROJECT_DICTIONARY_KEYS).delete()


def backfill_project_fields(apps, schema_editor):
    """code ← name（空则 identifier）；product_manager ← project_lead；start/end ← 迁移当天。

    负责人已不是工作区活跃成员的不抄进 product_manager：序列化器会校验成员资格，
    抄进去会让该项目的设置页改任何字段都 400。
    三个字典字段留空：存量项目下次编辑时前端强制补齐（同 Product 0347）。
    历史 Manager 是普通 Manager：软删行、模板项目（is_template=True）都看得见、都回填。
    条件唯一只看未软删行；name 在未软删行内本就唯一，code=name 正常不会撞，
    但 strip 后（"A" 与 "A "）或空 name 回落 identifier 时可能撞，这里对未软删行做一次兜底去重。
    """
    Project = apps.get_model("db", "Project")
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")
    # TIME_ZONE="UTC"，即 UTC 当天；整批同一天，别在循环里逐行取
    today = timezone.localdate()
    active_members = set(
        WorkspaceMember.objects.filter(is_active=True, deleted_at__isnull=True).values_list(
            "workspace_id", "member_id"
        )
    )
    fields = ["code", "product_manager", "start_date", "end_date"]
    seen_active = set()  # (workspace_id, code)
    pending = []
    for row in Project.objects.order_by("created_at", "id").iterator():
        code = (row.name or "").strip() or (row.identifier or "")
        if row.deleted_at is None:
            # 兜底后缀本身也可能撞（"Foo-BAR" 恰好是别人的名字），循环到唯一为止
            base, attempt = code, 0
            while (row.workspace_id, code) in seen_active:
                attempt += 1
                code = f"{base}-{row.identifier}" if attempt == 1 else f"{base}-{row.identifier}-{attempt}"
            seen_active.add((row.workspace_id, code))
        row.code = code
        lead_id = row.project_lead_id
        row.product_manager_id = (
            lead_id if lead_id and (row.workspace_id, lead_id) in active_members else None
        )
        row.start_date = today
        row.end_date = today
        pending.append(row)
        if len(pending) >= BACKFILL_BATCH_SIZE:
            Project.objects.bulk_update(pending, fields)
            pending = []
    if pending:
        Project.objects.bulk_update(pending, fields)


class Migration(migrations.Migration):
    """项目扩展字段：代号 / 所属BU / 研发产品经理 / 项目状态 / 项目类型 / 开始与完成日期。

    seed 放最前（反向时最后跑，FK 列已删，硬删字典安全）；
    NOT NULL 的 code 加到已有表：AddField 带 default="" + preserve_default=False，随后 RunPython 回填。
    code 的唯一 / 非空约束在 0349：回填改了 FK 列（product_manager，DEFERRABLE INITIALLY DEFERRED），
    同一事务里紧接 ALTER TABLE 会被 PG 以 "pending trigger events" 拒绝，所以约束拆到下一个迁移。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0347_product_extended_fields"),
    ]

    operations = [
        migrations.RunPython(
            seed_project_dictionaries, unseed_project_dictionaries, elidable=True
        ),
        migrations.AddField(
            model_name="project",
            name="code",
            field=models.CharField(default="", max_length=255, verbose_name="项目代号"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="project",
            name="business_unit",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects_by_business_unit",
                to="db.datadictionaryitem",
                verbose_name="所属BU",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="status",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects_by_status",
                to="db.datadictionaryitem",
                verbose_name="项目状态",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="project_type",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects_by_project_type",
                to="db.datadictionaryitem",
                verbose_name="项目类型",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="product_manager",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="product_manager_projects",
                to=settings.AUTH_USER_MODEL,
                verbose_name="研发产品经理",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="start_date",
            field=models.DateField(blank=True, null=True, verbose_name="开始日期"),
        ),
        migrations.AddField(
            model_name="project",
            name="end_date",
            field=models.DateField(blank=True, null=True, verbose_name="完成日期"),
        ),
        migrations.RunPython(
            backfill_project_fields, migrations.RunPython.noop, elidable=True
        ),
    ]
