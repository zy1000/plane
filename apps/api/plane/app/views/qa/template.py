import json

from django.db import transaction
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
from plane.app.views.qa.case import get_or_create_case_module, sync_case_labels_by_name
from plane.app.views.qa.plan import NumericSuffixCodeOrderingFilter
from plane.app.views.qa.utils import build_case_activity_snapshot, expand_module_subtree_ids
from plane.bgtasks.copy_case_assets_task import copy_case_assets
from plane.bgtasks.test_case_activities_task import test_case_activity
from plane.db.models import CaseModule, PlanCase, TestCase, TestCaseRepository
from plane.utils.exception_logger import log_exception
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


class TemplateCaseIdsAPIView(BaseAPIView):
    """模板用例 id 清单：返回某模板库（可按模块子树收窄）下全部用例的 {id, module_id}。

    供「从模板导入」弹窗的树勾选一次性拉全量用（module_id 用于前端半选归属统计），
    故不分页（绕开 CustomPaginator 的 max_page_size=100）。
    """

    model = TestCase

    @allow_workspace_member
    def get(self, request, slug):
        repository_id = request.query_params.get("repository_id")
        if not repository_id:
            return Response(
                {"error": "repository_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        get_object_or_404(
            TestCaseRepository,
            id=repository_id,
            workspace__slug=slug,
            is_template=True,
        )

        queryset = TestCase.objects.filter(
            repository_id=repository_id,
            repository__workspace__slug=slug,
            repository__is_template=True,
        )
        module_id = request.query_params.get("module_id")
        if module_id:
            queryset = queryset.filter(module_id__in=expand_module_subtree_ids(module_id))

        data = list(queryset.values("id", "module_id"))
        return list_response(data=data, count=len(data))


class TemplateCaseImportAPIView(BaseAPIView):
    """从模板导入：把模板用例复制进目标库，并按源模块路径在目标库自动匹配/创建模块链。

    - 源用例必须属于本工作区的模板库；目标库属于本工作区（通常是项目库）。
    - 源用例在模块 A/B 下 → 目标库按完整路径逐级 get_or_create（与 Excel 导入语义一致）；
      源用例无模块（或源模块已软删）→ 落目标库根。
    - 复制语义与 copy_case / 模块复制一致：code 重新生成、标签按名同步、
      维护人改为当前用户、不复制评审/执行记录、不建版本不入活动流；
      附件与富文本图片由 copy_case_assets 任务异步跟随（on_commit 派发）。
    """

    model = TestCase

    @allow_workspace_member
    def post(self, request, slug):
        cases_id = request.data.get("cases_id") or []
        target_repository_id = request.data.get("repository_id")

        if not target_repository_id:
            return Response(
                {"error": "repository_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(cases_id, list) or len(cases_id) == 0:
            return Response(
                {"error": "cases_id must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_repository = get_object_or_404(
            TestCaseRepository, id=target_repository_id, workspace__slug=slug
        )

        source_cases = list(
            TestCase.objects.filter(
                id__in=cases_id,
                repository__workspace__slug=slug,
                repository__is_template=True,
            )
            .select_related("module")
            .prefetch_related("labels", "issues")
        )
        found_ids = {str(c.id) for c in source_cases}
        missing_ids = [str(i) for i in cases_id if str(i) not in found_ids]
        if missing_ids:
            return Response(
                {"error": f"TestCase not found: {','.join(missing_ids)}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 源模块 parent 链一次性载入内存，免逐级查库
        source_repo_ids = {c.repository_id for c in source_cases}
        module_map = {
            str(m["id"]): (m["name"], str(m["parent_id"]) if m["parent_id"] else None)
            for m in CaseModule.objects.filter(repository_id__in=source_repo_ids).values(
                "id", "name", "parent_id"
            )
        }
        path_memo: dict = {}

        def source_module_path(module_id):
            """回溯源模块的名称路径（自顶向下的元组）；模块已软删/查不到视为无模块。"""
            if module_id is None:
                return ()
            key = str(module_id)
            if key in path_memo:
                return path_memo[key]
            names = []
            visited = set()
            current = key
            while current is not None and current in module_map and current not in visited:
                visited.add(current)
                name, parent = module_map[current]
                names.append(name)
                current = parent
            if key not in module_map:
                path = ()
            else:
                path = tuple(reversed(names))
            path_memo[key] = path
            return path

        created_ids = []
        copied_pairs = []

        def _enqueue_asset_copy(pairs, actor_id):
            # 附件与富文本图片异步跟随复制；broker 不可用时降级为“导入成功但资产不跟随”
            try:
                for src_id, new_id in pairs:
                    copy_case_assets.delay(src_id, new_id, actor_id)
            except Exception as e:
                log_exception(e)

        with transaction.atomic():
            # 目标模块链缓存：路径元组 -> CaseModule；每级前缀都缓存，A/B 与 A/C 共享 A
            target_module_cache: dict = {(): None}

            def resolve_target_module(path):
                if path in target_module_cache:
                    return target_module_cache[path]
                parent = resolve_target_module(path[:-1])
                module = get_or_create_case_module(
                    str(target_repository.id), path[-1], parent
                )
                target_module_cache[path] = module
                return module

            for source_case in source_cases:
                target_module = resolve_target_module(
                    source_module_path(source_case.module_id)
                )
                base_fields = dict(
                    name=source_case.name,
                    precondition=source_case.precondition,
                    steps=source_case.steps,
                    mode=source_case.mode,
                    text_description=source_case.text_description,
                    text_result=source_case.text_result,
                    remark=source_case.remark,
                    state=getattr(source_case, "state", None),
                    type=source_case.type,
                    priority=source_case.priority,
                    test_type=getattr(source_case, "test_type", None),
                    repository_id=target_repository.id,
                    module_id=target_module.id if target_module else None,
                    assignee_id=getattr(request.user, "id", None),
                )
                base_fields = {k: v for k, v in base_fields.items() if v is not None}

                new_case = TestCase.objects.create(code="", **base_fields)
                sync_case_labels_by_name(source_case, new_case, target_repository.id)
                new_case.issues.set(list(source_case.issues.all()))

                created_ids.append(str(new_case.id))
                copied_pairs.append((str(source_case.id), str(new_case.id)))

            # on_commit 保证 worker 读到的是已提交的新用例行
            transaction.on_commit(
                lambda: _enqueue_asset_copy(list(copied_pairs), str(request.user.id))
            )

        return list_response(data=created_ids, count=len(created_ids))
