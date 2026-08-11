# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""项目侧的产品需求：引用、排序、提变更单。

项目对需求**只读**。唯一属于项目的可写数据是关联关系本身与 RequirementProject
上的 sort_order —— stage 是派生列，由 utils/requirement_project.recalculate_stage
按迭代/发布关联事实重算，任何手动写入都被显式拒绝（REQUIREMENT_STAGE_DERIVED）。
需求内容的唯一权威在产品 —— 项目成员想改内容只能提变更单，走产品现有的审批名单。

因此这里刻意不复用 BaseRequirementRowViewSet：那套基类的每一个写端点都以
「能写这批行」为前提，而项目侧根本没有那个前提。
"""

import json

from django.db import transaction
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.requirement import RequirementFilterSerializer
from plane.app.serializers.requirement_change import RequirementChangeRequestSerializer
from plane.app.serializers.requirement_project import (
    MultiProductRequirementSerializer,
    ProjectRequirementSerializer,
    RequirementProjectSerializer,
    RequirementProjectStageWriteSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.change import change_error_response
from plane.app.views.requirement.mixins import get_scoped_product
from plane.app.views.requirement.row_base import annotate_pending
from plane.db.models import (
    Product,
    Project,
    Requirement,
    RequirementCycle,
    RequirementProject,
    RequirementProjectStage,
    RequirementRelease,
)
from plane.utils.requirement import (
    field_specs_for_requirement_types,
    field_tree_from_specs,
    filter_requirement_row_ids,
    get_referenced_requirement_type_ids,
    requirement_types_field_payload_from_specs,
    source_library_identifier_map,
)
from plane.utils.requirement_change import (
    RequirementChangeError,
    submit_change_request,
)
from plane.utils.requirement_project import (
    RequirementLinkError,
    can_submit_change_from_project,
    linkable_requirements_queryset,
    linked_requirement_ids,
    linked_requirements_queryset,
    recalculate_requirement_status,
    requirement_facets,
    resolve_linkable_requirements,
    resolve_policy_for_linked_requirement,
)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


def _link_error_response(exc: RequirementLinkError):
    payload = {"error": exc.message}
    if exc.code:
        payload["code"] = exc.code
    payload.update(exc.detail)
    return Response(payload, status=status.HTTP_409_CONFLICT)


def scope_identifier_map(rows):
    """这一页行的产品编号前缀：{product_id: identifier}。

    产品页只需要一个常量前缀（一个 RowLayer 只服务一个产品），项目页不行 ——
    一个项目可以同时引用多个产品的需求，同一页里混着 ECOM-1 和 PAY-3。
    """
    product_ids = {str(row.product_id) for row in rows if row.product_id}
    if not product_ids:
        return {}
    return {
        str(key): identifier
        for key, identifier in Product.objects.filter(id__in=product_ids).values_list(
            "id", "identifier"
        )
    }


class ProjectRequirementViewSet(BaseViewSet):
    """项目关联的产品需求。"""

    model = RequirementProject
    serializer_class = ProjectRequirementSerializer

    # --- 共用 -----------------------------------------------------------

    def _requirement_type_specs(self, project_id):
        """本项目已关联需求所引用到的需求类型 + 字段。

        搜索与筛选要靠它解析自定义字段，前端网格也要靠它渲染自定义列。
        """
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=Requirement, scope={"id__in": linked_requirement_ids(project_id)}
        )
        specs, by_requirement_type = field_specs_for_requirement_types(
            requirement_type_ids
        )
        return requirement_type_ids, specs, by_requirement_type

    def _row_context(self, rows):
        return {
            "request": self.request,
            "scope_identifiers": scope_identifier_map(rows),
            "source_library_identifiers": source_library_identifier_map(rows),
            # 项目侧 can_write 的含义窄得多：不是「能改这批行」，而是
            # 「能不能把它推进评审」。内容仍然一个字都改不了 —— 写端点根本不存在。
            # RequirementSerializer.get_can_submit_review 是唯一的消费者。
            "can_write": True,
        }

    def _serialize_rows(self, rows):
        return ProjectRequirementSerializer(
            rows, many=True, context=self._row_context(rows)
        ).data

    def _parse_filters(self, request):
        raw_filters = request.query_params.get("filters", "[]")
        try:
            filter_payload = json.loads(raw_filters)
        except (TypeError, ValueError, json.JSONDecodeError):
            return None, Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(filter_payload, list):
            return None, Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return filter_payload, None

    def _apply_common_query(self, request, queryset, *, specs, by_requirement_type):
        """?requirement_type_id= / ?product_id= / ?ids= / ?search= / ?filters=

        搜索与筛选在 Python 里做，与产品需求列表同一条路径
        （filter_requirement_row_ids）—— 自定义字段的值在 JSON 里，推不进 SQL。
        """
        requirement_type_id = request.query_params.get("requirement_type_id")
        if requirement_type_id:
            queryset = queryset.filter(requirement_type_id=requirement_type_id)

        product_id = request.query_params.get("product_id")
        if product_id:
            queryset = queryset.filter(product_id=product_id)

        raw_ids = request.query_params.get("ids")
        if raw_ids:
            try:
                row_ids = drf_serializers.ListField(
                    child=drf_serializers.UUIDField()
                ).run_validation([item for item in raw_ids.split(",") if item])
            except drf_serializers.ValidationError as exc:
                return None, Response(
                    {"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST
                )
            queryset = queryset.filter(id__in=row_ids)

        filter_payload, error = self._parse_filters(request)
        if error is not None:
            return None, error

        filter_serializer = RequirementFilterSerializer(
            data=filter_payload, many=True, context={"fields": specs}
        )
        filter_serializer.is_valid(raise_exception=True)
        normalized_filters = [
            {
                "field_id": str(item["field_id"]),
                "operator": item["operator"],
                **({"value": item.get("value")} if "value" in item else {}),
            }
            for item in filter_serializer.validated_data
        ]

        search = request.query_params.get("search", "")
        if search.strip() or normalized_filters:
            matching_ids = filter_requirement_row_ids(
                fields=specs,
                rows=queryset,
                search=search,
                filters=normalized_filters,
                fields_by_requirement_type=by_requirement_type,
            )
            queryset = queryset.filter(id__in=matching_ids)

        return queryset, None

    # --- 读 -------------------------------------------------------------

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def list(self, request, slug, project_id):
        _, specs, by_requirement_type = self._requirement_type_specs(project_id)
        queryset = linked_requirements_queryset(slug=slug, project_id=project_id)

        stage = request.query_params.get("stage")
        if stage:
            if stage not in RequirementProjectStage.values:
                return Response(
                    {"stage": "Unknown stage."}, status=status.HTTP_400_BAD_REQUEST
                )
            queryset = queryset.filter(stage=stage)

        # 迭代/发布的「关联需求」选择器用：排除已关联进该容器的行。
        # .order_by() 清默认排序，理由同 linked_requirement_ids。
        # project_id 收窄是必须的：需求可被多个项目引用，不带它，别的项目里的
        # 关联会错误排除本项目的行，还能被用来探测跨项目的排期事实
        exclude_cycle_id = request.query_params.get("exclude_cycle_id")
        if exclude_cycle_id:
            queryset = queryset.exclude(
                id__in=RequirementCycle.objects.filter(
                    cycle_id=exclude_cycle_id, project_id=project_id
                )
                .order_by()
                .values_list("requirement_id", flat=True)
            )
        exclude_release_id = request.query_params.get("exclude_release_id")
        if exclude_release_id:
            queryset = queryset.exclude(
                id__in=RequirementRelease.objects.filter(
                    release_id=exclude_release_id, project_id=project_id
                )
                .order_by()
                .values_list("requirement_id", flat=True)
            )

        queryset, error = self._apply_common_query(
            request, queryset, specs=specs, by_requirement_type=by_requirement_type
        )
        if error is not None:
            return error

        return self.paginate(
            request=request,
            queryset=annotate_pending(queryset),
            on_results=self._serialize_rows,
            # 顶部产品 tab 与阶段条的计数搭列表一起回来，不另开端点、不多发请求。
            # paginate 会把它原样放进响应信封的 extra_stats 字段。
            extra_stats=requirement_facets(
                project_id=project_id,
                product_id=request.query_params.get("product_id"),
            ),
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def linkable(self, request, slug, project_id):
        """候选池：可以关联进本项目的需求。

        只给有 manage 权限的人 —— 它会露出尚未进入本项目的需求，那是产品侧的内容。
        """
        queryset = linkable_requirements_queryset(slug=slug, project_id=project_id)

        # 候选池的字段来源是**关联产品下的全部需求**，不是已关联的那批
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=Requirement,
            scope={"id__in": queryset.order_by().values_list("id", flat=True)},
        )
        specs, by_requirement_type = field_specs_for_requirement_types(
            requirement_type_ids
        )

        queryset, error = self._apply_common_query(
            request, queryset, specs=specs, by_requirement_type=by_requirement_type
        )
        if error is not None:
            return error

        return self.paginate(
            request=request,
            queryset=annotate_pending(queryset),
            # 候选池同样横跨多个产品，必须用按 product_id 查前缀的那一支，
            # 否则每一行的 display_id 都是 null，弹窗里两条同名需求分不出来
            on_results=lambda rows: MultiProductRequirementSerializer(
                rows, many=True, context=self._row_context(rows)
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def configuration(self, request, slug, project_id):
        """网格渲染自定义列所需的需求类型与字段。

        与产品的 requirement-configuration 形状一致，但**没有 policy** —— 审批配置
        是产品的，项目页不出现任何审批入口。
        """
        requirement_type_ids, specs, by_requirement_type = self._requirement_type_specs(
            project_id
        )
        return Response(
            {
                "policy": None,
                "requirement_types": requirement_types_field_payload_from_specs(
                    requirement_type_ids, by_requirement_type
                ),
                "fields": field_tree_from_specs(specs),
            },
            status=status.HTTP_200_OK,
        )

    # --- 写：关联关系与阶段 ----------------------------------------------

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def create(self, request, slug, project_id):
        """把一批需求关联进本项目。"""
        requirements = request.data.get("requirements", [])
        if not requirements:
            return Response(
                {"error": "Requirements are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        try:
            rows = resolve_linkable_requirements(
                slug=slug, project_id=project_id, requirement_ids=requirements
            )
        except RequirementLinkError as exc:
            return _link_error_response(exc)

        RequirementProject.objects.bulk_create(
            [
                RequirementProject(
                    requirement_id=row.id,
                    project_id=project_id,
                    # bulk_create 不走 ProjectBaseModel.save()，workspace 不会被
                    # 自动派生
                    workspace_id=project.workspace_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                for row in rows
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        # 新关联行默认 linked，无需重算 stage；但它改变了「全部已发布」的分母，
        # 已 implemented 的需求要退回 confirmed
        for row in rows:
            recalculate_requirement_status(row.id)
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def partial_update(self, request, slug, project_id, requirement_id):
        """改本项目内的排序。这是项目对需求唯一的行级写入口。

        stage 显式拒绝而非静默丢弃：它由迭代/发布关联事实派生
        （utils/requirement_project.recalculate_stage），静默会让旧前端以为改成功了，
        联调时最难查的就是 200 但什么都没发生。
        """
        if "stage" in request.data:
            return Response(
                {
                    "error": "Stage is derived from cycle/release facts and cannot be set manually.",
                    "code": "REQUIREMENT_STAGE_DERIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RequirementProjectStageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        link = RequirementProject.objects.filter(
            workspace__slug=slug, project_id=project_id, requirement_id=requirement_id
        ).first()
        if link is None:
            return Response(
                {"error": "This requirement is not linked to the project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        for field, value in serializer.validated_data.items():
            setattr(link, field, value)
        link.updated_by_id = request.user.id
        link.save(
            update_fields=[*serializer.validated_data.keys(), "updated_by", "updated_at"]
        )
        return Response(
            RequirementProjectSerializer(link).data, status=status.HTTP_200_OK
        )

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE)
    def destroy(self, request, slug, project_id, requirement_id):
        """解除关联。软删关联行 —— 需求本体、版本、审批历史一律不动。

        该 (需求, 项目) 下的迭代/发布关联一并软删：它们是项目关联的子事实，
        项目都退出了还留着，重新关联进来会带着旧阶段复活。
        """
        link = RequirementProject.objects.filter(
            workspace__slug=slug, project_id=project_id, requirement_id=requirement_id
        )
        if not link.exists():
            return Response(
                {"error": "This requirement is not linked to the project."},
                status=status.HTTP_404_NOT_FOUND,
            )
        RequirementCycle.objects.filter(
            requirement_id=requirement_id, project_id=project_id
        ).delete()
        RequirementRelease.objects.filter(
            requirement_id=requirement_id, project_id=project_id
        ).delete()
        link.delete()
        # 解除关联改变「全部已发布」的分母 —— 剩下的关联行可能恰好全是已发布
        recalculate_requirement_status(requirement_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- 写：提变更单 ----------------------------------------------------

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def submit_change(self, request, slug, project_id, requirement_id):
        """项目侧发起变更单。

        项目只是提单入口，审批权威不下放：单本身仍是 **product 作用域**，审批人仍是
        产品的名单，走的也是产品那份 submit_change_request，一行没有分叉。
        """
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        requirement = Requirement.objects.filter(
            id=requirement_id, workspace__slug=slug
        ).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not can_submit_change_from_project(request.user, requirement, project):
            return Response(
                {
                    "error": "You cannot submit a change for this requirement from this project."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        policy = resolve_policy_for_linked_requirement(requirement)
        if policy is None:
            return Response(
                {
                    "error": "This product has no approval configuration yet.",
                    "code": "REQUIREMENT_APPROVER_REQUIRED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        reason = request.data.get("reason", "")
        try:
            with transaction.atomic():
                change_request = submit_change_request(
                    policy=policy,
                    items=[{"requirement_id": requirement.id}],
                    reason=reason,
                    actor=request.user,
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)

        return Response(
            RequirementChangeRequestSerializer(
                change_request, context={"request": request}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class RequirementProjectsViewSet(BaseViewSet):
    """需求侧：一条需求进了哪些项目。

    产品作用域的端点 —— 打开的是产品的需求详情，所以按产品的写权限判定
    （can_edit_product_requirements），不是项目权限。
    """

    model = RequirementProject
    serializer_class = RequirementProjectSerializer

    def create(self, request, slug, product_id, requirement_id):
        from plane.utils.product import can_edit_product_requirements

        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not can_edit_product_requirements(request.user, product):
            return Response(
                {"error": "You do not have permission to maintain product requirements."},
                status=status.HTTP_403_FORBIDDEN,
            )

        requirement = Requirement.objects.filter(
            id=requirement_id, product_id=product.id
        ).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if requirement.approved_version is None:
            return Response(
                {
                    "error": "Only approved requirements can enter a project.",
                    "code": "REQUIREMENT_NOT_APPROVED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        projects = request.data.get("projects", [])
        removed_projects = request.data.get("removed_projects", [])

        if projects:
            # 目标项目必须已经关联了这个产品 —— 与项目侧关联走的是同一条规则，
            # 换个方向进来不该松一格
            allowed = set(
                str(item)
                for item in Project.objects.filter(
                    id__in=[str(project) for project in projects],
                    workspace__slug=slug,
                    # 归档项目不再收需求，与 annotate_project_ids 的排除条件对齐
                    archived_at__isnull=True,
                    project_productproject__product_id=product.id,
                    project_productproject__deleted_at__isnull=True,
                ).values_list("id", flat=True)
            )
            rejected = [str(item) for item in projects if str(item) not in allowed]
            if rejected:
                return Response(
                    {
                        "error": "These projects have not linked this product.",
                        "code": "PRODUCT_NOT_LINKED",
                        "project_ids": rejected,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            RequirementProject.objects.bulk_create(
                [
                    RequirementProject(
                        requirement_id=requirement.id,
                        project_id=project_id,
                        workspace_id=product.workspace_id,
                        created_by_id=request.user.id,
                        updated_by_id=request.user.id,
                    )
                    for project_id in allowed
                ],
                batch_size=100,
                ignore_conflicts=True,
            )

        if removed_projects:
            removed_ids = [str(project) for project in removed_projects]
            # 与项目侧 destroy 同一条规则：项目关联退出时，子事实一并软删
            RequirementCycle.objects.filter(
                requirement_id=requirement.id, project_id__in=removed_ids
            ).delete()
            RequirementRelease.objects.filter(
                requirement_id=requirement.id, project_id__in=removed_ids
            ).delete()
            RequirementProject.objects.filter(
                requirement_id=requirement.id,
                project_id__in=removed_ids,
            ).delete()

        # 增删都动了「全部已发布」的分母
        recalculate_requirement_status(requirement.id)
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)
