# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    ROLE,
    allow_permission,
    allow_fine_permission,
    PermissionKey,
)
from plane.app.serializers.project import ProjectPmsInfoSerializer
from plane.app.views import BaseAPIView
from plane.db.models import Project
from plane.db.models.project import ProjectPmsInfo
from plane.utils.pms import sync_info


class ProjectPmsInfoAPIView(BaseAPIView):
    def _queryset(self, slug: str, project_id: str):
        return ProjectPmsInfo.objects.filter(
            project_id=project_id,
            project__workspace__slug=slug,
        ).order_by("-id")

    def get(self, request, slug: str, project_id: str) -> Response:
        queryset = self._queryset(slug, project_id)
        serializer = ProjectPmsInfoSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def post(self, request, slug: str, project_id: str) -> Response:
        Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = ProjectPmsInfoSerializer(
            data=request.data,
            context={"project_id": str(project_id)},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProjectPmsInfoDetailAPIView(BaseAPIView):
    def _get_instance(self, slug: str, project_id: str, pk: int) -> ProjectPmsInfo:
        return ProjectPmsInfo.objects.get(
            pk=pk,
            project_id=project_id,
            project__workspace__slug=slug,
        )

    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def patch(self, request, slug: str, project_id: str, pk: int) -> Response:
        instance = self._get_instance(slug, project_id, pk)
        serializer = ProjectPmsInfoSerializer(
            instance,
            data=request.data,
            partial=True,
            context={"project_id": str(project_id)},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def delete(self, request, slug: str, project_id: str, pk: int) -> Response:
        instance = self._get_instance(slug, project_id, pk)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PmsSyncAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def post(self, request, slug: str, project_id: str) -> Response:
        instance = (
            ProjectPmsInfo.objects.filter(
                project_id=project_id,
                project__workspace__slug=slug,
            )
            .order_by("-id")
            .first()
        )
        if instance is None:
            return Response(
                {"error": "No PMS configuration found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )
        failed_issues = sync_info(instance)
        instance.refresh_from_db(fields=["issue_ids"])
        return Response(
            {
                "failed_issues": failed_issues,
                "pms_info": ProjectPmsInfoSerializer(instance).data,
            },
            status=status.HTTP_200_OK,
        )
