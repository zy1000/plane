from gunicorn.util import close
import json
import uuid
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count, Q, Prefetch
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.app.serializers.qa import ReviewModuleCreateUpdateSerializer, ReviewModuleDetailSerializer, \
    ReviewModuleListSerializer, ReviewListSerializer, ReviewCreateUpdateSerializer, ReviewCaseListSerializer, \
    ReviewCaseRecordsSerializer, ReviewSerializer
from plane.app.views import BaseAPIView, BaseViewSet
from plane.db.models import CaseReview, CaseReviewModule, CaseReviewThrough, CaseModule, TestCase, CaseReviewRecord, \
    TestCaseRepository, TestCaseVersion
from plane.bgtasks.test_case_activities_task import test_case_activity
from plane.utils.paginator import CustomPaginator
from plane.utils.qa import update_case_review_status, update_review_status
from plane.utils.response import list_response
from plane.app.views.qa.filters import CaseReviewFilter
from plane.app.views.qa.plan import NumericSuffixCodeOrderingFilter


class ReviewModuleAPIView(BaseAPIView):
    queryset = CaseReviewModule.objects.all()
    serializer_class = ReviewModuleListSerializer
    filterset_fields = {
        'name': ['exact', 'icontains', 'in'],
        'project_id': ['exact'],
    }

    def post(self, request, slug):
        serializer = ReviewModuleCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_plan = serializer.save()
        serializer = ReviewModuleDetailSerializer(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request, slug):
        query = self.filter_queryset(self.queryset.filter(parent=None)).order_by('created_at')
        serializer = self.serializer_class(instance=query, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug):
        module_ids = request.data.pop('ids')
        self.queryset.filter(id__in=module_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewModuleDetailAPIView(BaseAPIView):
    queryset = CaseReviewModule.objects.all()
    serializer_class = ReviewModuleCreateUpdateSerializer

    def patch(self, request, slug, module_id):
        module = get_object_or_404(
            self.queryset,
            id=module_id,
            deleted_at__isnull=True,
            project__workspace__slug=slug,
        )
        serializer = self.serializer_class(instance=module, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
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

    @allow_fine_permission(PermissionKey.QA_REVIEW_CREATE)
    def post(self, request, slug, project_id):
        serializer = ReviewCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_plan = serializer.save()
        serializer = self.serializer_class(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.QA_REVIEW_VIEW)
    def get(self, request, slug, project_id):
        cases = self.filter_queryset(self.queryset.filter(project_id=project_id))
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @allow_fine_permission(PermissionKey.QA_REVIEW_EDIT)
    def put(self, request, slug, project_id):
        review_id = request.data.pop('id')
        review = self.queryset.get(id=review_id, project_id=project_id)
        update_serializer = ReviewCreateUpdateSerializer(instance=review, data=request.data, partial=True)
        update_serializer.is_valid(raise_exception=True)
        update_serializer.save()
        serializer = self.serializer_class(instance=review)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.QA_REVIEW_DELETE)
    def delete(self, request, slug, project_id):
        ids = request.data.pop('ids')
        self.queryset.filter(id__in=ids, project_id=project_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewListAPIView(BaseAPIView):
    queryset = CaseReview.objects.all()
    serializer_class = ReviewSerializer

    filterset_fields = {
        'project_id': ['exact', 'in'],
    }

    def get(self, request, slug):
        queryset = self.filter_queryset(self.queryset.filter(project__workspace__slug=slug)).distinct()
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
    @allow_fine_permission(PermissionKey.QA_REVIEW_EDIT)
    def cancel_case(self, request, slug):
        project_id = request.query_params.get('project_id')
        qs = CaseReviewThrough.objects.filter(id__in=request.data['ids'])
        if project_id:
            qs = qs.filter(review__project_id=project_id)
        qs.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='add-cases')
    @allow_fine_permission(PermissionKey.QA_REVIEW_EDIT)
    def add_cases(self, request, slug):
        review_id = request.data.get('review_id')
        raw_case_ids = request.data.get('case_ids')

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

        project_id = request.query_params.get('project_id')
        review_lookup = {"id": review_id, "deleted_at__isnull": True, "project__workspace__slug": slug}
        if project_id:
            review_lookup["project_id"] = project_id
        review = get_object_or_404(CaseReview, **review_lookup)

        repo_ids = list(
            TestCaseRepository.objects.filter(
                project_id=review.project_id, workspace__slug=slug, deleted_at__isnull=True
            ).values_list('id', flat=True)
        )

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
            CaseReviewThrough.objects.bulk_create(
                [CaseReviewThrough(review=review, case_id=case_id, created_by=request.user) for case_id in
                 to_create_case_ids],
                batch_size=1000,
            )
            update_review_status(review)


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

    @staticmethod
    def _expand_case_module_ids(module_ids):
        expanded = {str(module_id) for module_id in module_ids if module_id}
        frontier = list(expanded)
        while frontier:
            children = list(
                CaseModule.objects.filter(parent_id__in=frontier, deleted_at__isnull=True).values_list('id', flat=True)
            )
            new_children = [str(child) for child in children if str(child) not in expanded]
            if not new_children:
                break
            expanded.update(new_children)
            frontier = new_children
        return list(expanded)

    def _filtered_case_through_qs(self, request, slug):
        review_id = request.query_params.get('review_id')
        query = (
            CaseReviewThrough.objects.filter(
                review_id=review_id,
                deleted_at__isnull=True,
                review__deleted_at__isnull=True,
                review__project__workspace__slug=slug,
                case__deleted_at__isnull=True,
            )
            .select_related('case', 'case__repository', 'case__module', 'review')
            .prefetch_related('review__assignees')
        )
        if project_id := request.query_params.get('project_id'):
            query = query.filter(review__project_id=project_id, case__repository__project_id=project_id)

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
            query = query.filter(review__assignees__id__in=assignee_values).distinct()

        module_ids = self._query_param_values(request, 'module_id')
        if module_ids:
            query = query.filter(case__module_id__in=self._expand_case_module_ids(module_ids))

        filter_module_ids = self._query_param_values(request, 'module_ids')
        if filter_module_ids:
            query = query.filter(case__module_id__in=self._expand_case_module_ids(filter_module_ids))

        return NumericSuffixCodeOrderingFilter().filter_queryset(request, query, self)

    @action(detail=False, methods=['get'], url_path='case-list')
    def case_list(self, request, slug):
        if not request.query_params.get('review_id'):
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        query = self._filtered_case_through_qs(request, slug)
        query = query.annotate(
            suggestion_count=Count(
                "review_records",
                filter=Q(
                    review_records__result=CaseReviewRecord.Result.SUGGEST,
                    review_records__confirmed=False,
                    review_records__deleted_at__isnull=True,
                ),
                distinct=True,
            )
        )
        query = query.prefetch_related(
            Prefetch(
                "review_records",
                queryset=CaseReviewRecord.objects.filter(deleted_at__isnull=True)
                .exclude(result=CaseReviewRecord.Result.SUGGEST)
                .order_by("assignee_id", "-created_at"),
                to_attr="prefetched_review_records",
            )
        )
        all_param = str(request.query_params.get("all", "")).strip().lower()
        if all_param in {"1", "true", "yes"}:
            serializer = ReviewCaseListSerializer(instance=query, many=True)
            return list_response(data=serializer.data, count=query.count())
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        serializer = ReviewCaseListSerializer(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=query.count())

    @action(detail=False, methods=['get'], url_path='module-count')
    def module_count(self, request, slug):
        review_id = request.query_params['review_id']
        review = CaseReview.objects.get(id=review_id)
        case_ids = CaseReviewThrough.objects.filter(review_id=review_id).values_list('case_id', flat=True)
        modules = list(
            CaseModule.objects.filter(repository_id=review.module.repository_id, deleted_at__isnull=True).values('id',
                                                                                                                 'parent_id'))
        base_counts = {m['id']: 0 for m in modules}
        aggregates = TestCase.objects.filter(id__in=case_ids).values('module_id').annotate(count=Count('id'))
        for item in aggregates:
            if item['module_id']:
                base_counts[item['module_id']] = item['count']
        children_map = {}
        for m in modules:
            pid = m['parent_id']
            if pid:
                children_map.setdefault(pid, []).append(m['id'])
        result = {str(m['id']): base_counts.get(m['id'], 0) for m in modules}
        for m in modules:
            mid = m['id']
            for child in children_map.get(mid, []):
                result[str(mid)] += base_counts.get(child, 0)
        result['total'] = len(case_ids)
        return Response(data=result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='case-review')
    def case_review(self, request, slug):
        # 输入参数
        review_id = request.data.get('review_id')
        case_ids = request.data.get('case_id')
        record_result = request.data.get('result')
        reason = request.data.get('reason')
        assignee_id = request.data.get('assignee')

        if isinstance(case_ids, str):
            case_ids = [case_ids]

        for case_id in case_ids:
            # 获取评审单与评审用例
            cr = CaseReview.objects.get(id=review_id)
            crt = CaseReviewThrough.objects.get(review=cr, case_id=case_id)
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

            update_case_review_status(cr, crt, assignee_id)

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

        # serializer = ReviewCaseListSerializer(instance=crt)
        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='records')
    def get_records(self, request, slug):
        review_id = request.query_params['review_id']
        case_id = request.query_params['case_id']
        crt = CaseReviewThrough.objects.get(review=review_id, case_id=case_id)
        query = CaseReviewRecord.objects.filter(crt=crt)
        serializer = ReviewCaseRecordsSerializer(instance=query, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['put'], url_path='confirm')
    def confirm_record(self, request, slug):
        record_id = request.query_params.get('record_id')
        instance = CaseReviewRecord.objects.get(id=record_id)
        instance.confirmed = True
        instance.save(update_fields=['confirmed'])
        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete'], url_path='delete-record')
    def delete_record(self, request, slug):
        record_id = request.query_params.get('record_id')
        instance = get_object_or_404(
            CaseReviewRecord,
            id=record_id,
            crt__review__project__workspace__slug=slug,
        )

        if str(instance.assignee_id) != str(request.user.id):
            return Response({"detail": "只能删除本人提交的评审记录"}, status=status.HTTP_403_FORBIDDEN)

        if instance.result != CaseReviewRecord.Result.SUGGEST:
            return Response({"detail": "仅可删除本人提交的建议记录"}, status=status.HTTP_400_BAD_REQUEST)

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
