import json

from django.db.models import CharField, Value
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from plane.app.permissions import allow_workspace_member
from plane.app.serializers.qa import CaseCreateUpdateSerializer, CaseListSerializer
from plane.app.views import BaseAPIView
from plane.app.views.qa.plan import NumericSuffixCodeOrderingFilter
from plane.app.views.qa.utils import build_case_activity_snapshot, expand_module_subtree_ids
from plane.bgtasks.test_case_activities_task import test_case_activity
from plane.db.models import PlanCase, TestCase, TestCaseRepository
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class TemplateCaseAPIView(BaseAPIView):
    """模板用例 CRUD：workspace 级，只作用于 is_template=True 的模板库。

    项目侧用例主 CRUD（CaseAPIView）挂项目级 URL 与 QA 细粒度权限，
    模板库不挂项目走不通，故独立一个 workspace 级入口；
    序列化、过滤、排序配置复用项目侧，权限对齐标准库先例（工作区成员即可维护）。
    """

    model = TestCase
    pagination_class = CustomPaginator
    serializer_class = CaseListSerializer
    filter_backends = (
        DjangoFilterBackend,
        SearchFilter,
        NumericSuffixCodeOrderingFilter,
    )
    search_fields = ["name", "code"]
    # 与 CaseAPIView 一致，去掉执行语境的 plan_cases__plan__id
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "code": ["exact", "icontains", "in"],
        "labels__name": ["exact", "icontains"],
        "repository_id": ["exact"],
        "type": ["exact", "in"],
        "priority": ["exact", "in"],
        "assignee": ["exact", "in"],
        "id": ["exact", "in"],
    }
    ordering_fields = ["updated_at", "created_at", "code", "priority"]

    def get_queryset(self):
        return (
            TestCase.objects.filter(
                repository__workspace__slug=self.workspace_slug,
                repository__is_template=True,
            )
            .select_related("repository", "module", "assignee")
            .prefetch_related("labels", "issues")
        )

    def _get_template_repository(self, slug, repository_id):
        return get_object_or_404(
            TestCaseRepository,
            id=repository_id,
            workspace__slug=slug,
            is_template=True,
        )

    @allow_workspace_member
    def get(self, request, slug):
        repository_id = request.query_params.get("repository_id")
        if not repository_id:
            return Response(
                {"error": "repository_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset()
        # 按模块过滤时递归包含所有子模块，与模块树计数口径一致
        module_id = request.query_params.get("module_id")
        if module_id:
            queryset = queryset.filter(module_id__in=expand_module_subtree_ids(module_id))

        # 模板用例没有执行语境，注解常量短路 serializer 的逐行执行结果回查
        queryset = queryset.annotate(
            _latest_execution_result=Value(
                PlanCase.Result.NOT_START, output_field=CharField()
            ),
        )

        cases = self.filter_queryset(queryset)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @allow_workspace_member
    def post(self, request, slug):
        self._get_template_repository(slug, request.data.get("repository"))
        serializer = CaseCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_case = serializer.save()
        test_case_activity.delay(
            type="case.activity.created",
            requested_data=None,
            current_instance=None,
            case_id=str(test_case.id),
            actor_id=str(request.user.id),
            epoch=int(timezone.now().timestamp()),
        )
        serializer = self.serializer_class(instance=test_case)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_workspace_member
    def put(self, request, slug):
        case_id = request.data.pop("id")
        case = get_object_or_404(self.get_queryset(), id=case_id)
        # 在更新前抓快照，用于活动比对
        current_snapshot = build_case_activity_snapshot(case)
        update_serializer = CaseCreateUpdateSerializer(
            instance=case, data=request.data, partial=True
        )
        update_serializer.is_valid(raise_exception=True)
        update_serializer.save()
        test_case_activity.delay(
            type="case.activity.updated",
            requested_data=json.dumps(request.data),
            current_instance=current_snapshot,
            case_id=str(case_id),
            actor_id=str(request.user.id),
            epoch=int(timezone.now().timestamp()),
        )
        serializer = self.serializer_class(instance=case)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_workspace_member
    def delete(self, request, slug):
        # 防呆：必须显式指定要删的用例，避免无参请求清空全工作区模板用例
        if not request.query_params.get("id__in"):
            return Response(
                {"error": "id__in is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cases = self.filter_queryset(self.get_queryset())
        # 与项目侧一致：物理删除，且不入队活动（外键级联会让活动行无法存活，
        # 入队还会与级联赛跑导致 IntegrityError，见 CaseAPIView.delete）
        cases.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
