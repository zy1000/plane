"""项目风险的接口。鉴权用项目成员角色：成员可读写、访客只读（评论也算写）。

规则在 ``utils/risk.py``，视图只取对象、调规则、出响应，口径同阶段评审。
"""

from django.conf import settings
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db import transaction
from django.db.models import Count, F, OuterRef, Prefetch, Q, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.risk import (
    RiskActivitySerializer,
    RiskCommentSerializer,
    RiskDetailSerializer,
    RiskListSerializer,
    RiskWriteSerializer,
)
from plane.app.serializers.user import UserLiteSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import (
    FileAsset,
    Issue,
    IssueAssignee,
    Project,
    Risk,
    RiskActivity,
    RiskComment,
    User,
    Workspace,
)
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.risk import (
    BEIJING_TZ,
    RiskError,
    active_risk_issues,
    create_risk,
    link_issues,
    preview_risk_code,
    link_risks_to_issue,
    unlink_issue,
    update_risk,
    write_activity,
)

READ_ROLES = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]
WRITE_ROLES = [ROLE.ADMIN, ROLE.MEMBER]
RISK_FILE_ENTITY_TYPE = FileAsset.EntityTypeContext.RISK_FILE


def risk_error_response(exc: RiskError):
    code = status.HTTP_404_NOT_FOUND if exc.code == "RISK_NOT_FOUND" else status.HTTP_400_BAD_REQUEST
    return Response({"error": exc.message, "code": exc.code, **exc.detail}, status=code)


def _not_found(what="Risk"):
    return Response({"error": f"{what} not found."}, status=status.HTTP_404_NOT_FOUND)


def _issue_count_annotation():
    # 两头都没软删才算：软删级联是异步的
    return Count(
        "risk_issues",
        filter=Q(risk_issues__deleted_at__isnull=True, risk_issues__issue__deleted_at__isnull=True),
        distinct=True,
    )


def _stakeholders_prefetch():
    return Prefetch(
        "stakeholders",
        queryset=User.objects.select_related("avatar_asset").order_by("display_name"),
    )


def _risk_queryset(slug, project_id):
    return (
        Risk.objects.filter(workspace__slug=slug, project_id=project_id)
        # 头像走 User.avatar_url → avatar_asset，不跟着 join 的话每个人都要单查一次 file_assets
        .select_related("proposer", "proposer__avatar_asset", "owner", "owner__avatar_asset")
        .prefetch_related(_stakeholders_prefetch())
        .annotate(issue_count=_issue_count_annotation())
    )


def _lite_issue_rows(queryset):
    """轻量工作项行，形状同需求 ↔ 工作项的列表（见 views/requirement/issue.py）。"""
    return list(
        queryset.annotate(
            assignee_ids=Coalesce(
                Subquery(
                    IssueAssignee.objects.filter(
                        issue_id=OuterRef("pk"), assignee__member_project__is_active=True
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            )
        )
        .order_by("-created_at")
        .values(
            "id",
            "name",
            "sequence_id",
            "priority",
            "project_id",
            "type_id",
            "state_id",
            "assignee_ids",
            "archived_at",
            "created_at",
            "updated_at",
            project_identifier=F("project__identifier"),
            state_name=F("state__name"),
            state_group=F("state__group"),
            state_color=F("state__color"),
        )
    )


class RiskViewSet(BaseViewSet):
    model = Risk

    def get_queryset(self):
        return _risk_queryset(self.kwargs.get("slug"), self.kwargs.get("project_id"))

    def _risk(self, slug, project_id, pk):
        return _risk_queryset(slug, project_id).filter(pk=pk).first()

    def _detail(self, slug, project_id, pk, http_status=status.HTTP_200_OK):
        risk = self._risk(slug, project_id, pk)
        return Response(RiskDetailSerializer(risk).data, status=http_status)

    @allow_permission(READ_ROLES)
    def list(self, request, slug, project_id):
        # 全量返回，筛选 / 排序在前端做（同阶段评审）：一个项目的风险量级是几十到几百条
        risks = self.get_queryset().order_by("-created_at")
        return Response(RiskListSerializer(risks, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(READ_ROLES)
    def retrieve(self, request, slug, project_id, pk):
        risk = self._risk(slug, project_id, pk)
        if risk is None:
            return _not_found()
        return Response(RiskDetailSerializer(risk).data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def next_code(self, request, slug, project_id):
        """新建弹窗展示的预计编号，不占号（见 utils/risk.py::preview_risk_code）"""
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return _not_found("Project")
        return Response({"code": preview_risk_code(project.workspace_id)}, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def create(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return _not_found("Project")
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        # 提出人默认当前用户、提出时间默认今天（北京时间）：前端也会预填，后端兜底
        if not data.get("proposer_id"):
            data["proposer_id"] = str(request.user.id)
        if not data.get("proposed_date"):
            data["proposed_date"] = timezone.now().astimezone(BEIJING_TZ).date().isoformat()
        serializer = RiskWriteSerializer(data=data, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        risk = create_risk(project, request.user, dict(serializer.validated_data))
        return self._detail(slug, project_id, risk.pk, status.HTTP_201_CREATED)

    @allow_permission(WRITE_ROLES)
    def partial_update(self, request, slug, project_id, pk):
        risk = Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if risk is None:
            return _not_found()
        serializer = RiskWriteSerializer(
            risk, data=request.data, partial=True, context={"project_id": project_id}
        )
        serializer.is_valid(raise_exception=True)
        try:
            update_risk(risk, request.user, dict(serializer.validated_data))
        except RiskError as exc:
            return risk_error_response(exc)
        return self._detail(slug, project_id, pk)

    @allow_permission(WRITE_ROLES)
    def destroy(self, request, slug, project_id, pk):
        risk = Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if risk is None:
            return _not_found()
        risk.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- 关联缺陷 ---------------------------------------------------------

    @allow_permission(READ_ROLES)
    def issues(self, request, slug, project_id, pk):
        if not Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).exists():
            return _not_found()
        linked = active_risk_issues(risk_id=pk, project_id=project_id).values("issue_id")
        rows = _lite_issue_rows(Issue.objects.filter(project_id=project_id, id__in=Subquery(linked)))
        return Response(rows, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def link_issues(self, request, slug, project_id, pk):
        risk = Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if risk is None:
            return _not_found()
        issue_ids = request.data.get("issue_ids") or []
        if not isinstance(issue_ids, list) or not issue_ids:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            link_issues(risk, request.user, issue_ids)
        except RiskError as exc:
            return risk_error_response(exc)
        # 装饰器从 kwargs 取 slug / project_id，必须按关键字传
        return self.issues(request, slug=slug, project_id=project_id, pk=pk)

    @allow_permission(WRITE_ROLES)
    def unlink_issue(self, request, slug, project_id, pk, issue_id):
        risk = Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if risk is None:
            return _not_found()
        unlink_issue(risk, request.user, issue_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueRiskViewSet(BaseViewSet):
    """缺陷侧：这条工作项挂了哪些风险、挂 / 解除。"""

    model = Risk

    def _issue(self, slug, project_id, issue_id):
        # Issue.objects 含归档：缺陷归档后关联还在，区块不能跟着消失
        return Issue.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=issue_id
        ).first()

    def _linked(self, slug, project_id, issue_id):
        linked = active_risk_issues(issue_id=issue_id, project_id=project_id).values("risk_id")
        risks = _risk_queryset(slug, project_id).filter(id__in=Subquery(linked)).order_by("-created_at")
        return Response(RiskListSerializer(risks, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(READ_ROLES)
    def list(self, request, slug, project_id, issue_id):
        if self._issue(slug, project_id, issue_id) is None:
            return _not_found("Issue")
        return self._linked(slug, project_id, issue_id)

    @allow_permission(WRITE_ROLES)
    def create(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if issue is None:
            return _not_found("Issue")
        risk_ids = request.data.get("risk_ids") or []
        if not isinstance(risk_ids, list) or not risk_ids:
            return Response({"error": "risk_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            link_risks_to_issue(issue, request.user, risk_ids)
        except RiskError as exc:
            return risk_error_response(exc)
        return self._linked(slug, project_id, issue_id)

    @allow_permission(WRITE_ROLES)
    def destroy(self, request, slug, project_id, issue_id, risk_id):
        risk = Risk.objects.filter(workspace__slug=slug, project_id=project_id, pk=risk_id).first()
        if risk is None:
            return _not_found()
        unlink_issue(risk, request.user, issue_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RiskCommentViewSet(BaseViewSet):
    """风险下的评论。发布后不可编辑，只允许作者本人删 —— 口径同阶段评审。"""

    model = RiskComment
    serializer_class = RiskCommentSerializer

    def get_serializer_context(self):
        # parent 必须是同一条风险下的评论，serializer 靠这个判
        context = super().get_serializer_context()
        context["risk_id"] = self.kwargs.get("risk_id")
        return context

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(risk_id=self.kwargs.get("risk_id"))
            .select_related("project", "workspace", "risk", "actor")
            .order_by("created_at")
        )

    @allow_permission(READ_ROLES)
    def list(self, request, slug, project_id, risk_id):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def create(self, request, slug, project_id, risk_id):
        risk = Risk.objects.filter(id=risk_id, project_id=project_id, workspace__slug=slug).first()
        if risk is None:
            return _not_found()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            comment = serializer.save(
                workspace_id=risk.workspace_id,
                project_id=project_id,
                risk=risk,
                actor=request.user,
            )
            # 评论也进变更历史：一条时间线读得完「谁改了什么、谁说了什么」
            write_activity(
                risk,
                actor=request.user,
                verb="created",
                field="comment",
                comment=comment.comment_stripped[:255],
                risk_comment=comment,
            )
        return Response(self.get_serializer(comment).data, status=status.HTTP_201_CREATED)

    @allow_permission(WRITE_ROLES)
    def destroy(self, request, slug, project_id, risk_id, pk):
        comment = RiskComment.objects.filter(
            workspace__slug=slug, project_id=project_id, risk_id=risk_id, pk=pk
        ).first()
        if comment is None:
            return _not_found("Comment")
        if comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment author can delete this comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RiskActivityEndpoint(BaseAPIView):
    """变更历史。按时间升序全量返回。"""

    @allow_permission(READ_ROLES)
    def get(self, request, slug, project_id, risk_id):
        activities = (
            RiskActivity.objects.filter(workspace__slug=slug, project_id=project_id, risk_id=risk_id)
            .select_related("actor")
            .order_by("created_at")
        )
        return Response(RiskActivitySerializer(activities, many=True).data, status=status.HTTP_200_OK)


class RiskFileAPI(BaseViewSet):
    """风险附件，走 FileAsset 的两步预签名上传，口径同阶段评审附件。"""

    model = FileAsset

    def _risk(self, slug, project_id, risk_id):
        return Risk.objects.filter(id=risk_id, project_id=project_id, workspace__slug=slug).first()

    def _asset(self, slug, project_id, risk_id, asset_id, **extra):
        return FileAsset.objects.filter(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            risk_id=risk_id,
            entity_type=RISK_FILE_ENTITY_TYPE,
            is_deleted=False,
            **extra,
        ).first()

    @staticmethod
    def _serialize(asset):
        attributes = asset.attributes or {}
        return {
            "id": str(asset.id),
            "name": attributes.get("name") or "",
            "size": int(asset.size or 0),
            "type": attributes.get("type") or "",
            "is_uploaded": bool(asset.is_uploaded),
            "created_at": asset.created_at,
            "created_by_id": str(asset.created_by_id) if asset.created_by_id else None,
            "created_by_detail": UserLiteSerializer(asset.created_by).data
            if asset.created_by_id
            else None,
        }

    @allow_permission(READ_ROLES)
    def list(self, request, slug, project_id, risk_id):
        assets = (
            FileAsset.objects.filter(
                risk_id=risk_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=RISK_FILE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            )
            .select_related("created_by")
            .order_by("created_at")
        )
        return Response([self._serialize(asset) for asset in assets], status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def upload(self, request, slug, project_id, risk_id):
        risk = self._risk(slug, project_id, risk_id)
        if risk is None:
            return _not_found()
        name = request.data.get("name")
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        file_type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        size_limit = min(size, settings.FILE_SIZE_LIMIT)
        workspace = Workspace.objects.get(slug=slug)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            project_id=project_id,
            risk_id=risk.id,
            created_by=request.user,
            entity_type=RISK_FILE_ENTITY_TYPE,
        )
        upload_data = presigned_post_for_asset(
            request=request, asset=asset, file_type=file_type, file_size=size_limit
        )
        return Response(
            {"upload_data": upload_data, "asset_id": str(asset.id), "asset": self._serialize(asset)},
            status=status.HTTP_200_OK,
        )

    @allow_permission(WRITE_ROLES)
    def mark_uploaded(self, request, slug, project_id, risk_id, asset_id):
        risk = self._risk(slug, project_id, risk_id)
        if risk is None:
            return _not_found()
        asset = self._asset(slug, project_id, risk_id, asset_id)
        if asset is None:
            return _not_found("File")
        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset.id))
        asset.save(update_fields=["is_uploaded"])
        write_activity(
            risk,
            actor=request.user,
            verb="created",
            field="attachment",
            new_value=(asset.attributes or {}).get("name") or "",
            extra={"asset_id": str(asset.id)},
        )
        return Response(self._serialize(asset), status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def destroy(self, request, slug, project_id, risk_id, asset_id):
        risk = self._risk(slug, project_id, risk_id)
        if risk is None:
            return _not_found()
        asset = self._asset(slug, project_id, risk_id, asset_id)
        if asset is None:
            return _not_found("File")
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        write_activity(
            risk,
            actor=request.user,
            verb="deleted",
            field="attachment",
            old_value=(asset.attributes or {}).get("name") or "",
            extra={"asset_id": str(asset.id)},
        )
        # 物理删除对象，避免 MinIO 累积孤儿
        try:
            S3Storage(request=request).delete_files(object_names=[asset.storage_key])
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission(READ_ROLES)
    def download(self, request, slug, project_id, risk_id, asset_id):
        asset = self._asset(slug, project_id, risk_id, asset_id, is_uploaded=True)
        if asset is None:
            return _not_found("File")
        signed_url = S3Storage(request=request).generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=(asset.attributes or {}).get("name"),
        )
        return Response({"download_url": signed_url}, status=status.HTTP_200_OK)
