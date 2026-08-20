# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""复制测试用例时让资产（附件 + 富文本内图片）跟随复制。

复制链路（copy_case / 模块复制 / 从模板导入）先同步复制用例行，
再逐对投递本任务异步复制 FileAsset 行与 S3 对象。范式参照
``plane/bgtasks/copy_s3_object.py``（页面复制）。

语义约定：
- 附件（CASE_ATTACHMENT，绑 case）→ 复制并绑到新用例，project 取目标库的 project_id
  （模板库为 None，路径解析见 ``plane/utils/file_path.py`` 的模板分支）。
- 富文本图片（HTML 里 ``<image-component src="{asset_id}">``）→ 目标库有 project 时
  复制为 PROJECT_DESCRIPTION + 目标 project（与项目模式贴图语义一致）；目标是模板库
  时复制为 CASE_ATTACHMENT 且不绑 case（与模板模式贴图语义一致，落 workspace _temp）。
- 只有 S3 copy 成功的资产才回写 src；失败的保持指向源资产（不劣于现状）。
- 附件段幂等（新用例已有附件则跳过）；富文本段 at-least-once，重复投递只会产生
  孤儿资产（占存储），HTML 不会指向不存在的资产。
"""

from celery import shared_task

from plane.bgtasks.copy_s3_object import extract_asset_ids, replace_asset_ids
from plane.db.models import FileAsset, TestCase
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import build_asset_metadata
from plane.utils.exception_logger import log_exception

IMAGE_TAG = "image-component"
RICH_TEXT_FIELDS = ("precondition", "text_description", "text_result", "remark")


def _copy_one_asset(
    storage,
    original,
    *,
    workspace_id,
    created_by_id,
    entity_type,
    case_id=None,
    project_id=None,
):
    """建行（save() 钩子自动解析路径并对同名 dedup）→ S3 copy。

    S3 copy 失败返回 None，行保持 is_uploaded=False，交由
    delete_unuploaded_file_asset 日常任务回收。
    """
    duplicated = FileAsset.objects.create(
        attributes={
            "name": original.attributes.get("name"),
            "type": original.attributes.get("type"),
            "size": original.attributes.get("size"),
        },
        size=original.size,
        workspace_id=workspace_id,
        created_by_id=created_by_id,
        entity_type=entity_type,
        case_id=case_id,
        project_id=project_id,
        storage_metadata=original.storage_metadata,
    )
    result = storage.copy_object(
        original.storage_key,
        duplicated.storage_key,
        metadata=build_asset_metadata(duplicated),
        content_type=original.attributes.get("type"),
    )
    if result is None:
        return None
    return duplicated


def _copy_attachments(storage, source, new, workspace_id, target_project_id, actor_id):
    # 幂等护栏：新用例已有附件说明本段已跑过（或用户已手动传），跳过
    if FileAsset.objects.filter(
        case_id=new.id,
        entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
        is_deleted=False,
    ).exists():
        return

    originals = FileAsset.objects.filter(
        case_id=source.id,
        workspace_id=workspace_id,
        entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
        is_uploaded=True,
        is_deleted=False,
    )
    copied_ids = []
    for original in originals:
        try:
            duplicated = _copy_one_asset(
                storage,
                original,
                workspace_id=workspace_id,
                created_by_id=actor_id,
                entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
                case_id=new.id,
                project_id=target_project_id,
            )
            if duplicated is not None:
                copied_ids.append(duplicated.id)
        except Exception as e:
            log_exception(e)
    if copied_ids:
        FileAsset.objects.filter(pk__in=copied_ids).update(is_uploaded=True)


def _collect_rich_text_asset_ids(case):
    """从四个富文本字段 + steps（list of dict）里提取 image-component 的 asset id。"""
    asset_ids = []
    for field in RICH_TEXT_FIELDS:
        html = getattr(case, field, None)
        if html:
            asset_ids.extend(extract_asset_ids(html, IMAGE_TAG))
    if isinstance(case.steps, list):
        for step in case.steps:
            if not isinstance(step, dict):
                continue
            for key in ("description", "result"):
                html = step.get(key)
                if html:
                    asset_ids.extend(extract_asset_ids(html, IMAGE_TAG))
    # 保序去重
    return list(dict.fromkeys(asset_ids))


def _replace_if_referenced(html, duplicated, old_ids):
    """仅当该 HTML 确实引用了被复制的资产时才做替换，
    避免 BeautifulSoup 对无关字段的 HTML 规范化造成无意义漂移。"""
    if not html:
        return html
    referenced = set(extract_asset_ids(html, IMAGE_TAG)) & old_ids
    if not referenced:
        return html
    return replace_asset_ids(html, IMAGE_TAG, duplicated)


def _copy_rich_text_assets(storage, new, workspace_id, target_project_id, actor_id):
    asset_ids = _collect_rich_text_asset_ids(new)
    if not asset_ids:
        return

    # 源资产可能是 PROJECT_DESCRIPTION（项目用例贴图）或 CASE_ATTACHMENT（模板用例贴图），
    # 故不按 entity_type / project 过滤，只锁同 workspace
    originals = FileAsset.objects.filter(
        id__in=asset_ids,
        workspace_id=workspace_id,
        is_uploaded=True,
        is_deleted=False,
    )
    duplicated = []
    copied_ids = []
    for original in originals:
        try:
            if target_project_id:
                dup = _copy_one_asset(
                    storage,
                    original,
                    workspace_id=workspace_id,
                    created_by_id=actor_id,
                    entity_type=FileAsset.EntityTypeContext.PROJECT_DESCRIPTION,
                    project_id=target_project_id,
                )
            else:
                dup = _copy_one_asset(
                    storage,
                    original,
                    workspace_id=workspace_id,
                    created_by_id=actor_id,
                    entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
                )
            if dup is None:
                continue
            copied_ids.append(dup.id)
            duplicated.append(
                {"old_asset_id": str(original.id), "new_asset_id": str(dup.id)}
            )
        except Exception as e:
            log_exception(e)
    if copied_ids:
        FileAsset.objects.filter(pk__in=copied_ids).update(is_uploaded=True)
    if not duplicated:
        return

    old_ids = {item["old_asset_id"] for item in duplicated}
    update_kwargs = {}
    for field in RICH_TEXT_FIELDS:
        html = getattr(new, field, None)
        new_html = _replace_if_referenced(html, duplicated, old_ids)
        if new_html != html:
            update_kwargs[field] = new_html

    if isinstance(new.steps, list):
        steps_changed = False
        new_steps = []
        for step in new.steps:
            if isinstance(step, dict):
                new_step = dict(step)
                for key in ("description", "result"):
                    html = new_step.get(key)
                    replaced = _replace_if_referenced(html, duplicated, old_ids)
                    if replaced != html:
                        new_step[key] = replaced
                        steps_changed = True
                new_steps.append(new_step)
            else:
                new_steps.append(step)
        if steps_changed:
            update_kwargs["steps"] = new_steps

    if update_kwargs:
        # queryset.update()：不触发 save() 钩子（避免 code 重生成）、不动 updated_at、不建版本
        TestCase.objects.filter(pk=new.id).update(**update_kwargs)


@shared_task
def copy_case_assets(source_case_id, new_case_id, actor_id):
    """把源用例的附件与富文本图片复制到新用例上（DB 行 + S3 对象）。"""
    try:
        source = (
            TestCase.objects.filter(pk=source_case_id)
            .select_related("repository")
            .first()
        )
        new = (
            TestCase.objects.filter(pk=new_case_id)
            .select_related("repository")
            .first()
        )
        if source is None or new is None:
            return

        workspace_id = new.repository.workspace_id
        target_project_id = new.repository.project_id  # 模板库为 None
        storage = S3Storage()

        _copy_attachments(
            storage, source, new, workspace_id, target_project_id, actor_id
        )
        _copy_rich_text_assets(
            storage, new, workspace_id, target_project_id, actor_id
        )
    except Exception as e:
        log_exception(e)
