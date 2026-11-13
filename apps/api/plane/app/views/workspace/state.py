# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from django.db.models import Q, Subquery

from plane.db.models import DevModeIssueType, State
from plane.app.permissions import WorkspaceEntityPermission
from plane.utils.visibility import visible_project_scope
from collections import defaultdict


class WorkspaceStatesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get(self, request, slug):
        # 当前用户能看到的项目用到的方案里的状态。共用方案时同一状态会经多个项目命中，distinct 去重。
        # scheme__projects / dev_mode__projects 是反向关系，visible_projects_q 只认 FK 字段名，这里按 id 集合拼
        scope = visible_project_scope(request.user, slug)
        visible_q = Q() if scope.all else Q(scheme__projects__in=list(scope.ids))
        mode_visible_q = Q() if scope.all else Q(dev_mode__projects__in=list(scope.ids))
        states = (
            State.objects.filter(
                visible_q,
                workspace__slug=slug,
                scheme__projects__archived_at__isnull=True,
                is_triage=False,
            )
            # 类型库被多个模式共用：只留下用户所在跟随项目的模式关联了的类型的状态
            # （前端按项目再用 visible_issue_type_ids 细分）
            .filter(
                Q(scheme__project__isnull=False)
                | Q(issue_type__isnull=True)
                | Q(
                    issue_type_id__in=Subquery(
                        DevModeIssueType.objects.filter(
                            mode_visible_q,
                            dev_mode__projects__issue_scheme__project__isnull=True,
                        ).values("issue_type_id")
                    )
                )
            )
            # 工作区下有几万个状态（每个项目方案 × 每个类型各一套）：只取要输出的列、直接拼字典，
            # 不建模型对象、不逐行走 serializer。输出字段与顺序同 StateSerializer，那边加字段这里要跟着加。
            .values(
                "id",
                "scheme__project_id",
                "scheme_id",
                "workspace_id",
                "name",
                "color",
                "group",
                "default",
                "description",
                "sequence",
                "issue_type_id",
            )
            # sequence 大量并列（几千个状态同一个值），order 取决于并列行的先后。原先 SELECT DISTINCT 整行
            # 时数据库顺带按 created_at 等列排了并列行，这里把并列顺序写明，只取部分列后 order 才不会变
            .order_by("sequence", "created_at", "id")
            .distinct()
        )

        grouped_states = defaultdict(list)
        for state in states:
            grouped_states[state["group"]].append(state)

        orders = {}
        for group_states in grouped_states.values():
            count = len(group_states)

            for index, state in enumerate(group_states, start=1):
                orders[state["id"]] = index / count

        data = [
            {
                "id": state["id"],
                "project_id": state["scheme__project_id"],
                "scheme_id": state["scheme_id"],
                "workspace_id": state["workspace_id"],
                "name": state["name"],
                "color": state["color"],
                "group": state["group"],
                "default": state["default"],
                "description": state["description"],
                "sequence": state["sequence"],
                "order": orders[state["id"]],
                "issue_type_id": state["issue_type_id"],
            }
            for state in states
        ]
        return Response(data, status=status.HTTP_200_OK)
