# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django import
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from mptt.models import MPTTModel, TreeForeignKey

# Module import
from .base import BaseModel


def file_size(value):
    if value.size > settings.FILE_SIZE_LIMIT:
        raise ValidationError("File too large. Size should not exceed 5 MB.")


def get_upload_path(instance, filename):
    """历史迁移兼容入口（仅供旧 migration import）。

    说明：
    - 0016/0075/0078 等历史迁移在模块导入阶段会引用
      ``plane.db.models.asset.get_upload_path``；
    - 新架构下 ``FileAsset.asset`` 已移除，运行时对象 key 统一由
      ``FileAsset.path + FileAsset.filename`` 派生（``storage_key``），
      本函数不参与新逻辑。
    """

    from plane.utils.asset_path import _sanitize_filename

    safe_name = _sanitize_filename(filename)
    workspace_id = getattr(instance, "workspace_id", None)
    project_id = getattr(instance, "project_id", None)

    parts = []
    if workspace_id:
        parts.append(str(workspace_id))
    if project_id:
        parts.append(str(project_id))

    issue_id = getattr(instance, "issue_id", None)
    page_id = getattr(instance, "page_id", None)
    draft_issue_id = getattr(instance, "draft_issue_id", None)
    case_id = getattr(instance, "case_id", None)
    cycle_id = getattr(instance, "cycle_id", None)
    release_id = getattr(instance, "release_id", None)
    plan_case_record_id = getattr(instance, "plan_case_record_id", None)
    user_id = getattr(instance, "user_id", None)

    if issue_id:
        parts.extend(["issues", str(issue_id)])
    elif page_id:
        parts.extend(["pages", str(page_id)])
    elif draft_issue_id:
        parts.extend(["drafts", str(draft_issue_id)])
    elif case_id:
        parts.extend(["cases", str(case_id)])
    elif cycle_id:
        parts.extend(["cycles", str(cycle_id)])
    elif release_id:
        parts.extend(["releases", str(release_id)])
    elif plan_case_record_id:
        parts.extend(["plan-case-records", str(plan_case_record_id)])
    elif user_id:
        parts.extend(["user", str(user_id)])

    parts.append(safe_name)
    return "/".join(parts)


class FilePath(MPTTModel):

    class EntityType(models.TextChoices):
        # 业务实体节点：name 取业务对象的可读名（workspace.name、project.name、issue.name 等）
        WORKSPACE = "WORKSPACE"
        PROJECT = "PROJECT"
        FILESTORE_ROOT = "FILESTORE_ROOT"
        USER_FOLDER = "USER_FOLDER"
        ISSUE = "ISSUE"
        DRAFT_ISSUE = "DRAFT_ISSUE"
        PAGE = "PAGE"
        TESTCASE = "TESTCASE"
        CYCLE = "CYCLE"
        RELEASE = "RELEASE"
        PLAN_CASE_RECORD = "PLAN_CASE_RECORD"
        USER_ROOT = "USER_ROOT"
        USER = "USER"
        # 中文分类节点（entity_id IS NULL）：作为 PROJECT 与具体业务实体之间的固定中间层
        ISSUES_CATEGORY = "ISSUES_CATEGORY"
        DRAFTS_CATEGORY = "DRAFTS_CATEGORY"
        PAGES_CATEGORY = "PAGES_CATEGORY"
        CYCLES_CATEGORY = "CYCLES_CATEGORY"
        RELEASES_CATEGORY = "RELEASES_CATEGORY"
        CASES_CATEGORY = "CASES_CATEGORY"
        PLAN_CASE_RECORDS_CATEGORY = "PLAN_CASE_RECORDS_CATEGORY"
        # 临时分类节点：业务实体（issue/page/...）尚未创建时，FileAsset 先挂到 _temp
        # 分类下；该分类节点共享（entity_id IS NULL），其下每个 TEMP 节点对应一个 asset。
        TEMP_CATEGORY = "TEMP_CATEGORY"
        TEMP = "TEMP"

    name = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=32, choices=EntityType.choices)
    entity_id = models.CharField(max_length=64, null=True, blank=True)
    parent = TreeForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )

    class MPTTMeta:
        order_insertion_by = ["name"]

    class Meta:
        db_table = "filepath"
        constraints = [
            models.UniqueConstraint(
                fields=["entity_type", "entity_id"],
                name="filepath_uniq_root_entity",
                condition=models.Q(parent__isnull=True, entity_id__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["entity_type"],
                name="filepath_uniq_root_category",
                condition=models.Q(parent__isnull=True, entity_id__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["parent", "entity_type", "entity_id"],
                name="filepath_uniq_child",
                condition=models.Q(parent__isnull=False),
            ),
        ]


class FileAsset(BaseModel):
    """
    A file asset.
    """

    class EntityTypeContext(models.TextChoices):
        ISSUE_ATTACHMENT = "ISSUE_ATTACHMENT"
        ISSUE_DESCRIPTION = "ISSUE_DESCRIPTION"
        COMMENT_DESCRIPTION = "COMMENT_DESCRIPTION"
        PAGE_DESCRIPTION = "PAGE_DESCRIPTION"
        PROJECT_DESCRIPTION = "PROJECT_DESCRIPTION"
        USER_COVER = "USER_COVER"
        USER_AVATAR = "USER_AVATAR"
        WORKSPACE_LOGO = "WORKSPACE_LOGO"
        PROJECT_COVER = "PROJECT_COVER"
        DRAFT_ISSUE_ATTACHMENT = "DRAFT_ISSUE_ATTACHMENT"
        DRAFT_ISSUE_DESCRIPTION = "DRAFT_ISSUE_DESCRIPTION"
        CASE_ATTACHMENT = "CASE_ATTACHMENT"
        CASE_MINDMAP = "CASE_MINDMAP"
        PROJECT_FILESTORE = "PROJECT_FILESTORE"
        CYCLE_FILE = "CYCLE_FILE"
        RELEASE_FILE = "RELEASE_FILE"
        CYCLE_COMMENT_DESCRIPTION = "CYCLE_COMMENT_DESCRIPTION"
        RELEASE_COMMENT_DESCRIPTION = "RELEASE_COMMENT_DESCRIPTION"
        PLAN_CASE_RECORD_FILE = "PLAN_CASE_RECORD_FILE"

    attributes = models.JSONField(default=dict)
    # 末段文件名（含可能的 (1)/(2) 去重后缀）。完整 MinIO key 由 ``path`` 节点链派生 +
    # ``filename`` 拼接而成（见 ``storage_key`` 属性），不再独立存一份对象 key。
    filename = models.CharField(max_length=255, default="")
    user = models.ForeignKey(
        "db.User", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    draft_issue = models.ForeignKey(
        "db.DraftIssue", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    project = models.ForeignKey(
        "db.Project", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    comment = models.ForeignKey(
        "db.IssueComment", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    page = models.ForeignKey(
        "db.Page", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    case = models.ForeignKey(
        "db.TestCase", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    cycle = models.ForeignKey(
        "db.Cycle", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    release = models.ForeignKey(
        "db.Release", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    release_comment = models.ForeignKey(
        "db.ReleaseComment", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    cycle_comment = models.ForeignKey(
        "db.CycleComment", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    plan_case_record = models.ForeignKey(
        "db.PlanCaseRecord", on_delete=models.CASCADE, null=True, related_name="assets"
    )
    entity_type = models.CharField(max_length=255, null=True, blank=True)
    entity_identifier = models.CharField(max_length=255, null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    external_id = models.CharField(max_length=255, null=True, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    size = models.FloatField(default=0)
    is_uploaded = models.BooleanField(default=False)
    storage_metadata = models.JSONField(default=dict, null=True, blank=True)
    path = models.ForeignKey(
        FilePath, on_delete=models.CASCADE, null=True, blank=True, related_name="files"
    )

    class Meta:
        verbose_name = "File Asset"
        verbose_name_plural = "File Assets"
        db_table = "file_assets"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_type"], name="asset_entity_type_idx"),
            models.Index(
                fields=["entity_identifier"], name="asset_entity_identifier_idx"
            ),
            models.Index(
                fields=["entity_type", "entity_identifier"], name="asset_entity_idx"
            ),
        ]
        constraints = [
            # 同 path 下未删除的 filename 不能重复；并发上传时由 DB 兜底，
            # 应用层 :func:`plane.utils.file_path.dedup_filename` 会预先加 (1)(2) 后缀。
            models.UniqueConstraint(
                fields=["path", "filename"],
                condition=models.Q(is_deleted=False, path__isnull=False),
                name="fileasset_uniq_active_filename_per_path",
            ),
        ]

    def __str__(self):
        return self.storage_key or str(self.pk)

    @property
    def storage_key(self) -> str:
        """MinIO 完整对象 key：``path`` 节点链 + ``filename`` 末段。

        未绑定 path 或 filename 为空时返回空串（典型为刚 ``__init__`` 还没 ``save`` 的
        实例）。这是 :class:`FileAsset` 唯一对外暴露的物理 key。
        """
        if self.path_id is None or not self.filename:
            return ""
        try:
            from plane.utils.file_path import compute_storage_key

            return compute_storage_key(self)
        except Exception:
            return ""

    @property
    def display_path(self) -> str:
        """从挂载的 FilePath 节点上溯，返回 ``工作区A/项目A/工作项/工作项B`` 字符串。

        未绑定 path（典型为 temp 阶段）时返回空串。供 S3 metadata、API 响应、
        前端展示路径列等复用，避免每个调用方重复拼。
        """
        leaf = self.path
        if leaf is None:
            return ""
        try:
            from plane.utils.file_path import materialize_display_path

            return materialize_display_path(leaf)
        except Exception:
            return ""

    def save(self, *args, **kwargs):
        # 没绑定 FilePath 时，按 entity_type 与作用域字段推导一条 FilePath 链；
        # 业务实体缺失时走 TEMP 兜底链（_temp/{asset_id}）。filename 为空时
        # 从 attributes.name 取原始文件名、清洗、并在同 path 下去重加 (1)(2) 后缀。
        update_fields = kwargs.get("update_fields")
        added_fields: list = []

        if self.path_id is None:
            try:
                from plane.utils.file_path import resolve_path_for_asset

                leaf = resolve_path_for_asset(self)
            except Exception:
                leaf = None
            if leaf is not None:
                self.path = leaf
                added_fields.append("path")

        if not self.filename and self.path_id is not None:
            try:
                from plane.utils.asset_path import _sanitize_filename
                from plane.utils.file_path import dedup_filename

                original = ""
                if isinstance(self.attributes, dict):
                    original = self.attributes.get("name") or ""
                if not original:
                    # 兜底：用 asset_id 占位，避免空 filename 写入 minio 失败
                    original = "file"
                cleaned = _sanitize_filename(original)
                self.filename = dedup_filename(
                    self.path_id, cleaned, exclude_asset_id=self.pk
                )
                added_fields.append("filename")
            except Exception:
                # 任何异常都不应该阻塞 save；保持 filename 为空并等后续手动修复
                pass

        if update_fields is not None and added_fields:
            extras = [f for f in added_fields if f not in update_fields]
            if extras:
                kwargs["update_fields"] = list(update_fields) + extras

        super().save(*args, **kwargs)

    @property
    def asset_url(self):
        if (
            self.entity_type == self.EntityTypeContext.WORKSPACE_LOGO
            or self.entity_type == self.EntityTypeContext.USER_AVATAR
            or self.entity_type == self.EntityTypeContext.USER_COVER
            or self.entity_type == self.EntityTypeContext.PROJECT_COVER
        ):
            return f"/api/assets/v2/static/{self.id}/"

        if self.entity_type == self.EntityTypeContext.ISSUE_ATTACHMENT:
            return f"/api/assets/v2/workspaces/{self.workspace.slug}/projects/{self.project_id}/issues/{self.issue_id}/attachments/{self.id}/"  # noqa: E501

        # 新增：测试用例附件的下载 URL
        if self.entity_type == self.EntityTypeContext.CASE_ATTACHMENT:
            return f"/api/assets/v2/workspaces/{self.workspace.slug}/{self.case_id}/attachments/{self.id}/"

        if self.entity_type in [
            self.EntityTypeContext.ISSUE_DESCRIPTION,
            self.EntityTypeContext.COMMENT_DESCRIPTION,
            self.EntityTypeContext.PAGE_DESCRIPTION,
            self.EntityTypeContext.PROJECT_DESCRIPTION,
            self.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION,
            self.EntityTypeContext.CYCLE_COMMENT_DESCRIPTION,
            self.EntityTypeContext.RELEASE_COMMENT_DESCRIPTION,
        ]:
            return f"/api/assets/v2/workspaces/{self.workspace.slug}/projects/{self.project_id}/{self.id}/"

        if (
            self.entity_type == self.EntityTypeContext.CYCLE_FILE
            and self.workspace_id
            and self.project_id
        ):
            return f"/api/workspaces/{self.workspace.slug}/projects/{self.project_id}/cycles/file/{self.id}/download/"

        if (
            self.entity_type == self.EntityTypeContext.RELEASE_FILE
            and self.workspace_id
            and self.project_id
        ):
            return f"/api/workspaces/{self.workspace.slug}/projects/{self.project_id}/release/file/{self.id}/download/"

        if (
            self.entity_type == self.EntityTypeContext.PLAN_CASE_RECORD_FILE
            and self.workspace_id
        ):
            return f"/api/workspaces/{self.workspace.slug}/test/execution-file/{self.id}/download/"

        return None


class File(BaseModel):
    name = models.CharField(max_length=50, null=True, verbose_name="原始文件名")
    path = models.CharField(max_length=255, null=True, verbose_name="文件存储路径")
    size = models.PositiveBigIntegerField(verbose_name="文件大小 (bytes)")
    is_uploaded = models.BooleanField(default=False)
    storage_metadata = models.JSONField(default=dict, null=True, blank=True)

    class Meta:
        db_table = "files"
        ordering = ("-created_at",)
