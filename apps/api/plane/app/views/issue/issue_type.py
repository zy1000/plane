from django.shortcuts import get_object_or_404


# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views import BaseAPIView, BaseViewSet
from plane.app.views.issue_scheme.scope import IssueSchemeScopeMixin
from plane.app.permissions import IssueSchemeConfigPermission, WorkspaceEntityPermission
from plane.app.serializers.issue_type import IssueTypeCategorySerializer, IssueTypeSerializer
from plane.db.models import (
    IssueType,
    State,
    Workspace,
)
from plane.db.models.issue_type import IssueTypeCategory
from plane.utils.issue_scheme import in_use_response_data, is_referenced, issue_type_references
from plane.utils.scheme_views import prune_mode_view_references
from plane.utils.project.defaults import (
    bulk_create_issue_state,
    create_default_bug_workflow,
)


class ProjectIssueTypeListCreateAPIEndpoint(IssueSchemeScopeMixin, BaseAPIView):
    """Issue Type 列表和创建接口。项目级与方案级（模板中心）路由共用，见 IssueSchemeScopeMixin。"""

    serializer_class = IssueTypeSerializer
    model = IssueType
    permission_classes = [IssueSchemeConfigPermission]

    def get_queryset(self):
        return (
            IssueType.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                scheme_id=self.get_scheme_id(),
                deleted_at__isnull=True,
            )
            .select_related("scheme")
            .prefetch_related("extra_fields")
            .order_by("level", "created_at")
        )

    def get(self, request, slug, project_id=None, issue_scheme_id=None):
        """获取 Issue Type 列表"""
        issue_types = self.get_queryset()
        serializer = IssueTypeSerializer(issue_types, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id=None, issue_scheme_id=None):
        """在当前方案里新建 Issue Type（新类型的 5 条衍生权限在跟随项目里默认没人持有，见需求 4.3）"""
        scheme_id = self.get_scheme_id()
        if scheme_id is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueTypeSerializer(
            data=request.data, context={"workspace_slug": slug}
        )
        if serializer.is_valid():
            issue_type = serializer.save(scheme_id=scheme_id)
            bulk_create_issue_state(issue_types=[issue_type], created_by=request.user)
            response_serializer = IssueTypeSerializer(issue_type)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceIssueTypeApiView(BaseAPIView):
    model = IssueType

    def get_queryset(self):
        return (
            IssueType.objects.filter(deleted_at__isnull=True)
            .select_related("scheme")
            .prefetch_related("extra_fields")
            .order_by("scheme_id", "level", "created_at")
        )

    def get(self, request, slug: str):
        queryset = self.get_queryset().filter(workspace__slug=slug)
        serializer = IssueTypeSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IssueTypeViewSet(IssueSchemeScopeMixin, BaseAPIView):
    """单个 Issue Type 的读改删。项目级与方案级（模板中心）路由共用，见 IssueSchemeScopeMixin。"""

    model = IssueType
    permission_classes = [IssueSchemeConfigPermission]

    def get_queryset(self):
        return IssueType.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            scheme_id=self.get_scheme_id(),
            deleted_at__isnull=True,
        ).select_related("scheme")

    def get(self, request, slug, issue_type_id, project_id=None, issue_scheme_id=None):
        issue_type = get_object_or_404(self.get_queryset(), pk=issue_type_id)
        serializer = IssueTypeSerializer(issue_type)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, issue_type_id, project_id=None, issue_scheme_id=None):
        issue_type = get_object_or_404(self.get_queryset(), pk=issue_type_id)
        serializer = IssueTypeSerializer(
            issue_type,
            data=request.data,
            partial=True,
            context={"workspace_slug": slug},
        )
        if serializer.is_valid():
            issue_type = serializer.save()
            response_serializer = IssueTypeSerializer(issue_type)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, slug, issue_type_id, project_id=None, issue_scheme_id=None):
        issue_type = get_object_or_404(self.get_queryset(), pk=issue_type_id)
        serializer = IssueTypeSerializer(
            issue_type,
            data=request.data,
            partial=False,
            context={"workspace_slug": slug},
        )
        if serializer.is_valid():
            issue_type = serializer.save()
            response_serializer = IssueTypeSerializer(issue_type)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, issue_type_id, project_id=None, issue_scheme_id=None):
        issue_type = get_object_or_404(self.get_queryset(), pk=issue_type_id)
        if issue_type.is_default:
            return Response(
                {"msg": "默认工作项类型不能删除"}, status=status.HTTP_400_BAD_REQUEST
            )
        # 删除保护（需求 4.3）：类型归方案，任一项目（含已脱离的）的工作项、草稿（含归档、软删）在用就不能删，只能停用
        refs = issue_type_references(issue_type.id)
        if is_referenced(refs):
            data = in_use_response_data(refs, "工作项类型")
            data["msg"] = data["error"]
            return Response(data, status=status.HTTP_409_CONFLICT)
        # 类型的状态随类型一起删，研发模式视图里用到类型或这些状态的条件要一并处理
        state_ids = State.all_state_objects.filter(issue_type_id=issue_type.id).values_list("id", flat=True)
        removed_ids = [issue_type.id, *state_ids]
        scheme_id = issue_type.scheme_id
        issue_type.delete(soft=False)
        prune_mode_view_references(
            scheme_id, removed_ids, delete_views=request.query_params.get("delete_views") == "true"
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueTypeCategoryViewSet(BaseViewSet):
    model = IssueTypeCategory
    serializer_class = IssueTypeCategorySerializer
    permission_classes = [WorkspaceEntityPermission]
    search_fields = ["name", "description"]

    def get_queryset(self):
        return IssueTypeCategory.objects.filter(
            workspace__slug=self.kwargs.get("slug")
        ).select_related("workspace").order_by("name")

    def perform_create(self, serializer):
        workspace = get_object_or_404(Workspace, slug=self.kwargs.get("slug"))
        serializer.save(workspace=workspace)

    def destroy(self, request, slug, pk):
        category = get_object_or_404(self.get_queryset(), pk=pk)
        if category.issue_types.filter(deleted_at__isnull=True).exists():
            return Response(
                {"msg": "该工作项类型分类正在被使用,请先移除对应工作项类型"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

