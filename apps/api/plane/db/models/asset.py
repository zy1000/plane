# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django import
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Module import
from .base import BaseModel
from plane.utils.asset_path import build_asset_key


def get_upload_path(instance, filename):
    """旧 multipart 接口仍走该函数；统一委托给 build_asset_key 以保证路径一致。"""
    workspace_id = getattr(instance, "workspace_id", None)
    if workspace_id is None:
        # 用户头像/封面或 anonymous 场景
        user_id = getattr(instance, "user_id", None)
        return build_asset_key(
            entity_type=getattr(instance, "entity_type", "USER_AVATAR") or "USER_AVATAR",
            filename=filename,
            user_id=str(user_id) if user_id else None,
        )
    return build_asset_key(
        entity_type=getattr(instance, "entity_type", "") or "",
        filename=filename,
        workspace_id=str(workspace_id),
        project_id=str(instance.project_id) if getattr(instance, "project_id", None) else None,
        user_id=str(instance.user_id) if getattr(instance, "user_id", None) else None,
        issue_id=str(instance.issue_id) if getattr(instance, "issue_id", None) else None,
        page_id=str(instance.page_id) if getattr(instance, "page_id", None) else None,
        comment_id=str(instance.comment_id) if getattr(instance, "comment_id", None) else None,
        case_id=str(instance.case_id) if getattr(instance, "case_id", None) else None,
        cycle_id=str(instance.cycle_id) if getattr(instance, "cycle_id", None) else None,
        release_id=str(instance.release_id) if getattr(instance, "release_id", None) else None,
        plan_case_record_id=(
            str(instance.plan_case_record_id) if getattr(instance, "plan_case_record_id", None) else None
        ),
        draft_issue_id=str(instance.draft_issue_id) if getattr(instance, "draft_issue_id", None) else None,
        asset_id=str(instance.id) if getattr(instance, "id", None) else None,
    )


def file_size(value):
    if value.size > settings.FILE_SIZE_LIMIT:
        raise ValidationError("File too large. Size should not exceed 5 MB.")


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
        PLAN_CASE_RECORD_FILE = "PLAN_CASE_RECORD_FILE"

    attributes = models.JSONField(default=dict)
    asset = models.FileField(upload_to=get_upload_path, max_length=800)
    user = models.ForeignKey("db.User", on_delete=models.CASCADE, null=True, related_name="assets")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, null=True, related_name="assets")
    draft_issue = models.ForeignKey("db.DraftIssue", on_delete=models.CASCADE, null=True, related_name="assets")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, null=True, related_name="assets")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, null=True, related_name="assets")
    comment = models.ForeignKey("db.IssueComment", on_delete=models.CASCADE, null=True, related_name="assets")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, null=True, related_name="assets")
    case = models.ForeignKey("db.TestCase", on_delete=models.CASCADE, null=True, related_name="assets")
    cycle = models.ForeignKey("db.Cycle", on_delete=models.CASCADE, null=True, related_name="assets")
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, null=True, related_name="assets")
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

    class Meta:
        verbose_name = "File Asset"
        verbose_name_plural = "File Assets"
        db_table = "file_assets"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_type"], name="asset_entity_type_idx"),
            models.Index(fields=["entity_identifier"], name="asset_entity_identifier_idx"),
            models.Index(fields=["entity_type", "entity_identifier"], name="asset_entity_idx"),
            models.Index(fields=["asset"], name="asset_asset_idx"),
        ]

    def __str__(self):
        return str(self.asset)

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
        ]:
            return f"/api/assets/v2/workspaces/{self.workspace.slug}/projects/{self.project_id}/{self.id}/"

        if self.entity_type == self.EntityTypeContext.CYCLE_FILE and self.workspace_id and self.project_id:
            return (
                f"/api/workspaces/{self.workspace.slug}/projects/{self.project_id}/cycles/file/{self.id}/download/"
            )

        if self.entity_type == self.EntityTypeContext.RELEASE_FILE and self.workspace_id and self.project_id:
            return (
                f"/api/workspaces/{self.workspace.slug}/projects/{self.project_id}/release/file/{self.id}/download/"
            )

        if self.entity_type == self.EntityTypeContext.PLAN_CASE_RECORD_FILE and self.workspace_id:
            return f"/api/workspaces/{self.workspace.slug}/test/execution-file/{self.id}/download/"

        return None


class File(BaseModel):
    name = models.CharField(max_length=50, null=True, verbose_name="原始文件名")
    path = models.CharField(max_length=255, null=True, verbose_name='文件存储路径')
    size = models.PositiveBigIntegerField(verbose_name="文件大小 (bytes)")
    is_uploaded = models.BooleanField(default=False)
    storage_metadata = models.JSONField(default=dict, null=True, blank=True)

    class Meta:
        db_table = "files"
        ordering = ("-created_at",)
