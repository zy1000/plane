# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from django.db.models import Q, Subquery, TextField
from django.db.models.functions import Cast

from plane.db.models import DevModeIssueType, State
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers.state import build_workspace_states_payload
from plane.utils.visibility import visible_project_scope


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
            # 工作区下有几万个状态（每个项目方案 × 每个类型各一套）：只取要输出的列，不建模型对象、
            # 不逐行走 serializer。uuid 列在数据库里转成文本再取 —— 否则驱动要逐个建 UUID 对象、
            # 渲染时再逐个转回字符串，十万个 id 光这一来一回就是 0.3 秒
            .annotate(
                id_text=Cast("id", TextField()),
                scheme_id_text=Cast("scheme_id", TextField()),
                project_id_text=Cast("scheme__project_id", TextField()),
                workspace_id_text=Cast("workspace_id", TextField()),
                issue_type_id_text=Cast("issue_type_id", TextField()),
            )
            # sequence 大量并列（几千个状态同一个值），order 取决于并列行的先后，所以把并列顺序写明
            .order_by("sequence", "created_at", "id")
            .distinct()
            .values_list(
                "id_text",
                "scheme_id_text",
                "project_id_text",
                "workspace_id_text",
                "issue_type_id_text",
                "name",
                "color",
                "group",
                "default",
                "description",
                "sequence",
            )
        )
        return Response(build_workspace_states_payload(states), status=status.HTTP_200_OK)
