# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""把业务实体的重命名同步到对应 FilePath 节点的 ``name`` 字段。

监听 9 个会出现在 FilePath 树里的业务模型：``Workspace`` / ``Project`` /
``Issue`` / ``DraftIssue`` / ``Page`` / ``TestCase`` / ``Cycle`` / ``Release`` /
``User``。``PlanCaseRecord`` 节点的展示名取自上游 ``TestCase.name``，因此 TestCase
改名时会再级联刷新所有引用它的 PLAN_CASE_RECORD FilePath 节点。

仅在 ORM ``.save()`` 路径下生效；若有 ``QuerySet.update(name=...)`` 改名，需单独
触发一次刷新（暂不在本模块处理）。
"""

from __future__ import annotations

from typing import Callable, Optional

from django.apps import apps
from django.db.models.signals import post_save
from django.dispatch import receiver


def _update_filepath_name(entity_type: str, entity_pk, name: Optional[str]) -> None:
    if not name:
        return
    FilePath = apps.get_model("db", "FilePath")
    if FilePath is None:
        return
    FilePath.objects.filter(
        entity_type=entity_type,
        entity_id=str(entity_pk),
    ).exclude(name=name).update(name=name)


def _cascade_plan_case_records_for_case(case_instance) -> None:
    """TestCase 改名时，把所有引用它的 PlanCaseRecord 对应的 FilePath 节点 name 同步过去。

    PlanCaseRecord -> PlanCase -> case (FK)，所以一条 case 可能对应多个 record；
    用 values_list("pk") 只查 ID，再批量 update FilePath.name，避免拉对象。
    """
    if not case_instance:
        return
    name = (getattr(case_instance, "name", None) or "").strip()
    if not name:
        return
    try:
        PlanCaseRecord = apps.get_model("db", "PlanCaseRecord")
    except LookupError:
        return
    if PlanCaseRecord is None:
        return
    record_ids = list(
        PlanCaseRecord.objects.filter(plan_case__case_id=case_instance.pk)
        .values_list("pk", flat=True)
    )
    if not record_ids:
        return
    FilePath = apps.get_model("db", "FilePath")
    if FilePath is None:
        return
    FilePath.objects.filter(
        entity_type="PLAN_CASE_RECORD",
        entity_id__in=[str(pk) for pk in record_ids],
    ).exclude(name=name).update(name=name)


def _make_receiver(entity_type: str, name_getter: Callable, *, cascade: Optional[Callable] = None):
    def _handler(sender, instance, created, **kwargs):
        if created:
            return
        try:
            name = name_getter(instance)
        except Exception:
            name = None
        _update_filepath_name(entity_type, instance.pk, name)
        if cascade is not None:
            try:
                cascade(instance)
            except Exception:
                pass

    return _handler


_SYNC_MAP = [
    ("db.Workspace", "WORKSPACE", lambda i: i.name, None),
    ("db.Project", "PROJECT", lambda i: i.name, None),
    ("db.Issue", "ISSUE", lambda i: i.name, None),
    ("db.DraftIssue", "DRAFT_ISSUE", lambda i: i.name, None),
    ("db.Page", "PAGE", lambda i: i.name, None),
    ("db.TestCase", "TESTCASE", lambda i: i.name, _cascade_plan_case_records_for_case),
    ("db.Cycle", "CYCLE", lambda i: i.name, None),
    ("db.Release", "RELEASE", lambda i: i.name, None),
    (
        "db.User",
        "USER",
        lambda i: getattr(i, "display_name", None) or getattr(i, "email", None) or str(i.pk),
        None,
    ),
]


for _sender, _entity_type, _name_getter, _cascade in _SYNC_MAP:
    receiver(post_save, sender=_sender, weak=False)(
        _make_receiver(_entity_type, _name_getter, cascade=_cascade)
    )
