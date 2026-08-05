# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""按 ``entity_type`` 与作用域字段推导 FileAsset 应挂载的 FilePath 节点；
并据此派生 MinIO 物理 key。

完整路径完全由 FilePath 节点链派生（``FileAsset.asset`` 字段已废弃）：

- 每段路径取自节点的 ``entity_id``（业务实体节点）或 slug（分类节点）；
- 末段为 ``FileAsset.filename``，由 ``dedup_filename`` 在同 path 下去重，
  遇到同名 active 文件自动追加 ``(1)`` / ``(2)`` 后缀。

业务实体（issue / page / cycle / ...）尚未创建时，FileAsset 先挂到
``WORKSPACE -> PROJECT? -> TEMP_CATEGORY('_temp') -> TEMP({asset_id})`` 链上，
其 MinIO key 形如 ``{ws_id}/{proj_id}/_temp/{asset_id}/{filename}``。后续
bulk 绑定接口会通过 :func:`rebind_asset_to_path` 把对象 copy 到正式路径并
清理 temp 节点。

层级规则（与 minio key 段位严格一一对应）：

- ``USER_AVATAR`` / ``USER_COVER``  → ``UserRoot('用户') -> User``
- ``WORKSPACE_LOGO``                → ``Workspace`` 节点本身
- ``PRODUCT_DESCRIPTION``           → ``Workspace -> Product``
- ``REQUIREMENT_ATTACHMENT``        → ``Workspace -> 需求 -> Requirement``
- ``PROJECT_COVER`` / ``PROJECT_DESCRIPTION`` / ``CASE_MINDMAP``
                                    → ``Workspace -> Project``（无中间分类层）
- ``PROJECT_FILESTORE``             → ``Workspace -> Project -> filestore``（固定根目录）
- ``ISSUE_ATTACHMENT`` / ``ISSUE_DESCRIPTION`` / ``COMMENT_DESCRIPTION``
                                    → ``Workspace -> Project -> 工作项 -> Issue``
- ``PAGE_DESCRIPTION``              → ``Workspace -> Project -> 页面 -> Page``
- ``DRAFT_ISSUE_*``                 → ``Workspace -> Project -> 草稿 -> DraftIssue``
- ``CASE_ATTACHMENT`` / ``TEST_CASE_COMMENT_DESCRIPTION``
                                    → ``Workspace -> Project -> 测试用例 -> TestCase``
- ``CYCLE_FILE``                    → ``Workspace -> Project -> 迭代 -> Cycle``
- ``RELEASE_FILE`` / ``RELEASE_COMMENT_DESCRIPTION``
                                    → ``Workspace -> Project -> 发布 -> Release``
- ``PLAN_CASE_RECORD_FILE``         → ``Workspace -> Project -> 用例执行 -> PlanCaseRecord``
                                      （展示名取 ``plan_case.case.name``）
"""

from __future__ import annotations

import os
from typing import List, Optional

from django.db import IntegrityError, transaction

from plane.utils.asset_path import CATEGORY_SLUG_MAP, ENTITY_TO_CATEGORY, _sanitize_filename


USER_ROOT_NAME = "用户"
USER_ROOT_SLUG = "user"
TEMP_CATEGORY_NAME = "_temp"
FILESTORE_ROOT_NAME = "filestore"


class _Resolver:
    """单次解析中的小型节点缓存，避免迁移脚本里同一 workspace/project 反复查表。"""

    def __init__(self, FilePathModel=None):
        if FilePathModel is None:
            from plane.db.models.asset import FilePath

            FilePathModel = FilePath
        self.FilePath = FilePathModel
        # (parent_id or None, entity_type, entity_id or None) -> FilePath 实例
        self._cache: dict = {}

    # ------------------------------------------------------------------ helpers

    def _get_or_create_node(
        self, *, parent, entity_type: str, entity_id, display_name: str
    ):
        """按 ``(parent, entity_type, entity_id)`` 唯一键 get-or-create FilePath 节点。

        - ``display_name`` 与已有节点不同则同步更新（重命名场景的兜底）。
        - 触发唯一约束冲突时回查（并发上传同一实体）。
        """
        key = (
            parent.pk if parent is not None else None,
            entity_type,
            str(entity_id) if entity_id is not None else None,
        )
        if key in self._cache:
            node = self._cache[key]
            self._maybe_sync_name(node, display_name)
            return node

        lookup = {
            "parent": parent,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id is not None else None,
        }
        node = self.FilePath.objects.filter(**lookup).first()
        if node is None:
            try:
                with transaction.atomic():
                    node = self.FilePath.objects.create(
                        name=display_name or entity_type,
                        **lookup,
                    )
            except IntegrityError:
                node = self.FilePath.objects.filter(**lookup).first()
                if node is None:
                    raise

        self._maybe_sync_name(node, display_name)
        self._cache[key] = node
        return node

    def _maybe_sync_name(self, node, display_name: Optional[str]) -> None:
        if not display_name:
            return
        if node.name == display_name:
            return
        node.name = display_name
        self.FilePath.objects.filter(pk=node.pk).update(name=display_name)

    def _category_node(self, *, parent, entity_type: str):
        """在 ``parent`` 下 get-or-create 一个分类节点（``entity_id=NULL``）。

        分类节点的中文展示名固定来自 :data:`CATEGORY_SLUG_MAP`。
        """
        category = ENTITY_TO_CATEGORY.get(entity_type)
        if not category:
            return parent
        display_name = CATEGORY_SLUG_MAP[category][0]
        return self._get_or_create_node(
            parent=parent,
            entity_type=category,
            entity_id=None,
            display_name=display_name,
        )

    def _temp_node(self, *, parent_for_category, asset):
        """业务实体缺失时在 ``parent_for_category`` 下挂 ``TEMP_CATEGORY -> TEMP(asset_id)``。

        TEMP 节点用 ``asset.id``（或为空时生成一次性 uuid）做 entity_id，保证不同 asset
        各自独立子目录，避免临时文件互相覆盖。
        """
        cat_node = self._get_or_create_node(
            parent=parent_for_category,
            entity_type="TEMP_CATEGORY",
            entity_id=None,
            display_name=TEMP_CATEGORY_NAME,
        )
        asset_id = getattr(asset, "pk", None) or getattr(asset, "id", None)
        if not asset_id:
            # 极少数 asset 还未持久化、强制 resolve 的场景：用一次性 uuid 兜底
            from uuid import uuid4
            asset_id = uuid4().hex
        return self._get_or_create_node(
            parent=cat_node,
            entity_type="TEMP",
            entity_id=str(asset_id),
            display_name=TEMP_CATEGORY_NAME,
        )

    # --------------------------------------------------------------- resolution

    def resolve_for_asset(self, asset) -> Optional[object]:
        et = getattr(asset, "entity_type", None) or ""
        if not et:
            return None

        if et in ("USER_AVATAR", "USER_COVER"):
            return self._user_chain(asset)

        workspace = self._get_related(asset, "workspace")
        if workspace is None:
            # workspace 都拿不到时无法构造任何路径，返回 None；调用方应保留 path=NULL
            return None
        ws_node = self._get_or_create_node(
            parent=None,
            entity_type="WORKSPACE",
            entity_id=workspace.pk,
            display_name=getattr(workspace, "name", "") or "",
        )

        if et == "WORKSPACE_LOGO":
            return ws_node

        if et == "PRODUCT_DESCRIPTION":
            product = self._get_related(asset, "product")
            if product is None:
                return self._temp_node(parent_for_category=ws_node, asset=asset)
            return self._get_or_create_node(
                parent=ws_node,
                entity_type="PRODUCT",
                entity_id=product.pk,
                display_name=getattr(product, "name", "") or "",
            )

        if et == "REQUIREMENT_ATTACHMENT":
            # 附件挂在网格的归属方（产品或标准库）上而不是单条需求：新行在上传那一刻
            # 还没有 id，而草稿物化会重建行，挂在行上的路径会跟着失效。
            owner_id = getattr(asset, "entity_identifier", None)
            if not owner_id:
                return self._temp_node(parent_for_category=ws_node, asset=asset)
            from plane.db.models import Product, RequirementLibrary

            owner = (
                Product.objects.filter(id=owner_id, workspace=workspace).first()
                or RequirementLibrary.objects.filter(
                    id=owner_id, workspace=workspace
                ).first()
            )
            if owner is None:
                return self._temp_node(parent_for_category=ws_node, asset=asset)
            category_node = self._category_node(
                parent=ws_node, entity_type=et
            )
            return self._get_or_create_node(
                parent=category_node,
                entity_type="REQUIREMENT",
                entity_id=owner.pk,
                display_name=getattr(owner, "name", "") or "",
            )

        project = self._get_related(asset, "project")
        if project is None:
            # 业务对项目缺失的容忍度因 entity_type 而异：
            # - PROJECT_DESCRIPTION 编辑器在 project 未创建时插图 → 走 WORKSPACE 级 temp
            # - PLAN_CASE_RECORD_FILE 必须有 project 才能定位执行记录 → 同样走 temp
            #   后续 bulk 绑定时再迁到正式路径
            return self._temp_node(parent_for_category=ws_node, asset=asset)
        proj_node = self._get_or_create_node(
            parent=ws_node,
            entity_type="PROJECT",
            entity_id=project.pk,
            display_name=getattr(project, "name", "") or "",
        )

        # 项目级直接资源：不加分类层
        if et in (
            "PROJECT_COVER",
            "PROJECT_DESCRIPTION",
            "CASE_MINDMAP",
        ):
            return proj_node

        # 项目文件库：固定挂在 ``Workspace -> Project -> FILESTORE_ROOT`` 下；
        # 该层在 MinIO key 中映射为固定段 ``filestore``，便于页面限制可见根路径。
        if et == "PROJECT_FILESTORE":
            return self._get_or_create_node(
                parent=proj_node,
                entity_type="FILESTORE_ROOT",
                entity_id=project.pk,
                display_name=FILESTORE_ROOT_NAME,
            )

        # 业务实体节点：先挂分类节点，再挂业务节点
        cat_node = self._category_node(parent=proj_node, entity_type=et)

        if et in ("ISSUE_ATTACHMENT", "ISSUE_DESCRIPTION"):
            issue = self._get_related(asset, "issue")
            if issue is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="ISSUE",
                entity_id=issue.pk,
                display_name=getattr(issue, "name", "") or "",
            )

        if et == "COMMENT_DESCRIPTION":
            leaf = self._comment_chain(asset, cat_node)
            if leaf is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return leaf

        if et == "PAGE_DESCRIPTION":
            page = self._get_related(asset, "page")
            if page is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="PAGE",
                entity_id=page.pk,
                display_name=getattr(page, "name", "") or "",
            )

        if et in ("DRAFT_ISSUE_ATTACHMENT", "DRAFT_ISSUE_DESCRIPTION"):
            draft = self._get_related(asset, "draft_issue")
            if draft is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="DRAFT_ISSUE",
                entity_id=draft.pk,
                display_name=getattr(draft, "name", "") or "",
            )

        if et == "CASE_ATTACHMENT":
            case = self._get_related(asset, "case")
            if case is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="TESTCASE",
                entity_id=case.pk,
                display_name=getattr(case, "name", "") or "",
            )

        if et == "CYCLE_FILE":
            cycle = self._get_related(asset, "cycle")
            if cycle is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="CYCLE",
                entity_id=cycle.pk,
                display_name=getattr(cycle, "name", "") or "",
            )

        # 迭代评论中的内联图片：复用与 CYCLE_FILE 相同的目录节点（Workspace -> Project ->
        # 迭代 -> Cycle），上传期靠 cycle_id 定位父级，与具体 cycle_comment 解耦，
        # 避免评论尚未创建时无法定路径。
        if et == "CYCLE_COMMENT_DESCRIPTION":
            cycle = self._get_related(asset, "cycle")
            if cycle is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            cycle_category = self._category_node(
                parent=proj_node, entity_type="CYCLE_FILE"
            )
            return self._get_or_create_node(
                parent=cycle_category,
                entity_type="CYCLE",
                entity_id=cycle.pk,
                display_name=getattr(cycle, "name", "") or "",
            )

        if et == "RELEASE_FILE":
            release = self._get_related(asset, "release")
            if release is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="RELEASE",
                entity_id=release.pk,
                display_name=getattr(release, "name", "") or "",
            )

        # 发布评论中的内联图片：复用与 RELEASE_FILE 相同的目录节点（Workspace -> Project ->
        # 发布 -> Release），上传期靠 release_id 定位父级，与具体 release_comment 解耦，
        # 避免评论尚未创建时无法定路径。
        if et == "RELEASE_COMMENT_DESCRIPTION":
            release = self._get_related(asset, "release")
            if release is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            release_category = self._category_node(
                parent=proj_node, entity_type="RELEASE_FILE"
            )
            return self._get_or_create_node(
                parent=release_category,
                entity_type="RELEASE",
                entity_id=release.pk,
                display_name=getattr(release, "name", "") or "",
            )

        # 用例评论中的内联图片：复用与 CASE_ATTACHMENT 相同的目录节点（Workspace -> Project ->
        # 测试用例 -> TestCase），上传期靠 case_id 定位父级，与具体 test_case_comment 解耦，
        # 避免评论尚未创建时无法定路径。
        if et == "TEST_CASE_COMMENT_DESCRIPTION":
            case = self._get_related(asset, "case")
            if case is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            case_category = self._category_node(
                parent=proj_node, entity_type="CASE_ATTACHMENT"
            )
            return self._get_or_create_node(
                parent=case_category,
                entity_type="TESTCASE",
                entity_id=case.pk,
                display_name=getattr(case, "name", "") or "",
            )

        if et == "PLAN_CASE_RECORD_FILE":
            record = self._get_related(asset, "plan_case_record")
            if record is None:
                return self._temp_node(parent_for_category=proj_node, asset=asset)
            display = self._plan_case_record_name(record)
            return self._get_or_create_node(
                parent=cat_node,
                entity_type="PLAN_CASE_RECORD",
                entity_id=record.pk,
                display_name=display,
            )

        return None

    # ----------------------------------------------------------------- subtrees

    def _user_chain(self, asset):
        user = self._get_related(asset, "user") or self._get_related(asset, "created_by")
        if user is None:
            return None
        user_root = self._get_or_create_node(
            parent=None,
            entity_type="USER_ROOT",
            entity_id=None,
            display_name=USER_ROOT_NAME,
        )
        return self._get_or_create_node(
            parent=user_root,
            entity_type="USER",
            entity_id=user.pk,
            display_name=self._user_display_name(user),
        )

    def _comment_chain(self, asset, parent_node):
        comment = self._get_related(asset, "comment")
        issue_id = getattr(comment, "issue_id", None) if comment is not None else None
        if not issue_id:
            return None
        issue = getattr(comment, "issue", None)
        issue_name = getattr(issue, "name", "") if issue is not None else ""
        if not issue_name:
            # 兜底单次查询 Issue.name，避免触发 select_related 失败时回不到名字
            try:
                from plane.db.models.issue import Issue

                issue_name = (
                    Issue.objects.filter(pk=issue_id)
                    .values_list("name", flat=True)
                    .first()
                    or ""
                )
            except Exception:
                issue_name = ""
        return self._get_or_create_node(
            parent=parent_node,
            entity_type="ISSUE",
            entity_id=issue_id,
            display_name=issue_name,
        )

    # ------------------------------------------------------------------- utils

    @staticmethod
    def _get_related(asset, field: str):
        """安全地取 FK 关联对象，避免 RelatedObjectDoesNotExist。"""
        try:
            return getattr(asset, field, None)
        except Exception:
            return None

    @staticmethod
    def _user_display_name(user) -> str:
        return (
            getattr(user, "display_name", None)
            or getattr(user, "email", None)
            or str(user.pk)
        )

    @staticmethod
    def _plan_case_record_name(record) -> str:
        plan_case = getattr(record, "plan_case", None)
        if plan_case is None:
            return ""
        case = getattr(plan_case, "case", None)
        if case is None:
            return ""
        return getattr(case, "name", "") or ""


_SELECT_RELATED_FIELDS = (
    "workspace",
    "project",
    "product",
    "issue",
    "comment",
    "comment__issue",
    "page",
    "case",
    "cycle",
    "release",
    "draft_issue",
    "user",
    "plan_case_record",
    "plan_case_record__plan_case",
    "plan_case_record__plan_case__case",
)


def resolve_path_for_asset(asset, FilePathModel=None):
    """运行时入口：返回 FileAsset 应该挂载的 FilePath 叶子节点。

    无足够上下文（连 workspace 都拿不到）时返回 ``None``，调用方需保留 ``path=NULL``，
    后续 bulk 绑定接口会再次触发 ``save()`` 自动补齐。
    """
    return _Resolver(FilePathModel).resolve_for_asset(asset)


def build_resolver(FilePathModel=None) -> "_Resolver":
    """供迁移/重算脚本复用同一份层级规则与节点缓存。"""
    return _Resolver(FilePathModel)


# ---------------------------------------------------------------------------
# MinIO key 派生
# ---------------------------------------------------------------------------


def _key_segment_for(node) -> str:
    """单个 FilePath 节点对应的 MinIO key 段。"""

    et = getattr(node, "entity_type", "") or ""
    eid = getattr(node, "entity_id", None)

    if et == "USER_ROOT":
        return USER_ROOT_SLUG
    if et == "FILESTORE_ROOT":
        return FILESTORE_ROOT_NAME
    if et == "USER_FOLDER":
        folder_name = _sanitize_filename(getattr(node, "name", "") or "")
        return folder_name or "folder"
    if et in CATEGORY_SLUG_MAP:
        return CATEGORY_SLUG_MAP[et][1]
    # WORKSPACE / PROJECT / ISSUE / PAGE / CYCLE / RELEASE / DRAFT_ISSUE /
    # TESTCASE / PLAN_CASE_RECORD / USER / TEMP 等所有"业务实体"节点
    return str(eid) if eid is not None else ""


def _walk_to_root(leaf) -> List[object]:
    """从 leaf 沿 ``parent`` 上溯到根；返回从 root 到 leaf 的节点列表。"""

    chain: List[object] = []
    node = leaf
    while node is not None:
        chain.append(node)
        node = getattr(node, "parent", None)
    chain.reverse()
    return chain


def compute_storage_key(asset) -> str:
    """给定 FileAsset，返回完整 MinIO 对象 key。

    ``asset.path`` 缺失或 ``asset.filename`` 为空时返回空串。
    """
    leaf = getattr(asset, "path", None)
    filename = getattr(asset, "filename", "") or ""
    if leaf is None or not filename:
        return ""
    segments = [_key_segment_for(node) for node in _walk_to_root(leaf)]
    segments = [s for s in segments if s]
    segments.append(filename)
    return "/".join(segments)


def compute_storage_key_for_path(leaf, filename: str) -> str:
    """无 FileAsset 实例时，给定 FilePath 叶子 + 文件名，派生 MinIO key。

    迁移脚本与 ``rebind_asset_to_path`` 在 DB 写入前预演新 key 时使用。
    """
    if leaf is None or not filename:
        return ""
    segments = [_key_segment_for(node) for node in _walk_to_root(leaf)]
    segments = [s for s in segments if s]
    segments.append(filename)
    return "/".join(segments)


# ---------------------------------------------------------------------------
# 同名文件去重
# ---------------------------------------------------------------------------


def dedup_filename(
    path_id, original_name: str, *, exclude_asset_id=None, extra_taken: Optional[set] = None
) -> str:
    """同 path 下未删除的 FileAsset 已占用 ``original_name`` 时，依次尝试加 ``(1)``/``(2)`` 后缀。

    - ``exclude_asset_id``：排除自身（更新场景）
    - ``extra_taken``：调用方在同一批操作中已分配但还没落库的 filename 集合，
      防止 backfill/迁移脚本在 bulk 阶段产生 race
    """

    from plane.db.models.asset import FileAsset

    name = (original_name or "").strip() or "file"
    qs = FileAsset.objects.filter(path_id=path_id, is_deleted=False)
    if exclude_asset_id is not None:
        qs = qs.exclude(pk=exclude_asset_id)
    existing = set(qs.values_list("filename", flat=True))
    if extra_taken:
        existing |= set(extra_taken)

    if name not in existing:
        return name
    base, ext = os.path.splitext(name)
    counter = 1
    while True:
        candidate = f"{base}({counter}){ext}"
        if candidate not in existing:
            return candidate
        counter += 1


# ---------------------------------------------------------------------------
# 重算 / 重绑
# ---------------------------------------------------------------------------


def recompute_paths_for_assets(asset_queryset) -> int:
    """重新解析一批 FileAsset 的 FilePath，并通过 ``bulk_update`` 落库。

    用于在 bulk 绑定接口里 ``.update(entity_id=...)`` 之后，
    因为 ``QuerySet.update`` 绕过了 ``FileAsset.save()`` 钩子，需要显式刷新 path。
    """
    from plane.db.models.asset import FileAsset

    resolver = _Resolver()
    pending: list = []
    for asset in asset_queryset.select_related(*_SELECT_RELATED_FIELDS):
        try:
            leaf = resolver.resolve_for_asset(asset)
        except Exception:
            leaf = None
        if leaf is None:
            continue
        if asset.path_id == leaf.pk:
            continue
        asset.path_id = leaf.pk
        pending.append(asset)
    if pending:
        FileAsset.objects.bulk_update(pending, ["path"], batch_size=500)
    return len(pending)


def rebind_asset_to_path(
    asset,
    *,
    storage,
    bucket: Optional[str] = None,
    resolver: Optional["_Resolver"] = None,
) -> bool:
    """把单个 FileAsset 从当前 path 迁到 resolver 重新算出的正式 path。

    主要服务两类调用：
    1. v2 bulk_assign：绑定 issue/page 等后，原 temp 路径的对象需要搬到正式目录；
    2. migrate_asset_paths 命令：把历史路径搬到 FilePath 派生的新规则下。

    步骤：
    - resolve 新 path（业务实体仍缺失时落回 temp）
    - dedup filename 拿到新落点
    - S3 copy 老 key → 新 key（含 metadata）
    - 更新 DB path + filename
    - 删旧 key
    - 若旧 path 是 TEMP 节点且无引用，则一并删除 TEMP 节点

    返回 True 表示发生了路径变化（即使物理 copy 失败也算 False）。
    """
    if resolver is None:
        resolver = _Resolver()
    new_leaf = resolver.resolve_for_asset(asset)
    if new_leaf is None:
        return False

    old_leaf = asset.path
    old_key = compute_storage_key(asset)

    new_filename = dedup_filename(
        new_leaf.pk, asset.filename or "file", exclude_asset_id=asset.pk
    )
    new_key = compute_storage_key_for_path(new_leaf, new_filename)
    if not new_key or new_key == old_key:
        # 路径已经在正确位置，只是确保 path FK 也指向了 new_leaf
        if asset.path_id != new_leaf.pk:
            asset.path = new_leaf
            asset.filename = new_filename
            asset.save(update_fields=["path", "filename"])
        return False

    # 把 asset.path/filename 先切到 new_leaf，让 build_asset_metadata 能算新 display-path
    asset.path = new_leaf
    asset.filename = new_filename
    asset.save(update_fields=["path", "filename"])

    from plane.utils.asset_upload import build_asset_metadata

    metadata = build_asset_metadata(asset)
    content_type = ""
    if isinstance(asset.attributes, dict):
        content_type = asset.attributes.get("type") or ""

    copy_resp = storage.copy_object(
        old_key, new_key, metadata=metadata, content_type=content_type or None
    )
    if copy_resp is None:
        # copy 失败，回滚 DB 防止脏数据
        asset.path = old_leaf
        asset.filename = asset.filename  # filename 在我们这里没变，无需回滚
        # 回滚 path 必须显式 save，否则 in-memory 与 DB 不一致
        if old_leaf is not None:
            asset.path = old_leaf
            asset.save(update_fields=["path"])
        return False

    try:
        if hasattr(storage, "delete_all_object_versions"):
            storage.delete_all_object_versions(old_key)
            from django.utils import timezone

            asset.versions.filter(deleted_at__isnull=True).update(
                deleted_at=timezone.now(),
                is_current=False,
            )
            from plane.utils.asset_versions import record_latest_object_version

            record_latest_object_version(asset=asset, storage=storage)
        else:
            storage.delete_files(object_names=[old_key])
    except Exception:
        pass

    cleanup_temp_path(old_leaf)
    return True


def cleanup_temp_path(old_path) -> None:
    """若 ``old_path`` 是 TEMP 叶子且无 FileAsset 引用，则物理删除。

    TEMP_CATEGORY 共享节点保留不删；只清子叶。
    """
    if old_path is None:
        return
    if getattr(old_path, "entity_type", "") != "TEMP":
        return
    from plane.db.models.asset import FileAsset

    if FileAsset.objects.filter(path_id=old_path.pk).exists():
        return
    try:
        old_path.delete()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 展示路径
# ---------------------------------------------------------------------------


def materialize_display_path(
    leaf,
    *,
    include_user_root: bool = True,
) -> str:
    """从 ``leaf`` 沿 ``parent`` 上溯到 root，拼出 ``工作区A/项目A/工作项/工作项B`` 字符串。

    - 包含中间层分类节点（``工作项`` / ``草稿`` / ``页面`` / ...），方便运维直观阅读。
    - ``include_user_root=False`` 可隐藏 ``用户`` 顶级节点，仅保留 ``张三/...`` 形态。
    """
    if leaf is None:
        return ""
    chain: List[str] = []
    node = leaf
    while node is not None:
        et = getattr(node, "entity_type", "") or ""
        if et == "USER_ROOT" and not include_user_root:
            node = getattr(node, "parent", None)
            continue
        name = (getattr(node, "name", "") or "").strip()
        if name:
            chain.append(name)
        node = getattr(node, "parent", None)
    chain.reverse()
    return "/".join(chain)
