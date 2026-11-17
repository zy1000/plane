# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import WorkspaceEstimateSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Estimate, Project
from plane.utils.cache import cache_response
from plane.utils.visibility import visible_projects_q


class WorkspaceEstimatesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    @cache_response(60 * 60 * 2)
    def get(self, request, slug):
        # 只取当前用户能看到的项目在用的估算（成员 / 负责 / 直通 / 白名单，见 utils/visibility.py）
        estimate_ids = Project.objects.filter(
            visible_projects_q(request.user, slug, None), workspace__slug=slug, estimate__isnull=False
        ).values_list("estimate_id", flat=True)
        estimates = (
            Estimate.objects.filter(pk__in=estimate_ids, workspace__slug=slug)
            .prefetch_related("points")
            .select_related("workspace", "project")
        )

        serializer = WorkspaceEstimateSerializer(estimates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
