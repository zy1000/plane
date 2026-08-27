# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""需求 ↔ 工作项的关联端点（项目侧），同一张 RequirementIssue 表的两个方向。

这张关联表供项目侧的工作项数 / 完成率统计，不影响需求状态（状态是需求级的
人工字段，见 RequirementItemStatus）。真多对多：一条工作项可以同时挂多条需求，
分别计入各自的完成率。

- RequirementIssueViewSet：需求 → 工作项（list 返回工作项行）。**不复用
  BaseRequirementContainerViewSet** —— 容器基类的方向是 container→requirements，
  这里方向相反，强套基类每个方法都要覆盖。校验顺序借鉴它，bulk_create 范式借鉴
  ReleaseIssueViewSet。
- IssueRequirementViewSet：工作项 → 需求（list 返回需求行）。方向与容器基类恰好
  一致（Issue 就是容器），直接继承，四个类属性搞定，校验与错误码和迭代/发布
  逐字一致。

公共前置校验两条，报 409：需求必须已关联进本项目（先进项目，再挂项目下的
事实 —— 反过来会绕开候选池的评审门槛）；已关闭（closed）的需求不能新挂工作项。
"""

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import F, OuterRef, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.requirement_project import ProjectRequirementSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.container import BaseRequirementContainerViewSet
from plane.db.models import (
    Issue,
    IssueAssignee,
    Requirement,
    RequirementIssue,
    RequirementItemStatus,
    RequirementProject,
)


class RequirementIssueViewSet(BaseViewSet):
    """需求 ↔ 工作项。供工作项数 / 完成率统计。"""

    model = RequirementIssue

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def list(self, request, slug, project_id, requirement_id):
        """轻量工作项行，不走 issue_on_results / grouper 重型链路（那是给全功能
        网格的）。Issue.objects **含归档** —— 归档不是进度回退，仍算研发事实，
        前端按 archived_at 置灰。state 三列拍平给出：前端完成率、行内状态色
        都靠 state_group / state_color，不再逐行查 State。"""
        issues = (
            Issue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_requirements__requirement_id=requirement_id,
                issue_requirements__deleted_at__isnull=True,
            )
            .annotate(
                assignee_ids=Coalesce(
                    Subquery(
                        IssueAssignee.objects.filter(
                            issue_id=OuterRef("pk"),
                            assignee__member_project__is_active=True,
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
                state_name=F("state__name"),
                state_group=F("state__group"),
                state_color=F("state__color"),
            )
        )
        return Response(issues, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def create(self, request, slug, project_id, requirement_id):
        """关联已有工作项，唯一载荷 {"issues": [id, ...]}。全有或全无，与
        resolve_linkable_requirements 同取舍 —— 部分成功会让前端不知道该刷谁。"""
        issue_ids = request.data.get("issues", [])
        if not issue_ids:
            return Response(
                {"error": "Issues are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        requested = list(dict.fromkeys(str(item) for item in issue_ids))

        # ① 先进项目，再挂项目下的事实
        link = RequirementProject.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            requirement_id=requirement_id,
        ).first()
        if link is None:
            return Response(
                {
                    "error": "This requirement is not linked to this project.",
                    "code": "REQUIREMENT_NOT_LINKED_TO_PROJECT",
                    "requirement_ids": [str(requirement_id)],
                },
                status=status.HTTP_409_CONFLICT,
            )
        # 已关闭的需求不进任何关联选择器：不能新挂工作项（解除仍允许）
        if Requirement.objects.filter(
            id=requirement_id, status=RequirementItemStatus.CLOSED
        ).exists():
            return Response(
                {
                    "error": "Closed requirements cannot link work items.",
                    "code": "REQUIREMENT_CLOSED",
                    "requirement_ids": [str(requirement_id)],
                },
                status=status.HTTP_409_CONFLICT,
            )

        # ② 工作项必须全部落在本项目 —— 保证 RequirementIssue.project =
        # Issue.project 的不变量（按 (requirement, project) 聚合时不穿透 issue 表）
        found = {
            str(value)
            for value in Issue.objects.filter(
                workspace__slug=slug, project_id=project_id, pk__in=requested
            )
            .order_by()
            .values_list("id", flat=True)
        }
        missing = [item for item in requested if item not in found]
        if missing:
            return Response(
                {
                    "error": "Some work items do not belong to this project.",
                    "issue_ids": missing,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 已挂本需求的行交给条件唯一索引静默吸收（幂等），并发竞态同样由 DB 唯一索引
        # 裁决。工作项已挂**其他**需求不是冲突 —— 多对多。
        RequirementIssue.objects.bulk_create(
            [
                RequirementIssue(
                    requirement_id=requirement_id,
                    issue_id=issue_id,
                    project_id=project_id,
                    # bulk_create 不走 ProjectBaseModel.save()，workspace 不会被自动派生
                    workspace_id=link.workspace_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                for issue_id in requested
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def destroy(self, request, slug, project_id, requirement_id, issue_id):
        link = RequirementIssue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            requirement_id=requirement_id,
            issue_id=issue_id,
        ).first()
        if link is None:
            return Response(
                {"error": "This work item is not linked to it."},
                status=status.HTTP_404_NOT_FOUND,
            )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueRequirementViewSet(BaseRequirementContainerViewSet):
    """工作项 ↔ 需求（工作项侧）。给工作项详情的「关联需求」区块供数与写入。

    刻意**不动 Issue 主序列化器热路径** —— 绝大多数工作项没挂需求，塞进主序列化器
    是全站为少数行买单。list 返回的是 ProjectRequirementSerializer 行（与迭代 /
    发布的关联需求列表同形），一条工作项挂的需求是个位数，分页信封一页拉完。
    """

    model = RequirementIssue
    serializer_class = ProjectRequirementSerializer
    container_model = Issue
    link_model = RequirementIssue
    container_attr = "issue"
