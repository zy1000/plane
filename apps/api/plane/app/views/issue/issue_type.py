from django.shortcuts import get_object_or_404


# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views import BaseAPIView
from plane.app.permissions import ProjectMemberPermission
from plane.app.serializers.issue_type import IssueTypeSerializer
from plane.db.models import (
    IssueType,
    Issue,
    Project,
)


class ProjectIssueTypeListCreateAPIEndpoint(BaseAPIView):
    """项目Issue Type列表和创建接口"""

    serializer_class = IssueTypeSerializer
    model = IssueType
    permission_classes = [ProjectMemberPermission]

    def get_queryset(self):
        return IssueType.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            deleted_at__isnull=True,
        ).order_by("level", "created_at")

    def get(self, request, slug, project_id):
        """获取项目的Issue Type列表"""
        issue_types = self.get_queryset()
        serializer = IssueTypeSerializer(issue_types, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id):
        """创建新的项目级Issue Type"""
        project = get_object_or_404(Project, pk=project_id, workspace__slug=slug)
        serializer = IssueTypeSerializer(data=request.data)
        if serializer.is_valid():
            issue_type = serializer.save(project=project)
            response_serializer = IssueTypeSerializer(issue_type)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceIssueTypeApiView(BaseAPIView):
    model = IssueType

    def get_queryset(self):
        return IssueType.objects.filter(
            project__isnull=False,
            deleted_at__isnull=True,
        ).select_related("project").order_by(
            "project_id", "level", "created_at"
        )

    def get(self, request, slug: str):
        queryset = self.get_queryset().filter(workspace__slug=slug)
        serializer = IssueTypeSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IssueTypeViewSet(BaseAPIView):
    model = IssueType

    def get_queryset(self):
        return IssueType.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            deleted_at__isnull=True,
        )

    def delete(self, request, slug, project_id, issue_type_id):
        issue_type = get_object_or_404(self.get_queryset(), pk=issue_type_id)
        if issue_type.is_default:
            return Response(
                {"msg": "默认工作项类型不能删除"}, status=status.HTTP_400_BAD_REQUEST
            )
        if Issue.objects.filter(project_id=project_id, type=issue_type).exists():
            return Response(
                {"msg": "该工作项类型正在被使用,请先删除对应工作项"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_type.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


