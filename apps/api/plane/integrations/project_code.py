"""简道云「项目代号」表单的 proj_no → 数据字典 project_code。只新增，不删除、不改名。

Project.code 按 label 引用字典值，所以远端删了的代号本地照旧保留（汇总里以 local_only 报告）。
"""

from django.conf import settings
from django.db import transaction

from plane.db.models import DataDictionary, DataDictionaryItem
from plane.utils.data_dictionary import (
    PROJECT_CODE_DICTIONARY_KEY,
    bulk_create_items,
    ensure_system_dictionaries,
    normalize_labels,
)

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
        total_before = DataDictionaryItem.objects.filter(dictionary=dictionary).count()
        created, existing = bulk_create_items(dictionary, labels, actor=actor)

    return {
        "remote_total": len(raw_values),
        "unique": len(labels),
        "created": len(created),
        "existing": len(existing),
        "skipped_blank": skipped_blank,
        "skipped_too_long": skipped_too_long,
        # 本地有、远端没有的值：同步不删，只报告
        "local_only": total_before - len(existing),
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
