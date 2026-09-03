"""简道云「项目代号」表单的 proj_no → 数据字典 project_code。只新增，不删除、不改名。

Project.code 按 label 引用字典值，所以远端删了的代号本地照旧保留（汇总里以 local_only 报告）。
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Max

from plane.db.models import DataDictionary, DataDictionaryItem
from plane.db.models.data_dictionary import SORT_ORDER_STEP
from plane.utils.data_dictionary import PROJECT_CODE_DICTIONARY_KEY, ensure_system_dictionaries

from .base import DIRECTION_PULL, IntegrationError, IntegrationSpec
from .jiandaoyun import fetch_entry_field_values

REMOTE_FIELD = "proj_no"
REQUIRED_SETTINGS = (
    "JIANDAOYUN_API_BASE_URL",
    "JIANDAOYUN_API_TOKEN",
    "JIANDAOYUN_APP_KEY",
    "JIANDAOYUN_PROJECT_CODE_APP_ID",
    "JIANDAOYUN_PROJECT_CODE_ENTRY_ID",
)
LABEL_MAX_LENGTH = DataDictionaryItem._meta.get_field("label").max_length
BULK_BATCH_SIZE = 500


def normalize_labels(raw_values):
    """strip、去 NUL、去空、超长跳过、按出现顺序去重。

    不做大小写 / 全半角归一：字典唯一约束与 validate_label 都是精确匹配，这里口径要一致。
    返回 (labels, skipped_blank, skipped_too_long)。
    """
    labels, seen, skipped_blank, skipped_too_long = [], set(), 0, 0
    for value in raw_values:
        if not isinstance(value, str):
            skipped_blank += 1
            continue
        # Postgres 拒绝 NUL 字节，混进一条整批 bulk_create 都会 DataError
        label = value.replace("\x00", "").strip()
        if not label:
            skipped_blank += 1
            continue
        if len(label) > LABEL_MAX_LENGTH:
            skipped_too_long += 1
            continue
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels, skipped_blank, skipped_too_long


def sync_project_codes(workspace, actor=None):
    # HTTP 全部在事务之外
    raw_values, pages = fetch_entry_field_values(
        settings.JIANDAOYUN_PROJECT_CODE_APP_ID,
        settings.JIANDAOYUN_PROJECT_CODE_ENTRY_ID,
        REMOTE_FIELD,
    )
    labels, skipped_blank, skipped_too_long = normalize_labels(raw_values)

    with transaction.atomic():
        ensure_system_dictionaries(workspace)
        # 行锁把并发同步串行化，created 才能按 to_create 精确计数；bulk_create 的 ignore_conflicts 只是兜底
        dictionary = (
            DataDictionary.objects.select_for_update()
            .filter(workspace=workspace, key=PROJECT_CODE_DICTIONARY_KEY)
            .first()
        )
        if dictionary is None:
            # ensure 会吞并发首建 / 同名撞库的 IntegrityError，不能假设一定有
            raise IntegrationError(
                "INTEGRATION_TARGET_MISSING", f"dictionary '{PROJECT_CODE_DICTIONARY_KEY}' not found"
            )
        existing = set(
            DataDictionaryItem.objects.filter(dictionary=dictionary).values_list("label", flat=True)
        )
        to_create = [label for label in labels if label not in existing]
        base = (
            DataDictionaryItem.objects.filter(dictionary=dictionary).aggregate(largest=Max("sort_order"))["largest"]
            or 0
        )
        # bulk_create 绕过 save()：workspace / sort_order / created_by 都要显式给
        DataDictionaryItem.objects.bulk_create(
            [
                DataDictionaryItem(
                    dictionary=dictionary,
                    workspace=workspace,
                    label=label,
                    sort_order=base + (index + 1) * SORT_ORDER_STEP,
                    created_by_id=getattr(actor, "id", None),
                )
                for index, label in enumerate(to_create)
            ],
            ignore_conflicts=True,
            batch_size=BULK_BATCH_SIZE,
        )

    return {
        "remote_total": len(raw_values),
        "unique": len(labels),
        "created": len(to_create),
        "existing": len(labels) - len(to_create),
        "skipped_blank": skipped_blank,
        "skipped_too_long": skipped_too_long,
        "local_only": len(existing - set(labels)),
        "pages": pages,
    }


def _remote_info():
    return {
        "field": REMOTE_FIELD,
        "app_id": settings.JIANDAOYUN_PROJECT_CODE_APP_ID,
        "entry_id": settings.JIANDAOYUN_PROJECT_CODE_ENTRY_ID,
    }


SPEC = IntegrationSpec(
    key="jiandaoyun_project_code",
    name="项目代号",
    provider="jiandaoyun",
    direction=DIRECTION_PULL,
    description="从简道云「项目代号」表单拉取 proj_no，补充到数据字典「项目代号」；只新增，不删除、不改名。",
    required_settings=REQUIRED_SETTINGS,
    run=sync_project_codes,
    target_dictionary_key=PROJECT_CODE_DICTIONARY_KEY,
    remote_info=_remote_info,
)
