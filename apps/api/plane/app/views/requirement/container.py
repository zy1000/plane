# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""需求 ↔ 迭代 / 发布单的关联端点（项目侧）。

这两张关联表是阶段派生的事实来源：迭代关联给出「已排期」，发布关联给出
「待验证 / 已发布」。所以每次增删之后**同步**调 recalculate_stage —— 显式调用，
不挂信号（理由见 utils/requirement_project.recalculate_stage 的 docstring）。

前置校验只有两条，都报 409：容器必须属于本项目；需求必须已关联进本项目
（先进项目，再进项目下的容器 —— 反过来会绕开候选池的评审门槛）。需求在途变更
（in_review）刻意**不拦**：发布是项目侧的节奏，不被产品侧审批阻塞，前端标黄
提示即可（单向依赖铁律的软提示分支）。

迭代与发布两套端点完全同构，共用一个私有基类 —— 关联校验、错误码、重算触发的
行为必须逐字一致，分开写迟早漂移。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.requirement_project import ProjectRequirementSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.project import scope_identifier_map
from plane.app.views.requirement.row_base import annotate_pending
from plane.db.models import (
    Cycle,
    Release,
    RequirementCycle,
    RequirementProject,
    RequirementRelease,
)
from plane.utils.requirement import source_library_identifier_map
from plane.utils.requirement_project import (
    linked_requirements_queryset,
    recalculate_stage,
)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


class BaseRequirementContainerViewSet(BaseViewSet):
    """迭代/发布共用的「容器 ↔ 需求」关联骨架。子类只声明四个类属性。"""

    container_model = None  # Cycle | Release
    link_model = None  # RequirementCycle | RequirementRelease
    container_attr = ""  # 关联行上的外键名："cycle" | "release"
    trigger_prefix = ""  # 留痕 trigger.type 前缀："cycle" | "release"

    def _get_container(self, slug, project_id, container_id):
        return self.container_model.objects.filter(
            pk=container_id, project_id=project_id, workspace__slug=slug
        ).first()

    def _serialize_rows(self, rows):
        return ProjectRequirementSerializer(
            rows,
            many=True,
            context={
                "request": self.request,
                "scope_identifiers": scope_identifier_map(rows),
                "source_library_identifiers": source_library_identifier_map(rows),
                # 容器列表只做展示与软提示汇总，不提供评审入口
                "can_write": False,
            },
        ).data

    def _trigger(self, action, container):
        # 名称存快照：容器后续可能被删，留痕必须自足可读
        return {
            "type": f"{self.trigger_prefix}_{action}",
            f"{self.container_attr}_id": str(container.id),
            f"{self.container_attr}_name": container.name,
        }

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def list(self, request, slug, project_id, container_id):
        container = self._get_container(slug, project_id, container_id)
        if container is None:
            return Response(
                {"error": f"{self.container_attr.capitalize()} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        queryset = linked_requirements_queryset(
            slug=slug, project_id=project_id
        ).filter(
            id__in=self.link_model.objects.filter(
                **{f"{self.container_attr}_id": container_id}
            )
            .order_by()
            .values_list("requirement_id", flat=True)
        )
        return self.paginate(
            request=request,
            queryset=annotate_pending(queryset),
            on_results=self._serialize_rows,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def create(self, request, slug, project_id, container_id):
        requirement_ids = request.data.get("requirements", [])
        if not requirement_ids:
            return Response(
                {"error": "Requirements are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        container = self._get_container(slug, project_id, container_id)
        if container is None:
            return Response(
                {"error": f"{self.container_attr.capitalize()} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        requested = list(dict.fromkeys(str(item) for item in requirement_ids))
        # 先进项目、再进容器。全有或全无，与 resolve_linkable_requirements 同取舍
        linked = {
            str(value)
            for value in RequirementProject.objects.filter(
                project_id=project_id, requirement_id__in=requested
            )
            .order_by()
            .values_list("requirement_id", flat=True)
        }
        missing = [item for item in requested if item not in linked]
        if missing:
            return Response(
                {
                    "error": "Some requirements are not linked to this project.",
                    "code": "REQUIREMENT_NOT_LINKED_TO_PROJECT",
                    "requirement_ids": missing,
                },
                status=status.HTTP_409_CONFLICT,
            )

        self.link_model.objects.bulk_create(
            [
                self.link_model(
                    requirement_id=requirement_id,
                    project_id=project_id,
                    # bulk_create 不走 ProjectBaseModel.save()，workspace 不会被自动派生
                    workspace_id=container.workspace_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                    **{f"{self.container_attr}_id": container.id},
                )
                for requirement_id in requested
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        trigger = self._trigger("linked", container)
        for requirement_id in requested:
            recalculate_stage(
                requirement_id, project_id, trigger=trigger, actor=request.user
            )
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def destroy(self, request, slug, project_id, container_id, requirement_id):
        link = self.link_model.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            requirement_id=requirement_id,
            **{f"{self.container_attr}_id": container_id},
        )
        if not link.exists():
            return Response(
                {"error": "This requirement is not linked to it."},
                status=status.HTTP_404_NOT_FOUND,
            )
        container = self.container_model.objects.filter(pk=container_id).first()
        link.delete()
        recalculate_stage(
            requirement_id,
            project_id,
            trigger=self._trigger("unlinked", container)
            if container
            else {"type": f"{self.trigger_prefix}_unlinked"},
            actor=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CycleRequirementViewSet(BaseRequirementContainerViewSet):
    """迭代 ↔ 需求。关联 = 「已排期」的事实。"""

    model = RequirementCycle
    serializer_class = ProjectRequirementSerializer
    container_model = Cycle
    link_model = RequirementCycle
    container_attr = "cycle"
    trigger_prefix = "cycle"


class ReleaseRequirementViewSet(BaseRequirementContainerViewSet):
    """发布单 ↔ 需求。在途关联 = 「待验证」，发布单发布 = 「已发布」。"""

    model = RequirementRelease
    serializer_class = ProjectRequirementSerializer
    container_model = Release
    link_model = RequirementRelease
    container_attr = "release"
    trigger_prefix = "release"
