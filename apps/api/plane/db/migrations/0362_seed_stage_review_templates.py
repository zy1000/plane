# 存量工作区回填：product_stage 的 10 个阶段值 + 66 行阶段评审模板。
#
# 规格与运行时共用同一份（plane/db/seed_data/stage_review_templates.py 是零 import 的纯
# 常量模块，迁移期 import 安全）。这是对「迁移里复制一份规格」那条约定的有意例外，理由
# 与纪律写在该模块的 docstring 里。
from django.db import migrations
from django.db.models import Max

from plane.db.seed_data.stage_review_templates import (
    PRODUCT_STAGE_DICTIONARY_INDEX,
    PRODUCT_STAGE_DICTIONARY_KEY,
    PRODUCT_STAGE_DICTIONARY_NAME,
    PRODUCT_STAGE_LABELS,
    SORT_ORDER_STEP,
    iter_template_rows,
)


def _stage_dictionary(DataDictionary, workspace_id):
    """取 product_stage 字典头；没有就建（撞 key 跳过、撞 name 加后缀，口径同 0348 / 0355）。

    存量工作区不一定有：ensure_system_dictionaries 是懒加载的，从没打开过数据字典设置页
    的工作区一本字典都没有。历史模型带普通 Manager（看得见软删行），查重显式加
    deleted_at__isnull=True。
    """
    existing = DataDictionary.objects.filter(
        workspace_id=workspace_id, deleted_at__isnull=True
    )
    dictionary = existing.filter(key=PRODUCT_STAGE_DICTIONARY_KEY).first()
    if dictionary is not None:
        return dictionary
    name = PRODUCT_STAGE_DICTIONARY_NAME
    if existing.filter(name=name).exists():
        name = f"{name}（{PRODUCT_STAGE_DICTIONARY_KEY}）"
        if existing.filter(name=name).exists():
            return None
    return DataDictionary.objects.create(
        workspace_id=workspace_id,
        key=PRODUCT_STAGE_DICTIONARY_KEY,
        name=name,
        description="",
        is_system=True,
        sort_order=(PRODUCT_STAGE_DICTIONARY_INDEX + 1) * SORT_ORDER_STEP,
    )


def _stage_items(DataDictionaryItem, dictionary, workspace_id):
    """缺哪补哪、追加到末尾（口径同运行时 bulk_create_items）。返回 label -> item。"""
    existing = set(
        DataDictionaryItem.objects.filter(
            dictionary=dictionary, deleted_at__isnull=True
        ).values_list("label", flat=True)
    )
    missing = [label for label in PRODUCT_STAGE_LABELS if label not in existing]
    if missing:
        base = (
            DataDictionaryItem.objects.filter(dictionary=dictionary).aggregate(
                largest=Max("sort_order")
            )["largest"]
            or 0
        )
        # bulk_create 绕过 save()：workspace 与 sort_order 必须显式给
        DataDictionaryItem.objects.bulk_create(
            [
                DataDictionaryItem(
                    dictionary=dictionary,
                    workspace_id=workspace_id,
                    label=label,
                    sort_order=base + (index + 1) * SORT_ORDER_STEP,
                )
                for index, label in enumerate(missing)
            ]
        )
    return {
        item.label: item
        for item in DataDictionaryItem.objects.filter(
            dictionary=dictionary,
            deleted_at__isnull=True,
            label__in=PRODUCT_STAGE_LABELS,
        )
    }


def seed_stage_review_templates(apps, schema_editor):
    """给存量工作区补阶段值 + 模板。

    幂等锚点与运行时 ensure_stage_review_templates 一致：工作区下已有任意模板行就整体
    跳过（历史 Manager 看得见软删行，正是想要的口径）。新建的工作区由
    WorkSpaceViewSet.create 里的 ensure 兜。
    """
    Workspace = apps.get_model("db", "Workspace")
    DataDictionary = apps.get_model("db", "DataDictionary")
    DataDictionaryItem = apps.get_model("db", "DataDictionaryItem")
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")

    workspace_ids = (
        Workspace.objects.filter(deleted_at__isnull=True)
        .values_list("id", flat=True)
        .iterator()
    )
    for workspace_id in workspace_ids:
        if StageReviewTemplate.objects.filter(workspace_id=workspace_id).exists():
            continue
        dictionary = _stage_dictionary(DataDictionary, workspace_id)
        if dictionary is None:
            continue
        stage_by_label = _stage_items(DataDictionaryItem, dictionary, workspace_id)

        top_level = {}
        roots = []
        children = []
        for row in iter_template_rows():  # 先顶层、后子节点
            stage = stage_by_label.get(row["stage_label"])
            if stage is None:
                continue
            node = StageReviewTemplate(
                workspace_id=workspace_id,
                stage_id=stage.id,
                kind=row["kind"],
                title=row["title"],
                initiator_role=row["initiator_role"],
                leader_role=row["leader_role"],
                auditor_role=row["auditor_role"],
                sort_order=row["sort_order"],
            )
            if row["parent_title"] is None:
                top_level[(row["stage_label"], row["title"])] = node
                roots.append(node)
            else:
                parent = top_level.get((row["stage_label"], row["parent_title"]))
                if parent is None:
                    continue
                # id 是 uuid4 默认值，__init__ 时就有，父入库前就能引用
                node.parent_id = parent.id
                children.append(node)
        StageReviewTemplate.objects.bulk_create(roots)
        StageReviewTemplate.objects.bulk_create(children)


def unseed_stage_review_templates(apps, schema_editor):
    """反向：删掉规格里的模板行；阶段字典值留着。

    先删子后删父，避免删父时 CASCADE 撞到被裁剪单 PROTECT 的子节点。字典值不删 ——
    它们可能已经被产品的 stage 外键引用（RESTRICT 会拒），留着也无害。
    """
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")

    titles_by_stage = {}
    for row in iter_template_rows():
        titles_by_stage.setdefault(row["stage_label"], set()).add(row["title"])

    for parent_isnull in (False, True):  # 子先删
        nodes = StageReviewTemplate.objects.filter(
            parent__isnull=parent_isnull,
            stage__dictionary__key=PRODUCT_STAGE_DICTIONARY_KEY,
        ).select_related("stage")
        for node in nodes:
            if node.title in titles_by_stage.get(node.stage.label, ()):
                node.delete()


class Migration(migrations.Migration):
    """必须排在 0361 之后：O-SV1 / O-C / O-T1 三个阶段的评审活动没有父评审，
    0361 放宽之前的 CheckConstraint 会直接拒。
    """

    dependencies = [("db", "0361_relax_stage_review_kind_parent")]

    operations = [
        migrations.RunPython(
            seed_stage_review_templates,
            unseed_stage_review_templates,
            elidable=True,
        ),
    ]
