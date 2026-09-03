"""集成注册表：新增集成 = 新模块写一个 SPEC，追加到 INTEGRATIONS。"""

from django.db.models import Count

from plane.db.models import DataDictionary

from . import project_code
from .base import get_last_sync

INTEGRATIONS = (project_code.SPEC,)
_BY_KEY = {spec.key: spec for spec in INTEGRATIONS}


def get_integration(key):
    return _BY_KEY.get(key)


def _describe_target(spec, workspace):
    if not spec.target_dictionary_key:
        return None
    # 名称读 DB 行：用户可能改过名，或系统字典带了「（key）」后缀
    dictionary = (
        DataDictionary.objects.filter(workspace=workspace, key=spec.target_dictionary_key)
        .annotate(item_count=Count("items"))
        .first()
    )
    return {
        "dictionary_key": spec.target_dictionary_key,
        "dictionary_id": str(dictionary.id) if dictionary else None,
        "dictionary_name": dictionary.name if dictionary else None,
        "item_count": dictionary.item_count if dictionary else 0,
    }


def describe_integration(spec, workspace):
    """给设置页的一条集成信息：静态描述 + 目标字典现状 + 配置状态 + 上次同步快照。"""
    missing = spec.missing_settings()
    return {
        "key": spec.key,
        "name": spec.name,
        "provider": spec.provider,
        "direction": spec.direction,
        "description": spec.description,
        "target": _describe_target(spec, workspace),
        "remote": spec.remote_info() if spec.remote_info else None,
        "is_configured": not missing,
        "missing_settings": missing,
        "last_sync": get_last_sync(workspace.id, spec.key),
    }
