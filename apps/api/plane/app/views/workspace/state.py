# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.serializers import StateSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import State
from plane.app.permissions import WorkspaceEntityPermission
from collections import defaultdict


class WorkspaceStatesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get(self, request, slug):
        # 当前用户所在项目用到的方案里的状态。共用方案时同一状态会经多个项目命中，distinct 去重
        states = (
            State.objects.filter(
                workspace__slug=slug,
                scheme__projects__project_projectmember__member=request.user,
                scheme__projects__project_projectmember__is_active=True,
                scheme__projects__archived_at__isnull=True,
                is_triage=False,
            )
            .select_related("scheme")
            .distinct()
        )

        grouped_states = defaultdict(list)
        for state in states:
            grouped_states[state.group].append(state)

        for group, group_states in grouped_states.items():
            count = len(group_states)

            for index, state in enumerate(group_states, start=1):
                state.order = index / count

        serializer = StateSerializer(states, many=True).data
        return Response(serializer, status=status.HTTP_200_OK)
