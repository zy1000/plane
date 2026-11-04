from gunicorn.util import close
import json
import uuid
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from plane.app.permissions import PermissionKey, is_workspace_member
from plane.app.permissions.base import _get_user_product_permission_keys
from plane.app.serializers.qa import ReviewModuleCreateUpdateSerializer, ReviewModuleDetailSerializer, \
    ReviewModuleListSerializer, ReviewListSerializer, ReviewCreateUpdateSerializer, \
    ReviewCaseRecordsSerializer, ReviewSerializer
from plane.app.views import BaseAPIView, BaseViewSet
from plane.app.views.qa.case_scope import (
    CASE_VIEW,
    as_id_list,
    case_scope_error,
    product_scope_error,
    project_scope_error,
    review_scope_error,
)
from plane.db.models import CaseReview, CaseReviewModule, CaseReviewThrough, CaseModule, TestCase, CaseReviewRecord, \
    TestCaseRepository, TestCaseVersion, Product
from plane.bgtasks.test_case_activities_task import test_case_activity
from plane.utils.paginator import CustomPaginator
from plane.utils.qa import (
    build_review_case_rows,
    invalid_workspace_member_ids,
    set_review_case_assignees,
    sync_review_reviewer_summary,
    update_case_review_status,
    update_review_status,
)
from plane.utils.response import list_response
from plane.app.views.qa.filters import CaseReviewFilter
from plane.app.views.qa.plan import NumericSuffixCodeOrderingFilter
from plane.app.views.qa.utils import build_module_filter_q
from plane.app.views.qa.product_scope import allow_product_scope, product_repository_ids

REVIEW_VIEW = (PermissionKey.PROJECT_CASE_REVIEW_VIEW,)
REVIEW_EDIT = (PermissionKey.PROJECT_CASE_REVIEW_EDIT,)


def _member_error(request, slug):
    if not is_workspace_member(request.user, slug):
        return Response({"error": "You must be an active workspace member."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _review_workspace_q(slug, prefix=""):
    """评审属于本工作区：挂了产品看产品，还没挂产品的存量评审看项目。prefix 是指到评审的路径（如 "crt__review__"）。"""
    return Q(**{f"{prefix}product__workspace__slug": slug}) | Q(**{f"{prefix}project__workspace__slug": slug})


def _review_module_scope_error(request, slug, module_ids, *, keys):
    """评审模块：有产品按产品判断，存量（只有项目）按项目判断；模块须属于本工作区，否则 404。"""
    try:
        ids = {str(uuid.UUID(value)) for value in as_id_list(module_ids)}
    except ValueError:
        return Response({"error": "评审模块不存在。"}, status=status.HTTP_404_NOT_FOUND)
    if not ids:
        return Response({"error": "缺少评审模块。"}, status=status.HTTP_400_BAD_REQUEST)
    rows = list(
        CaseReviewModule.objects.filter(
            Q(product__workspace__slug=slug) | Q(product__isnull=True, project__workspace__slug=slug),
            id__in=list(ids),
        ).values("id", "product_id", "project_id")
    )
    if len(rows) != len(ids):
        return Response({"error": "评审模块不存在。"}, status=status.HTTP_404_NOT_FOUND)
    product_ids = {str(row["product_id"]) for row in rows if row["product_id"]}
    project_ids = {str(row["project_id"]) for row in rows if not row["product_id"]}
    if product_ids:
        error = product_scope_error(request, slug, product_ids, keys=keys)
        if error is not None:
            return error
    if project_ids:
        return project_scope_error(request, slug, project_ids, keys=keys)
    return None


def _readable_review_product_ids(request, slug):
    """没指定产品时：本工作区有评审、且这个人能看到并持有 project.case_review.view 的产品。"""
    from plane.utils.product import can_view_product

    wanted = {key.value for key in REVIEW_VIEW}
    product_ids = set(
        CaseReview.objects.filter(product__workspace__slug=slug).order_by().values_list("product_id", flat=True)
    )
    products = Product.objects.filter(id__in=list(product_ids), workspace__slug=slug).select_related("workspace")
    return [
        product.id
        for product in products
        if can_view_product(request.user, product) and (_get_user_product_permission_keys(request.user, product) & wanted)
    ]


class ReviewModuleAPIView(BaseAPIView):
    serializer_class = ReviewModuleListSerializer
    filterset_fields = {
        'name': ['exact', 'icontains', 'in'],
        'product_id': ['exact'],
    }

    def workspace_queryset(self, slug):
        return CaseReviewModule.objects.filter(product__workspace__slug=slug)

    def post(self, request, slug):
        serializer = ReviewModuleCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data.get('product')
        if product is None or product.workspace.slug != slug:
            return Response({"error": "product is required"}, status=status.HTTP_400_BAD_REQUEST)
        error = product_scope_error(request, slug, [product.id], keys=REVIEW_EDIT)
        if error is not None:
            return error
        parent = serializer.validated_data.get('parent')
        if parent is not None and parent.product_id != product.id:
            return Response({"error": "parent belongs to another product"}, status=status.HTTP_400_BAD_REQUEST)
        test_plan = serializer.save()
        serializer = ReviewModuleDetailSerializer(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request, slug):
        product_id = request.query_params.get('product_id')
        if not product_id:
            return Response({"error": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        error = product_scope_error(request, slug, [product_id], keys=REVIEW_VIEW)
        if error is not None:
            return error
        query = self.filter_queryset(self.workspace_queryset(slug).filter(parent=None)).order_by('created_at')
        serializer = self.serializer_class(instance=query, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug):
        module_ids = request.data.pop('ids')
        error = _review_module_scope_error(request, slug, module_ids, keys=REVIEW_EDIT)
        if error is not None:
            return error
        self.workspace_queryset(slug).filter(id__in=module_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewModuleDetailAPIView(BaseAPIView):
    queryset = CaseReviewModule.objects.all()
    serializer_class = ReviewModuleCreateUpdateSerializer

    def patch(self, request, slug, module_id):
        error = _review_module_scope_error(request, slug, [module_id], keys=REVIEW_EDIT)
        if error is not None:
            return error
        module = get_object_or_404(
            self.queryset,
            id=module_id,
            deleted_at__isnull=True,
            product__workspace__slug=slug,
        )
        # 模块不能借更新挪到别的产品
        request.data.pop('product', None)
        serializer = self.serializer_class(instance=module, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # 也不能借改上级挂到别的产品（或别的工作区）的模块下
        parent = serializer.validated_data.get('parent')
        if parent is not None and parent.product_id != module.product_id:
            return Response({"error": "parent belongs to another product"}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        module.refresh_from_db()
        return Response(ReviewModuleListSerializer(instance=module).data, status=status.HTTP_200_OK)


class CaseReviewAPIView(BaseAPIView):
    queryset = CaseReview.objects.all()
    pagination_class = CustomPaginator
    serializer_class = ReviewListSerializer
    filterset_class = CaseReviewFilter
    filter_backends = (
        DjangoFilterBackend,
        SearchFilter,
        NumericSuffixCodeOrderingFilter,
    )
    ordering_fields = ["name", "created_at", "started_at", "ended_at", "state", "mode"]

    def product_queryset(self, slug, product_id):
        return self.queryset.filter(product_id=product_id, product__workspace__slug=slug)

    def invalid_scope(self, serializer, product_id):
        """评审模块与评审用例都必须属于本产品。"""
        module = serializer.validated_data.get('module')
        if module is not None and str(module.product_id) != str(product_id):
            return Response({"error": "module belongs to another product"}, status=status.HTTP_400_BAD_REQUEST)
        cases = serializer.validated_data.get('cases') or []
        repo_ids = set(product_repository_ids(product_id))
        if any(case.repository_id not in repo_ids for case in cases):
            return Response({"error": "cases belong to another product"}, status=status.HTTP_400_BAD_REQUEST)
        return None

    @allow_product_scope(PermissionKey.PROJECT_CASE_REVIEW_CREATE)
    def post(self, request, slug, product_id):
        # 产品由 URL 决定（唯一约束校验需要它出现在载荷里）
        data = request.data.copy()
        data.pop('project', None)
        data['product'] = str(product_id)
        serializer = ReviewCreateUpdateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        error = self.invalid_scope(serializer, product_id)
        if error is not None:
            return error
        test_plan = serializer.save()
        serializer = self.serializer_class(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_product_scope(PermissionKey.PROJECT_CASE_REVIEW_VIEW)
    def get(self, request, slug, product_id):
        cases = self.filter_queryset(self.product_queryset(slug, product_id))
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @allow_product_scope(PermissionKey.PROJECT_CASE_REVIEW_EDIT)
    def put(self, request, slug, product_id):
        review_id = request.data.pop('id')
        request.data.pop('project', None)
        request.data.pop('product', None)
        review = get_object_or_404(self.product_queryset(slug, product_id), id=review_id)
        update_serializer = ReviewCreateUpdateSerializer(instance=review, data=request.data, partial=True)
        update_serializer.is_valid(raise_exception=True)
        error = self.invalid_scope(update_serializer, product_id)
        if error is not None:
            return error
        update_serializer.save()
        serializer = self.serializer_class(instance=review)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_product_scope(PermissionKey.PROJECT_CASE_REVIEW_DELETE)
    def delete(self, request, slug, product_id):
        ids = request.data.pop('ids')
        self.product_queryset(slug, product_id).filter(id__in=ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewListAPIView(BaseAPIView):
    queryset = CaseReview.objects.all()
    serializer_class = ReviewSerializer

    filterset_fields = {
        'product_id': ['exact', 'in'],
    }

    def get(self, request, slug):
        product_ids = [
            value
            for key in ('product_id', 'product_id__in')
            for raw in request.query_params.getlist(key)
            for value in as_id_list(raw)
        ]
        if product_ids:
            error = product_scope_error(request, slug, product_ids, keys=REVIEW_VIEW)
        else:
            error = _member_error(request, slug)
        if error is not None:
            return error
        queryset = self.filter_queryset(self.queryset.filter(product__workspace__slug=slug)).distinct()
        if not product_ids:
            queryset = queryset.filter(product_id__in=_readable_review_product_ids(request, slug))
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CaseReviewView(BaseViewSet):
    pagination_class = CustomPaginator
    ordering_fields = ["case__updated_at", "case__code"]

    @action(detail=False, methods=['get'], url_path='enums')
    def get_enums(self, request, slug):
        result = dict()
        result['CaseReviewThrough_Result'] = {label: dict(label=label, color=color) for label, color in
                                              CaseReviewThrough.Result.choices}
        result['CaseReview_State'] = {label: dict(label=label, color=color) for label, color in
                                      CaseReview.State.choices}
        result['CaseReview_ReviewMode'] = {label: dict(label=label, color=color) for label, color in
                                           CaseReview.ReviewMode.choices}
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='cancel-case')
    def cancel_case(self, request, slug):
        product_id = request.query_params.get('product_id')
        qs = CaseReviewThrough.objects.filter(
            id__in=request.data['ids'], review__product__workspace__slug=slug
        )
        if product_id:
            qs = qs.filter(review__product_id=product_id)
        review_ids = set(qs.order_by().values_list('review_id', flat=True))
        if review_ids:
            error = review_scope_error(request, slug, review_ids, keys=REVIEW_EDIT)
        else:
            error = _member_error(request, slug)
        if error is not None:
            return error
        qs.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='add-cases')
    def add_cases(self, request, slug):
        review_id = request.data.get('review_id')
        raw_case_ids = request.data.get('case_ids')
        assignee_ids = request.data.get('assignees') or []

        if not isinstance(assignee_ids, list):
            return Response({"error": "assignees must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(raw_case_ids, list) or len(raw_case_ids) == 0:
            return Response({"error": "case_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            case_ids = [uuid.UUID(str(i)) for i in raw_case_ids if i]
        except Exception:
            return Response({"error": "Invalid case_ids"}, status=status.HTTP_400_BAD_REQUEST)

        if not case_ids:
            return Response({"error": "case_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        error = review_scope_error(request, slug, [review_id], keys=REVIEW_EDIT)
        if error is not None:
            return error
        error = case_scope_error(request, slug, keys=CASE_VIEW, case_ids=case_ids)
        if error is not None:
            return error

        product_id = request.query_params.get('product_id')
        review_lookup = {"id": review_id, "deleted_at__isnull": True, "product__workspace__slug": slug}
        if product_id:
            review_lookup["product_id"] = product_id
        review = get_object_or_404(CaseReview, **review_lookup)

        if assignee_ids and invalid_workspace_member_ids(slug, assignee_ids):
            return Response({"error": "assignee is invalid"}, status=status.HTTP_400_BAD_REQUEST)

        repo_ids = list(product_repository_ids(review.product_id))

        found_case_ids = set(
            TestCase.objects.filter(id__in=case_ids, repository_id__in=repo_ids, deleted_at__isnull=True).values_list(
                'id', flat=True
            )
        )
        missing_case_ids = set(case_ids) - found_case_ids
        if missing_case_ids:
            missing_str = ",".join(sorted([str(i) for i in missing_case_ids]))
            return Response({"error": f"TestCase not found: {missing_str}"}, status=status.HTTP_404_NOT_FOUND)

        existing_case_ids = set(
            CaseReviewThrough.objects.filter(review=review, case_id__in=list(found_case_ids)).values_list('case_id',
                                                                                                          flat=True)
        )

        to_create_case_ids = found_case_ids - existing_case_ids
        if to_create_case_ids:
            created = CaseReviewThrough.objects.bulk_create(
                [CaseReviewThrough(review=review, case_id=case_id, created_by=request.user) for case_id in
                 to_create_case_ids],
                batch_size=1000,
            )
            if assignee_ids:
                set_review_case_assignees([crt.id for crt in created], assignee_ids)
                for crt in created:
                    update_case_review_status(review, crt)
                sync_review_reviewer_summary(review)
            update_review_status(review)


        return Response(status=status.HTTP_200_OK)

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='case-assignees')
    def case_assignees(self, request, slug):
        """整体覆盖一批评审用例的评审人。ids 传一条即行内编辑，传多条即批量设置。"""
        review_id = request.data.get('review_id')
        raw_ids = request.data.get('ids')
        assignee_ids = request.data.get('assignees')

        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            return Response({"error": "ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        if assignee_ids is None:
            assignee_ids = []
        if not isinstance(assignee_ids, list):
            return Response({"error": "assignees must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        error = review_scope_error(request, slug, [review_id], keys=REVIEW_EDIT)
        if error is not None:
            return error

        product_id = request.query_params.get('product_id')
        review_lookup = {"id": review_id, "deleted_at__isnull": True, "product__workspace__slug": slug}
        if product_id:
            review_lookup["product_id"] = product_id
        review = get_object_or_404(CaseReview, **review_lookup)

        if assignee_ids and invalid_workspace_member_ids(slug, assignee_ids):
            return Response({"error": "assignee is invalid"}, status=status.HTTP_400_BAD_REQUEST)

        # 只认属于该评审单的行，越界 id 直接丢弃
        crts = list(
            CaseReviewThrough.objects.filter(
                id__in=raw_ids, review=review, deleted_at__isnull=True
            )
        )
        if not crts:
            return Response({"error": "no review case matched"}, status=status.HTTP_404_NOT_FOUND)

        set_review_case_assignees([crt.id for crt in crts], assignee_ids)
        for crt in crts:
            update_case_review_status(review, crt)
        sync_review_reviewer_summary(review)

        return Response(status=status.HTTP_200_OK)

    @staticmethod
    def _query_param_values(request, *keys):
        values = []
        for key in keys:
            for raw in request.query_params.getlist(key):
                if raw is None:
                    continue
                values.extend([part.strip() for part in str(raw).split(',') if part.strip()])
        return list(dict.fromkeys(values))

    def _filtered_case_through_qs(self, request, slug):
        review_id = request.query_params.get('review_id')
        query = (
            CaseReviewThrough.objects.filter(
                review_id=review_id,
                deleted_at__isnull=True,
                review__deleted_at__isnull=True,
                review__product__workspace__slug=slug,
                case__deleted_at__isnull=True,
            )
        )
        if product_id := request.query_params.get('product_id'):
            query = query.filter(review__product_id=product_id, case__repository__product_id=product_id)

        repository_ids = self._query_param_values(request, 'repository_id', 'repository_ids')
        if repository_ids:
            query = query.filter(case__repository_id__in=repository_ids)

        if name := request.query_params.get('name__icontains'):
            query = query.filter(Q(case__name__icontains=name) | Q(case__code__icontains=name))

        result_values = self._query_param_values(request, 'result__in')
        if result_values:
            query = query.filter(result__in=result_values)

        priority_values = self._query_param_values(request, 'priority__in')
        if priority_values:
            query = query.filter(case__priority__in=priority_values)

        assignee_values = self._query_param_values(request, 'assignee__in')
        if assignee_values:
            query = query.filter(assignees__id__in=assignee_values).distinct()

        # 树选中（module_id）与富筛选（module_ids）各自递归含子模块后取交集；"none" = 未归类（用例 module 为空）
        for key in ('module_id', 'module_ids'):
            module_q = build_module_filter_q(self._query_param_values(request, key), field='case__module_id')
            if module_q is not None:
                query = query.filter(module_q)

        return NumericSuffixCodeOrderingFilter().filter_queryset(request, query, self)

    @action(detail=False, methods=['get'], url_path='case-list')
    def case_list(self, request, slug):
        if not request.query_params.get('review_id'):
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        error = review_scope_error(request, slug, [request.query_params.get('review_id')], keys=REVIEW_VIEW)
        if error is not None:
            return error

        # 列表只用得上这几列，扁平取；评审人、结论、建议数由 build_review_case_rows 整页一次性补齐
        query = self._filtered_case_through_qs(request, slug).values(
            "id",
            "case_id",
            "result",
            "created_by_id",
            "case__name",
            "case__code",
            "case__priority",
            "case__repository__name",
            "case__module__name",
        )
        # slim=true 的调用方（评审页卡片列表）不需要每行的评审人 id，只看 mine 和待评审头像
        slim = str(request.query_params.get("slim", "")).strip().lower() in {"1", "true", "yes"}
        all_param = str(request.query_params.get("all", "")).strip().lower()
        if all_param in {"1", "true", "yes"}:
            rows = list(query)
            return list_response(
                data=build_review_case_rows(rows, request.user.id, include_assignees=not slim),
                count=len(rows),
            )
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        return list_response(
            data=build_review_case_rows(paginated_queryset, request.user.id, include_assignees=not slim),
            count=query.count(),
        )

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='case-review')
    def case_review(self, request, slug):
        # 输入参数
        review_id = request.data.get('review_id')
        case_ids = request.data.get('case_id')
        record_result = request.data.get('result')
        reason = request.data.get('reason')
        # 评审人一律是当前登录的人；不再信请求里的 assignee（否则能冒充别的评审人提交结论）
        assignee_id = str(request.user.id)

        if isinstance(case_ids, str):
            case_ids = [case_ids]

        error = review_scope_error(request, slug, [review_id], keys=REVIEW_VIEW)
        if error is not None:
            return error

        cr = CaseReview.objects.filter(_review_workspace_q(slug)).get(id=review_id)
        skipped_case_ids = []

        for case_id in case_ids:
            crt = CaseReviewThrough.objects.get(review=cr, case_id=case_id)

            # 评审人是用例级的：只有本条用例的评审人才能给出结论，其他人只能提「建议」
            if record_result != CaseReviewRecord.Result.SUGGEST and not crt.assignees.filter(
                id=assignee_id
            ).exists():
                skipped_case_ids.append(str(case_id))
                continue

            # 评审前记录当前结果，用于活动对比
            old_review_result = crt.result

            # 该评审人员上一次评审结果也是通过，本次结果也是通过,并且该用例的结果不为不通过或者重新提审，则只更新记录时间

            last_record = None
            if assignee_id:
                last_record = (
                    CaseReviewRecord.objects
                    .filter(crt=crt, assignee_id=assignee_id)
                    .order_by('-created_at')
                    .first()
                )

            if (
                record_result == CaseReviewRecord.Result.PASS
                and last_record
                and last_record.result == CaseReviewRecord.Result.PASS
            ):
                last_record.created_at = timezone.now()
                last_record.save(update_fields=['created_at', 'updated_at'])
            else:
                # 记录评审历史：每次提交一条记录，保留历史
                CaseReviewRecord.objects.create(
                    result=record_result,
                    reason=reason,
                    assignee_id=assignee_id,
                    crt=crt,
                )

            update_case_review_status(cr, crt)

            # 触发评审状态活动
            crt.refresh_from_db()
            new_review_result = crt.result
            if old_review_result != new_review_result:
                test_case_activity.delay(
                    type="case_review.activity.updated",
                    requested_data=json.dumps({
                        "old_review": old_review_result,
                        "new_review": new_review_result,
                    }),
                    current_instance=None,
                    case_id=str(case_id),
                    actor_id=str(request.user.id) if hasattr(request, 'user') else None,
                    epoch=int(timezone.now().timestamp()),
                )

            # 如果评审通过，则创建用例快照
            if crt.result == CaseReviewThrough.Result.PASS:
                TestCaseVersion.create_from_case(case=TestCase.objects.get(id=case_id))

        return Response({"skipped_case_ids": skipped_case_ids}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='records')
    def get_records(self, request, slug):
        review_id = request.query_params['review_id']
        case_id = request.query_params['case_id']
        error = review_scope_error(request, slug, [review_id], keys=REVIEW_VIEW)
        if error is not None:
            return error
        crt = CaseReviewThrough.objects.filter(_review_workspace_q(slug, "review__")).get(
            review=review_id, case_id=case_id
        )
        query = CaseReviewRecord.objects.filter(crt=crt)
        serializer = ReviewCaseRecordsSerializer(instance=query, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['put'], url_path='confirm')
    def confirm_record(self, request, slug):
        record_id = request.query_params.get('record_id')
        instance = get_object_or_404(
            CaseReviewRecord.objects.select_related('crt').filter(_review_workspace_q(slug, "crt__review__")),
            id=record_id,
        )
        error = review_scope_error(request, slug, [instance.crt.review_id], keys=REVIEW_VIEW)
        if error is not None:
            return error
        instance.confirmed = True
        instance.save(update_fields=['confirmed'])
        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete'], url_path='delete-record')
    def delete_record(self, request, slug):
        record_id = request.query_params.get('record_id')
        instance = get_object_or_404(
            CaseReviewRecord.objects.select_related('crt'),
            id=record_id,
            crt__review__product__workspace__slug=slug,
        )
        error = review_scope_error(request, slug, [instance.crt.review_id], keys=REVIEW_VIEW)
        if error is not None:
            return error

        if str(instance.assignee_id) != str(request.user.id):
            return Response({"detail": "只能删除本人提交的评审记录"}, status=status.HTTP_403_FORBIDDEN)

        if instance.result != CaseReviewRecord.Result.SUGGEST:
            return Response({"detail": "仅可删除本人提交的建议记录"}, status=status.HTTP_400_BAD_REQUEST)

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
