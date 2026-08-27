"""需求审批与版本的 API 入口。

四组端点：变更单（列表 / 详情 / 提交 / 审批 / 撤回）、变更项分页、单条需求的版本、
单条需求的变更轨迹。

审批的单位是**一条需求**，所以这几组端点全部按需求或按作用域组织，不再有「整条基线」
这个中间层。产品下可以同时存在多张待审变更单。
"""

import math

from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import status
from rest_framework.exceptions import ParseError
from rest_framework.response import Response

from plane.app.serializers import (
    RequirementApprovalInboxSerializer,
    RequirementChangeActionSerializer,
    RequirementChangeItemSerializer,
    RequirementChangeRequestDetailSerializer,
    RequirementChangeRequestSerializer,
    RequirementBaselineEntrySerializer,
    RequirementBaselineSerializer,
    RequirementBaselineWriteSerializer,
    RequirementChangeSubmitSerializer,
    RequirementSchemaRevisionSerializer,
    RequirementVersionSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.app.views.requirement.mixins import (
    can_write_requirements,
    get_requirement_scope,
)
from plane.app.views.requirement.type import is_workspace_member
from plane.db.models import (
    Requirement,
    RequirementBaseline,
    RequirementBaselineEntry,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementChangeType,
    RequirementTypeSchemaRevision,
    RequirementVersion,
)
from plane.utils.paginator import Cursor
from plane.utils.requirement_baseline import (
    baseline_type_stats,
    collect_baseline_entries,
    compare_baselines,
    create_baseline,
)
from plane.utils.requirement_change import (
    RequirementChangeError,
    act_on_change_request,
    build_change_requirement_type_stats,
    cancel_change_request,
    submit_change_request,
)


DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100

TRAIL_CONTENT = "content"
TRAIL_SCHEMA = "schema"


def change_error_response(exc):
    payload = {"error": str(exc), "code": exc.code}
    payload.update(exc.detail or {})
    return Response(payload, status=status.HTTP_409_CONFLICT)


def paginate_sequence(view, request, items, *, total=None, default_per_page=DEFAULT_PER_PAGE):
    """对内存里的列表做游标切片，响应形状与 BasePaginator.paginate 一致。

    total 可以单独给 —— 归并轨迹时每一路只取了前 offset+limit 条，len(items) 不是
    真正的总数。
    """
    per_page = view.get_per_page(request, default_per_page, MAX_PER_PAGE)
    try:
        cursor = Cursor.from_string(request.GET.get(view.cursor_name, f"{per_page}:0:0"))
    except ValueError:
        raise ParseError(detail="Invalid cursor parameter.")
    page = max(cursor.offset, 0)
    offset = page * per_page
    window = items[offset : offset + per_page] if total is None else items
    total = len(items) if total is None else total
    has_next = offset + per_page < total
    return Response(
        {
            "grouped_by": None,
            "sub_grouped_by": None,
            "total_count": total,
            "next_cursor": str(Cursor(per_page, page + 1, False, has_next)),
            "prev_cursor": str(Cursor(per_page, page - 1, True, page > 0)),
            "next_page_results": has_next,
            "prev_page_results": page > 0,
            "count": len(window),
            "total_pages": math.ceil(total / per_page) if per_page else 0,
            "total_results": total,
            "extra_stats": None,
            "results": window,
        },
        status=status.HTTP_200_OK,
    )


class ProductScopedMixin:
    """变更相关端点共用的作用域解析与写权限校验。"""

    def resolve_scope(self, *, for_update=False):
        """返回 (product, scope)；产品不存在或不可见时两者都是 None。"""
        return get_requirement_scope(
            self.request.user,
            slug=self.kwargs.get("slug"),
            product_id=self.kwargs.get("product_id"),
            for_update=for_update,
        )

    def snapshot_context(self, scope):
        """快照序列化用的 context：把编号前缀带进去。

        快照里只存 sequence_id 不存拼好的编号 —— 产品改标识后，历史版本、变更单与
        基线里的编号要跟着变，所以前缀一律读时解析。作用域内是常量，零额外查询。
        """
        return {
            "scope_identifier": (
                scope.product.identifier if scope.product_id else scope.project.identifier
            )
        }

    @staticmethod
    def not_found():
        return Response(
            {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
        )

    @staticmethod
    def forbidden():
        return Response(
            {"error": "You do not have permission to maintain product requirements."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def scope_for_write(self, *, for_update=False):
        """返回 (scope, error_response)。"""
        product, scope = self.resolve_scope(for_update=for_update)
        if product is None:
            return None, self.not_found()
        if not can_write_requirements(self.request.user, product):
            return None, self.forbidden()
        return scope, None

    def scope_filter(self):
        product_id = self.kwargs.get("product_id")
        return {"product_id": product_id}


def change_requests_with_relations():
    return RequirementChangeRequest.objects.prefetch_related(
        Prefetch(
            "approvals",
            queryset=RequirementChangeApproval.objects.select_related(
                "approver"
            ).order_by("created_at", "id"),
        ),
        Prefetch(
            "items",
            queryset=RequirementChangeItem.objects.select_related(
                "requirement_type"
            ).order_by("proposed_sort_order", "created_at", "id"),
        ),
    ).select_related("created_by")


class RequirementChangeRequestViewSet(ProductScopedMixin, BaseViewSet):
    model = RequirementChangeRequest
    serializer_class = RequirementChangeRequestSerializer

    def get_queryset(self):
        return change_requests_with_relations().filter(
            **self.scope_filter(),
            product__workspace__slug=self.workspace_slug,
        )

    def list(self, request, slug, product_id):
        if self.resolve_scope()[1] is None:
            return self.not_found()
        queryset = self.get_queryset()

        change_status = request.query_params.get("status")
        if change_status:
            if change_status not in RequirementChangeStatus.values:
                return Response(
                    {"status": "This status is not supported."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(status=change_status)

        # scope 是「谁的单」：mine = 我提交的，to_review = 等我审批的
        scope = request.query_params.get("scope")
        if scope == "mine":
            queryset = queryset.filter(created_by=request.user)
        elif scope == "to_review":
            queryset = queryset.filter(
                status=RequirementChangeStatus.PENDING,
                approvals__approver=request.user,
                approvals__action__isnull=True,
            ).distinct()

        # 「这条需求被哪些单改过」—— 需求详情的变更单入口
        requirement_id = request.query_params.get("requirement_id")
        if requirement_id:
            queryset = queryset.filter(items__target_id=requirement_id).distinct()

        return self.paginate(
            request=request,
            queryset=queryset.order_by("-created_at"),
            on_results=lambda results: RequirementChangeRequestSerializer(
                results, many=True, context={"request": request}
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    def retrieve(self, request, slug, product_id, pk):
        if self.resolve_scope()[1] is None:
            return self.not_found()
        change_request = self.get_queryset().filter(id=pk).first()
        if change_request is None:
            return Response(
                {"error": "Change request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            RequirementChangeRequestDetailSerializer(
                change_request,
                context={
                    "request": request,
                    "requirement_type_stats": build_change_requirement_type_stats(
                        change_request.id
                    ),
                },
            ).data,
            status=status.HTTP_200_OK,
        )

    def create(self, request, slug, product_id):
        """提交 1..N 条需求进入评审。评审人与规则随这次提交给定，只对这张单有效。"""
        serializer = RequirementChangeSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        try:
            with transaction.atomic():
                scope, error = self.scope_for_write(for_update=True)
                if error is not None:
                    return error
                change_request = submit_change_request(
                    scope=scope,
                    items=validated["items"],
                    approver_ids=validated["approver_ids"],
                    approval_type=validated["approval_type"],
                    required_count=validated["required_count"],
                    reason=validated["reason"],
                    actor=request.user,
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                change_requests_with_relations().get(id=change_request.id),
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def act(self, request, slug, product_id, pk):
        serializer = RequirementChangeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                if self.resolve_scope(for_update=True)[1] is None:
                    return self.not_found()
                change_request = (
                    RequirementChangeRequest.objects.select_for_update()
                    .filter(id=pk, **self.scope_filter())
                    .first()
                )
                if change_request is None:
                    return Response(
                        {"error": "Change request not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                act_on_change_request(
                    change_request=change_request,
                    approver=request.user,
                    action=serializer.validated_data["action"],
                    comment=serializer.validated_data["comment"],
                    revert=serializer.validated_data["revert"],
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                change_requests_with_relations().get(id=pk),
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )

    def cancel(self, request, slug, product_id, pk):
        try:
            with transaction.atomic():
                if self.resolve_scope(for_update=True)[1] is None:
                    return self.not_found()
                change_request = (
                    RequirementChangeRequest.objects.select_for_update()
                    .filter(id=pk, **self.scope_filter())
                    .first()
                )
                if change_request is None:
                    return Response(
                        {"error": "Change request not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if change_request.created_by_id != request.user.id:
                    return Response(
                        {
                            "error": "Only the submitter can withdraw this change request.",
                            "code": "REQUIREMENT_NOT_SUBMITTER",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                cancel_change_request(change_request=change_request, actor=request.user)
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                change_requests_with_relations().get(id=pk),
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


class RequirementChangeItemViewSet(ProductScopedMixin, BaseViewSet):
    """一张变更单里的需求条目分页。

    N 通常是个位数，详情接口会直接内联；只有大批量提交才需要走这里。
    """

    model = RequirementChangeItem
    serializer_class = RequirementChangeItemSerializer

    def list(self, request, slug, product_id, pk):
        _, scope = self.resolve_scope()
        if scope is None:
            return self.not_found()
        queryset = (
            RequirementChangeItem.objects.filter(
                change_request_id=pk,
                change_request__product_id=product_id,
                change_request__product__workspace__slug=self.workspace_slug,
            )
            .select_related("requirement_type")
            .order_by("proposed_sort_order", "created_at", "id")
        )
        change_type = request.query_params.get("change_type")
        if change_type:
            if change_type not in RequirementChangeType.values:
                return Response(
                    {"change_type": "This change type is not supported."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(change_type=change_type)
        requirement_type_id = request.query_params.get("requirement_type_id")
        if requirement_type_id:
            queryset = queryset.filter(requirement_type_id=requirement_type_id)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementChangeItemSerializer(
                results, many=True, context=self.snapshot_context(scope)
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )


class RequirementVersionViewSet(ProductScopedMixin, BaseViewSet):
    """一条需求的版本链。"""

    model = RequirementVersion
    serializer_class = RequirementVersionSerializer

    def list(self, request, slug, product_id, requirement_id):
        _, scope = self.resolve_scope()
        if scope is None:
            return self.not_found()
        queryset = (
            RequirementVersion.objects.filter(
                target_id=requirement_id, product_id=product_id
            )
            .select_related("created_by", "change_request", "schema_revision")
            .order_by("-version")
        )
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementVersionSerializer(
                results, many=True, context=self.snapshot_context(scope)
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )


class RequirementChangeTrailViewSet(ProductScopedMixin, BaseViewSet):
    """单条需求的变更轨迹：内容变更与字段结构变更并成一条时间线。

    两路归并，各自只取前 offset+limit 条 —— 成本由翻页深度决定，与历史总量无关。
    字段结构变更来自 RequirementTypeSchemaRevision：一次类型编辑写一行，这里在**读**
    的时候并进来，而不是给这个类型下每条需求各写一行。
    """

    model = RequirementChangeItem
    serializer_class = RequirementChangeItemSerializer

    def list(self, request, slug, product_id, requirement_id):
        if self.resolve_scope()[1] is None:
            return self.not_found()
        requirement = Requirement.objects.filter(
            id=requirement_id, product_id=product_id
        ).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        kind = request.query_params.get("kind")
        per_page = self.get_per_page(request, DEFAULT_PER_PAGE, MAX_PER_PAGE)
        try:
            cursor = Cursor.from_string(
                request.GET.get(self.cursor_name, f"{per_page}:0:0")
            )
        except ValueError:
            raise ParseError(detail="Invalid cursor parameter.")
        page = max(cursor.offset, 0)
        take = (page + 1) * per_page

        content = []
        schema = []
        if kind != TRAIL_SCHEMA:
            content = list(
                RequirementChangeItem.objects.filter(target_id=requirement.id)
                .select_related(
                    "change_request", "change_request__created_by", "requirement_type"
                )
                .order_by("-created_at", "-id")[:take]
            )
        if kind != TRAIL_CONTENT:
            schema = list(
                RequirementTypeSchemaRevision.objects.filter(
                    requirement_type_id=requirement.requirement_type_id,
                    # 严格大于：需求建出来之前的字段结构变更与它无关；同事务内建的行
                    # 也不该看到那次修订。
                    created_at__gt=requirement.created_at,
                )
                .select_related("created_by", "requirement_type")
                .order_by("-created_at", "-id")[:take]
            )

        merged = sorted(
            [(row.created_at, str(row.id), TRAIL_CONTENT, row) for row in content]
            + [(row.created_at, str(row.id), TRAIL_SCHEMA, row) for row in schema],
            key=lambda entry: (entry[0], entry[1]),
            reverse=True,
        )
        window = merged[page * per_page : (page + 1) * per_page]

        total = 0
        if kind != TRAIL_SCHEMA:
            total += RequirementChangeItem.objects.filter(
                target_id=requirement.id
            ).count()
        if kind != TRAIL_CONTENT:
            total += RequirementTypeSchemaRevision.objects.filter(
                requirement_type_id=requirement.requirement_type_id,
                created_at__gt=requirement.created_at,
            ).count()

        version_by_item = dict(
            RequirementVersion.objects.filter(
                change_item_id__in=[
                    row.id for _, _, entry_kind, row in window if entry_kind == TRAIL_CONTENT
                ]
            ).values_list("change_item_id", "version")
        )

        results = []
        for occurred_at, _, entry_kind, row in window:
            if entry_kind == TRAIL_CONTENT:
                payload = RequirementChangeItemSerializer(row).data
                payload.update(
                    {
                        "kind": TRAIL_CONTENT,
                        "occurred_at": occurred_at,
                        "change_request_id": str(row.change_request_id),
                        "sequence_id": row.change_request.sequence_id,
                        "change_status": row.change_request.status,
                        "reason": row.change_request.reason,
                        "actor_detail": _user_lite(row.change_request.created_by),
                        "version": version_by_item.get(row.id),
                    }
                )
            else:
                payload = RequirementSchemaRevisionSerializer(row).data
                payload.update({"kind": TRAIL_SCHEMA, "occurred_at": occurred_at})
            results.append(payload)

        return paginate_sequence(self, request, results, total=total)


def _user_lite(user):
    from plane.app.serializers.user import UserLiteSerializer

    return UserLiteSerializer(user).data if user is not None else None


class RequirementBaselineViewSet(ProductScopedMixin, BaseViewSet):
    """需求基线：一组 (需求, 版本) 的不可变命名快照。

    内容创建后不可改 —— PATCH 只接受名称与说明。想「更新基线」就再打一份新的，那正是
    快照该有的语义。
    """

    model = RequirementBaseline
    serializer_class = RequirementBaselineSerializer

    def get_queryset(self):
        return RequirementBaseline.objects.filter(
            product_id=self.kwargs.get("product_id"),
            product__workspace__slug=self.workspace_slug,
        ).select_related("created_by")

    def list(self, request, slug, product_id):
        if self.resolve_scope()[1] is None:
            return self.not_found()
        return self.paginate(
            request=request,
            queryset=self.get_queryset().order_by("-created_at"),
            on_results=lambda results: RequirementBaselineSerializer(
                results, many=True, context={"request": request}
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    def create(self, request, slug, product_id):
        """打基线。`?preview=1` 只算不写 —— 弹窗要先告诉用户会纳入多少、漏掉哪些。"""
        is_preview = request.query_params.get("preview") in ("1", "true", "True")
        serializer = RequirementBaselineWriteSerializer(
            data=request.data, context={"preview": is_preview}
        )
        serializer.is_valid(raise_exception=True)
        scope = serializer.validated_data["scope"]
        requirement_type_ids = (
            serializer.validated_data["requirement_type_ids"] if scope == "by_type" else None
        )
        requirement_ids = (
            serializer.validated_data["requirement_ids"] if scope == "by_requirement" else None
        )

        with transaction.atomic():
            scope, error = self.scope_for_write(for_update=not is_preview)
            if error is not None:
                return error

            if is_preview:
                entries, skipped, stale = collect_baseline_entries(
                    scope,
                    requirement_type_ids=requirement_type_ids,
                    requirement_ids=requirement_ids,
                )
                return Response(
                    {
                        "preview": True,
                        "entry_count": len(entries),
                        "skipped": skipped,
                        "stale": stale,
                    },
                    status=status.HTTP_200_OK,
                )

            baseline, skipped, stale = create_baseline(
                scope,
                name=serializer.validated_data["name"],
                description=serializer.validated_data["description"],
                requirement_type_ids=requirement_type_ids,
                requirement_ids=requirement_ids,
                actor=request.user,
            )

        payload = RequirementBaselineSerializer(
            baseline,
            context={
                "request": request,
                "requirement_type_stats": baseline_type_stats(baseline),
            },
        ).data
        # skipped / stale 只在创建时返回一次 —— 它们描述的是「打这一份时的现场」，
        # 不是基线本身的属性，落库反而会让人以为可以事后追溯。
        payload["skipped"] = skipped
        payload["stale"] = stale
        return Response(payload, status=status.HTTP_201_CREATED)

    def retrieve(self, request, slug, product_id, pk):
        if self.resolve_scope()[1] is None:
            return self.not_found()
        baseline = self.get_queryset().filter(id=pk).first()
        if baseline is None:
            return Response(
                {"error": "Requirement baseline not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            RequirementBaselineSerializer(
                baseline,
                context={
                    "request": request,
                    "requirement_type_stats": baseline_type_stats(baseline),
                },
            ).data,
            status=status.HTTP_200_OK,
        )

    def partial_update(self, request, slug, product_id, pk):
        _, error = self.scope_for_write()
        if error is not None:
            return error
        baseline = self.get_queryset().filter(id=pk).first()
        if baseline is None:
            return Response(
                {"error": "Requirement baseline not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = RequirementBaselineSerializer(
            baseline, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, product_id, pk):
        _, error = self.scope_for_write()
        if error is not None:
            return error
        baseline = self.get_queryset().filter(id=pk).first()
        if baseline is None:
            return Response(
                {"error": "Requirement baseline not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        baseline.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def requirements(self, request, slug, product_id, pk):
        """基线收录的条目。内容与字段结构都取自被收录的那一版，不跟随需求现状。"""
        _, scope = self.resolve_scope()
        if scope is None:
            return self.not_found()
        baseline = self.get_queryset().filter(id=pk).first()
        if baseline is None:
            return Response(
                {"error": "Requirement baseline not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        queryset = (
            RequirementBaselineEntry.objects.filter(baseline=baseline)
            .select_related("version", "version__schema_revision")
            .order_by("sort_order", "id")
        )
        requirement_type_id = request.query_params.get("requirement_type_id")
        if requirement_type_id:
            queryset = queryset.filter(version__requirement_type_id=requirement_type_id)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementBaselineEntrySerializer(
                results, many=True, context=self.snapshot_context(scope)
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    def compare(self, request, slug, product_id, pk):
        """与另一个基线对比。`?to=<baselineId>`。"""
        if self.resolve_scope()[1] is None:
            return self.not_found()
        from_baseline = self.get_queryset().filter(id=pk).first()
        to_id = request.query_params.get("to")
        to_baseline = self.get_queryset().filter(id=to_id).first() if to_id else None
        if from_baseline is None or to_baseline is None:
            return Response(
                {"error": "Requirement baseline not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if from_baseline.id == to_baseline.id:
            return Response(
                {"to": "Choose two different baselines to compare."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        items = compare_baselines(from_baseline, to_baseline)
        response = paginate_sequence(self, request, items)
        response.data.update(
            {
                "from_baseline": {"id": str(from_baseline.id), "name": from_baseline.name},
                "to_baseline": {"id": str(to_baseline.id), "name": to_baseline.name},
            }
        )
        return response


class RequirementApprovalInboxAPIView(BaseAPIView):
    """待我审批：跨产品聚合当前用户名下的需求变更单。

    GET /workspaces/<slug>/requirement-approvals/?tab=pending|processed&product_id=

    作用域是**工作区**而不是产品：一个人可能是三个产品的审批人，产品级的入口等于让他
    记住自己要去哪三个地方看。产品页头部的入口用 product_id 收窄到当前产品。

    响应信封与工作项的 my-approvals 一致（`{results, pending_count}` + X-Pending-Count），
    前端画角标的那套逻辑不必为需求再写一遍。
    """

    # 收件箱是待办不是档案：超过这个数说明该去变更记录页筛，不该在弹窗里翻
    INBOX_LIMIT = 50

    def get(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return Response(
                {"error": "You do not have access to this workspace."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tab = request.query_params.get("tab", "pending")
        if tab not in ("pending", "processed"):
            return Response(
                {"tab": "This tab is not supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 「我是审批人」本身就是最强的作用域约束 —— 只在此之上按工作区与产品收窄
        scope = Q(product__workspace__slug=slug)
        product_id = request.query_params.get("product_id")
        if product_id:
            scope &= Q(product_id=product_id)

        mine = Q(approvals__approver=request.user)
        pending = mine & Q(
            approvals__action__isnull=True, status=RequirementChangeStatus.PENDING
        )

        queryset = change_requests_with_relations().filter(scope).select_related("product")
        queryset = (
            queryset.filter(pending)
            if tab == "pending"
            # 已办：我表态过的单，不管这张单最后是通过、驳回还是被撤回
            else queryset.filter(mine & Q(approvals__action__isnull=False))
        ).distinct()

        results = list(queryset.order_by("-created_at")[: self.INBOX_LIMIT])
        pending_count = (
            RequirementChangeRequest.objects.filter(scope & pending).distinct().count()
        )

        response = Response(
            {
                "results": RequirementApprovalInboxSerializer(
                    results, many=True, context={"request": request}
                ).data,
                "pending_count": pending_count,
            },
            status=status.HTTP_200_OK,
        )
        response["X-Pending-Count"] = str(pending_count)
        return response
