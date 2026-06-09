import json

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from yaml import serialize

from collections import defaultdict

from django.db import connection, transaction
from django.db.models import (
    Case,
    CharField,
    Count,
    F,
    Func,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import Cast
from django.shortcuts import get_object_or_404
from plane.app.serializers.qa import (
    TestPlanDetailSerializer,
    TestPlanListSerializer,
    CaseModuleCreateUpdateSerializer,
    CaseModuleListSerializer,
    CaseLabelListSerializer,
    CaseLabelCreateSerializer,
    CaseCreateUpdateSerializer,
    CaseListSerializer,
    CaseAttachmentSerializer,
    ReviewCaseRecordsSerializer,
    PlanListSerializer,
    build_plan_stats_map,
)
from plane.app.serializers.qa.plan import (
    PlanModuleCreateUpdateSerializer,
    PlanModuleListSerializer,
    PlanCaseListSerializer,
    PlanCaseCardSerializer,
    PlanCaseRecordSerializer,
)
from plane.app.views.qa.filters import TestPlanFilter
from plane.db.models import (
    TestPlan,
    TestCaseRepository,
    TestCase,
    CaseModule,
    CaseLabel,
    FileAsset,
    Workspace,
    PlanModule,
    PlanCase,
    PlanCaseRecord,
    Issue,
    Cycle,
    CycleIssue,
    WorkspaceMember,
    ModuleIssue,
    ReleaseIssue,
    CaseReviewRecord,
    CaseReviewThrough,
)
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response
from plane.app.views import BaseAPIView, BaseViewSet
from plane.app.serializers import (
    TestPlanCreateUpdateSerializer,
    TestCaseRepositorySerializer,
    TestCaseRepositoryDetailSerializer,
    CycleSerializer,
)
from plane.app.permissions import (
    allow_permission,
    ROLE,
    allow_fine_permission,
    PermissionKey,
)
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import presigned_post_for_asset
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.bgtasks.test_case_activities_task import test_case_activity
from django.conf import settings
from django.http import HttpResponseRedirect, FileResponse, StreamingHttpResponse
import csv
import io

from urllib.parse import quote
import uuid
from django.utils import timezone


class NumericSuffixCodeOrderingFilter(OrderingFilter):
    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset

        if connection.vendor != "postgresql":
            return queryset.order_by(*ordering)

        needs_code = any(
            field.lstrip("-") in ("code", "case__code") for field in ordering
        )
        if not needs_code:
            return queryset.order_by(*ordering)

        code_field = (
            "case__code"
            if any(field.lstrip("-") == "case__code" for field in ordering)
            else "code"
        )

        queryset = queryset.annotate(
            _code_sort_group=Case(
                When(**{f"{code_field}__regex": r".*-[0-9]+$"}, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            ),
            _code_prefix=Case(
                When(
                    **{f"{code_field}__regex": r".*-[0-9]+$"},
                    then=Func(
                        F(code_field),
                        function="regexp_replace",
                        template="regexp_replace(%(expressions)s, '-[0-9]+$', '')",
                    ),
                ),
                default=Value(""),
                output_field=CharField(),
            ),
            _code_num=Case(
                When(
                    **{f"{code_field}__regex": r".*-[0-9]+$"},
                    then=Cast(
                        Func(
                            F(code_field),
                            function="substring",
                            template="substring(%(expressions)s from '-([0-9]+)$')",
                        ),
                        IntegerField(),
                    ),
                ),
                default=Value(None),
                output_field=IntegerField(),
            ),
        )

        new_ordering = []
        for field in ordering:
            if field.lstrip("-") not in ("code", "case__code"):
                new_ordering.append(field)
                continue

            desc = field.startswith("-")
            new_ordering.append("_code_sort_group")
            new_ordering.append("-_code_prefix" if desc else "_code_prefix")
            new_ordering.append("-_code_num" if desc else "_code_num")
            new_ordering.append(f"-{code_field}" if desc else code_field)

        return queryset.order_by(*new_ordering)


class RepositoryAPIView(BaseAPIView):
    model = TestCaseRepository
    queryset = TestCaseRepository.objects.all()
    serializer_class = TestCaseRepositorySerializer
    filterset_fields = {
        "project_id": ["exact", "in"],
        "project__name": ["exact", "icontains", "in"],
        "id": ["exact", "in"],
        "workspace__slug": ["exact", "icontains", "in"],
        "name": ["exact", "icontains", "in"],
    }
    pagination_class = CustomPaginator

    def post(self, request, slug):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        repository = serializer.save()
        serializer = TestCaseRepositoryDetailSerializer(instance=repository)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def put(self, request, slug):
        repository_id = request.data.pop("id")
        repository = self.queryset.get(id=repository_id)
        update_serializer = self.serializer_class(
            instance=repository, data=request.data, partial=True
        )
        update_serializer.is_valid(raise_exception=True)
        updated_plan = update_serializer.save()
        serializer = TestCaseRepositoryDetailSerializer(instance=repository)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def get(self, request, slug):
        repositories = self.filter_queryset(self.queryset)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(repositories, request)
        serializer = TestCaseRepositoryDetailSerializer(
            instance=paginated_queryset, many=True
        )
        return list_response(data=serializer.data, count=repositories.count())

    def delete(self, request, slug):
        plan_ids = request.data.pop("ids")
        self.queryset.filter(id__in=plan_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlanAPIView(BaseAPIView):
    model = TestPlan
    queryset = TestPlan.objects.all()
    pagination_class = CustomPaginator
    serializer_class = TestPlanCreateUpdateSerializer
    filterset_class = TestPlanFilter

    def get_queryset(self):
        return TestPlan.objects.all().prefetch_related("assignees")

    @allow_fine_permission(PermissionKey.QA_PLAN_CREATE)
    def post(self, request, slug, project_id):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_plan = serializer.save()
        serializer = TestPlanDetailSerializer(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.QA_PLAN_VIEW)
    def get(self, request, slug, project_id):
        planes = self.filter_queryset(self.get_queryset()).distinct()
        paginator = self.pagination_class()
        page_plans = list(paginator.paginate_queryset(planes, request) or [])
        plan_stats = build_plan_stats_map([plan.id for plan in page_plans])
        serializer = TestPlanListSerializer(
            instance=page_plans,
            many=True,
            context={"plan_stats": plan_stats},
        )
        paginator_count = getattr(getattr(paginator, "page", None), "paginator", None)
        count = getattr(paginator_count, "count", None)
        return list_response(
            data=serializer.data, count=count if count is not None else planes.count()
        )

    @allow_fine_permission(PermissionKey.QA_PLAN_EDIT)
    def put(self, request, slug, project_id):
        plan_id = request.data.pop("id")
        plan = self.queryset.get(id=plan_id)
        update_serializer = self.serializer_class(
            instance=plan, data=request.data, partial=True
        )
        update_serializer.is_valid(raise_exception=True)
        updated_plan = update_serializer.save()
        serializer = TestPlanDetailSerializer(instance=plan)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.QA_PLAN_DELETE)
    def delete(self, request, slug, project_id):
        plan_ids = request.data.pop("ids")
        self.queryset.filter(id__in=plan_ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlanListAPIView(BaseAPIView):
    model = TestPlan
    queryset = TestPlan.objects.all()
    serializer_class = PlanListSerializer
    filterset_fields = {
        "project_id": ["exact", "in"],
    }

    def get(self, request, slug):
        queryset = self.filter_queryset(
            self.queryset.filter(project__workspace__slug=slug)
        ).distinct()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlanCaseAPIView(BaseAPIView):
    queryset = PlanCase.objects.all()
    pagination_class = CustomPaginator
    filterset_fields = {
        "plan_id": ["exact", "in"],
        "case__repository_id": ["exact", "in"],
        "case__module_id": ["exact", "in"],
        "result": ["exact", "in"],
    }
    serializer_class = PlanCaseListSerializer
    filter_backends = (
        DjangoFilterBackend,
        SearchFilter,
        NumericSuffixCodeOrderingFilter,
    )
    ordering_fields = ["case__updated_at", "case__code"]

    def get_queryset(self):
        return PlanCase.objects.select_related("case").only(
            "id",
            "plan_id",
            "case_id",
            "result",
            "created_at",
            "updated_at",
            "case__id",
            "case__code",
            "case__name",
            "case__type",
            "case__priority",
            "case__updated_at",
            "case__repository_id",
        )

    def get(self, request, slug):
        plans = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(plans, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        count = (
            getattr(
                getattr(getattr(paginator, "page", None), "paginator", None),
                "count",
                None,
            )
            if paginated_queryset is not None
            else None
        )
        return list_response(
            data=serializer.data, count=count if count is not None else plans.count()
        )


class PlanModuleAPIView(BaseAPIView):
    model = PlanModule
    serializer_class = PlanModuleListSerializer
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "project_id": ["exact", "in"],
        "id": ["exact"],
    }

    def get_queryset(self):
        return PlanModule.objects.all()

    def post(self, request, slug):
        serializer = PlanModuleCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan_module = serializer.save()
        serializer = PlanModuleListSerializer(instance=plan_module)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request, slug):
        query = self.filter_queryset(self.get_queryset().filter(parent=None)).order_by(
            "created_at"
        )

        # 一次性取出全部未删除模块，在内存中构建父子关系，避免序列化时逐节点查询子节点
        all_modules = list(
            PlanModule.objects.filter(deleted_at__isnull=True).order_by("created_at")
        )
        children_map = defaultdict(list)
        for module in all_modules:
            if module.parent_id:
                children_map[module.parent_id].append(module)

        # 一次聚合查出每个模块的计划数量，避免逐节点 COUNT 查询
        count_map = dict(
            PlanModule.objects.filter(deleted_at__isnull=True)
            .annotate(
                plan_count=Count("plans", filter=Q(plans__deleted_at__isnull=True))
            )
            .values_list("id", "plan_count")
        )

        serializer = self.serializer_class(
            instance=query,
            many=True,
            context={"children_map": children_map, "count_map": count_map},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug):
        module_ids = request.data.pop("ids")
        self.get_queryset().filter(id__in=module_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlanModuleDetailAPIView(BaseAPIView):
    model = PlanModule
    queryset = PlanModule.objects.all()
    serializer_class = PlanModuleCreateUpdateSerializer

    def patch(self, request, slug, module_id):
        module = get_object_or_404(
            self.queryset,
            id=module_id,
            deleted_at__isnull=True,
            project__workspace__slug=slug,
        )
        serializer = self.serializer_class(
            instance=module, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        module.refresh_from_db()
        return Response(
            PlanModuleListSerializer(instance=module).data, status=status.HTTP_200_OK
        )


class PlanModuleCountAPIView(BaseAPIView):
    model = PlanModule
    queryset = PlanModule.objects.all()
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "project_id": ["exact", "in"],
    }

    def get(self, request, slug):
        project_id = request.query_params["project_id"]

        modules = (
            self.filter_queryset(self.queryset)
            .annotate(
                plan_count=Count("plans", filter=Q(plans__deleted_at__isnull=True))
            )
            .values("id", "parent_id", "plan_count")
        )

        # 每个模块的直属计划数，以及父子关系，用于把子模块的计划数累加到父模块上，
        # 与计划列表按模块过滤（递归包含子模块）的口径保持一致。
        direct_counts = {}
        children_map = defaultdict(list)
        for module in modules:
            mid = str(module["id"])
            direct_counts[mid] = int(module["plan_count"] or 0)
            pid = str(module["parent_id"]) if module["parent_id"] else None
            if pid:
                children_map[pid].append(mid)

        memo = {}

        def subtree_count(mid):
            if mid in memo:
                return memo[mid]
            total = direct_counts.get(mid, 0)
            for child in children_map.get(mid, []):
                total += subtree_count(child)
            memo[mid] = total
            return total

        result = dict(
            total=TestPlan.objects.filter(
                project_id=project_id, deleted_at__isnull=True
            ).count()
        )
        for mid in direct_counts:
            result[mid] = subtree_count(mid)

        return Response(data=result)


class PlanView(BaseViewSet):
    pagination_class = CustomPaginator

    def _filtered_plan_case_qs(self, request):
        query = PlanCase.objects.filter(plan_id=request.query_params["plan_id"])
        if name := request.query_params.get("name__icontains"):
            query = query.filter(case__name__icontains=name)

        repository_ids = (
            request.query_params.getlist("repository_id")
            or request.query_params.getlist("repository_ids")
            or request.query_params.getlist("case__repository_id")
        )
        if repository_ids:
            query = query.filter(case__repository_id__in=repository_ids)
        else:
            repository_id = request.query_params.get(
                "repository_id"
            ) or request.query_params.get("case__repository_id")
            if repository_id:
                query = query.filter(case__repository_id=repository_id)

        module_ids = request.query_params.getlist(
            "module_id"
        ) or request.query_params.getlist("module_ids")
        if module_ids:
            expanded = set(module_ids)
            frontier = list(module_ids)
            while frontier:
                children = list(
                    CaseModule.objects.filter(
                        parent_id__in=frontier, deleted_at__isnull=True
                    ).values_list("id", flat=True)
                )
                new_children = [c for c in children if c not in expanded]
                if not new_children:
                    break
                expanded.update(new_children)
                frontier = new_children
            query = query.filter(case__module_id__in=list(expanded))
        else:
            module_id = request.query_params.get("module_id")
            if module_id:
                expanded = {module_id}
                frontier = [module_id]
                while frontier:
                    children = list(
                        CaseModule.objects.filter(
                            parent_id__in=frontier, deleted_at__isnull=True
                        ).values_list("id", flat=True)
                    )
                    new_children = [c for c in children if c not in expanded]
                    if not new_children:
                        break
                    expanded.update(new_children)
                    frontier = new_children
                query = query.filter(case__module_id__in=list(expanded))
        return query

    @action(detail=False, methods=["post"], url_path="cancel")
    @allow_fine_permission(PermissionKey.QA_PLAN_EDIT)
    def cancel(self, request, slug):
        project_id = request.query_params.get("project_id")
        qs = PlanCase.objects.filter(id__in=request.data["id"])
        if project_id:
            qs = qs.filter(plan__project_id=project_id)
        qs.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="case-list")
    def case_list(self, request, slug):
        query = self._filtered_plan_case_qs(request)
        all_param = str(request.query_params.get("all", "")).strip().lower()
        if all_param in {"1", "true", "yes"}:
            serializer = PlanCaseCardSerializer(instance=query, many=True)
            return list_response(data=serializer.data, count=query.count())
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        serializer = PlanCaseCardSerializer(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=query.count())

    @action(detail=False, methods=["post"], url_path="execute")
    def execute(self, request, slug):
        plan_id = request.data["plan_id"]
        case_ids = request.data["case_id"]
        result = request.data["result"]
        reason = request.data.get("reason")
        steps = request.data.get("steps")
        assignee = request.data["assignee"]

        query = TestPlan.objects.get(id=plan_id).assignees.all()
        plan_executor = query.values_list("id", flat=True)

        if isinstance(case_ids, str):
            case_ids = [case_ids]
        created_records = []
        for case_id in case_ids:

            plan_case = PlanCase.objects.get(plan_id=plan_id, case_id=case_id)
            if query.exists() and request.user.id not in plan_executor:
                return Response(
                    status=status.HTTP_403_FORBIDDEN,
                    data={"msg": f'你没有权限执行"{plan_case.case.name}"'},
                )

            old_result = plan_case.result

            # 创建执行记录
            pcr = PlanCaseRecord.objects.create(
                result=result,
                reason=reason,
                steps=steps if steps else plan_case.case.steps,
                assignee_id=assignee,
                plan_case=plan_case,
            )
            created_records.append(
                {"case_id": str(case_id), "record_id": str(pcr.id)}
            )
            plan_case.result = result
            plan_case.save()

            # 触发执行情况活动
            if old_result != result:
                test_case_activity.delay(
                    type="case_execution.activity.updated",
                    requested_data=json.dumps({
                        "old_result": old_result,
                        "new_result": result,
                    }),
                    current_instance=None,
                    case_id=str(case_id),
                    actor_id=str(request.user.id),
                    epoch=int(timezone.now().timestamp()),
                )

            plan = TestPlan.objects.get(id=plan_id)
            # 修改计划状态
            if not PlanCase.objects.filter(
                plan_id=plan_id, result=PlanCase.Result.NOT_START
            ).exists():
                plan.state = TestPlan.State.COMPLETED
            else:
                plan.state = TestPlan.State.PROGRESS
            plan.save()
        return Response(
            status=status.HTTP_201_CREATED,
            data={"records": created_records},
        )

    @action(detail=False, methods=["post"], url_path="export")
    def export(self, request, slug):
        plan_id = request.data.get("plan_id")
        if not plan_id:
            return Response(
                {"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        fields = request.data.get("fields") or []
        if not isinstance(fields, list) or not fields:
            return Response(
                {"error": "fields must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = request.data.get("ids") or []
        repository_id = request.data.get("repository_id")
        module_id = request.data.get("module_id")

        allowed = {
            "code": "用例编号",
            "name": "用例名称",
            "repository_name": "用例库",
            "module_name": "模块",
            "type": "类型",
            "priority": "优先级",
            "test_type": "测试类型",
            "state": "状态",
            "precondition": "前置条件",
            "steps": "步骤",
            "text_description": "文本描述",
            "text_result": "文本结果",
            "remark": "备注",
            "labels": "标签",
            "issues": "关联缺陷",
            "assignee": "维护人",
            "created_at": "创建时间",
            "updated_at": "更新时间",
            "result": "执行结果",
        }
        fields = [f for f in fields if f in allowed.keys()]
        if not fields:
            return Response(
                {"error": "no valid fields selected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = (
            PlanCase.objects.select_related(
                "case",
                "case__repository",
                "case__module",
                "case__assignee",
            )
            .prefetch_related("case__labels", "case__issues")
            .filter(plan_id=plan_id, deleted_at__isnull=True)
        )
        if ids:
            qs = qs.filter(id__in=ids)
        if repository_id:
            qs = qs.filter(case__repository_id=repository_id)
        if module_id:
            expanded = {str(module_id)}
            frontier = [str(module_id)]
            while frontier:
                children = list(
                    CaseModule.objects.filter(
                        parent_id__in=frontier, deleted_at__isnull=True
                    ).values_list("id", flat=True)
                )
                new_children = [str(c) for c in children if str(c) not in expanded]
                if not new_children:
                    break
                expanded.update(new_children)
                frontier = new_children
            qs = qs.filter(case__module_id__in=list(expanded))

        header = [allowed[f] for f in fields]
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=",", quoting=csv.QUOTE_ALL)
        writer.writerow(header)

        def val(pc, key):
            c = pc.case
            if key == "code":
                return c.code or ""
            if key == "name":
                return c.name or ""
            if key == "repository_name":
                return getattr(getattr(c, "repository", None), "name", "") or ""
            if key == "module_name":
                return getattr(getattr(c, "module", None), "name", "") or ""
            if key == "type":
                return c.get_type_display() if hasattr(c, "get_type_display") else ""
            if key == "priority":
                return (
                    c.get_priority_display()
                    if hasattr(c, "get_priority_display")
                    else ""
                )
            if key == "test_type":
                return (
                    c.get_test_type_display()
                    if hasattr(c, "get_test_type_display")
                    else ""
                )
            if key == "state":
                return c.get_state_display() if hasattr(c, "get_state_display") else ""
            if key == "precondition":
                return c.precondition or ""
            if key == "steps":
                return c.steps or ""
            if key == "text_description":
                return c.text_description or ""
            if key == "text_result":
                return c.text_result or ""
            if key == "remark":
                return c.remark or ""
            if key == "labels":
                return (
                    ",".join([l.name for l in c.labels.all()])
                    if hasattr(c, "labels")
                    else ""
                )
            if key == "issues":
                return (
                    ",".join([str(i.id) for i in c.issues.all()])
                    if hasattr(c, "issues")
                    else ""
                )
            if key == "assignee":
                return getattr(getattr(c, "assignee", None), "display_name", "") or ""
            if key == "created_at":
                return (
                    timezone.localtime(c.created_at).strftime("%Y-%m-%d %H:%M:%S")
                    if c.created_at
                    else ""
                )
            if key == "updated_at":
                return (
                    timezone.localtime(c.updated_at).strftime("%Y-%m-%d %H:%M:%S")
                    if c.updated_at
                    else ""
                )
            if key == "result":
                return pc.result or ""
            return ""

        for pc in qs.iterator():
            row = [val(pc, f) for f in fields]
            writer.writerow(row)

        content = "\ufeff" + buffer.getvalue()
        resp = FileResponse(
            io.BytesIO(content.encode("utf-8")), content_type="text/csv; charset=utf-8"
        )
        filename = f"plan-cases-export-{timezone.now().strftime('%Y%m%d%H%M%S')}.csv"
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(filename)}"
        return resp

    @action(detail=False, methods=["get"], url_path="case-detail")
    def case_detail(self, request, slug):
        plan_id = request.query_params["plan_id"]
        case_id = request.query_params["case_id"]

        plan_case = PlanCase.objects.get(plan_id=plan_id, case_id=case_id)
        case = TestCase.objects.get(pk=case_id)
        case_data = CaseListSerializer(case).data

        case_data["execute_steps"] = (
            plan_case.plan_case_records.first().steps
            if plan_case.plan_case_records.first()
            else None
        )
        return Response(case_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="add-bug")
    def add_bug(self, request, slug):
        case_id = request.data["case_id"]
        issue_id = request.data["issue_id"]
        case = TestCase.objects.get(pk=case_id)
        issue = Issue.objects.get(pk=issue_id)
        case.issues.add(issue)
        return Response(status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="records")
    def get_records(self, request, slug):
        plan_id = request.query_params["plan_id"]
        case_id = request.query_params["case_id"]
        plan_case = PlanCase.objects.get(plan_id=plan_id, case_id=case_id)
        records = PlanCaseRecord.objects.filter(plan_case=plan_case)
        serializer = PlanCaseRecordSerializer(instance=records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="associate-cycle")
    def associate_cycle(self, request, slug):
        plan_id = request.data["plan_id"]
        cycle_ids: list = request.data["cycle_id"]

        # 1. 获取 Plan 对象
        plan = TestPlan.objects.get(pk=plan_id)

        # 2. 批量关联 Cycle
        # 使用 set 运算找出需要新增的 cycle_id，减少数据库查询
        # existing_cycle_ids = set(plan.cycles.filter(id__in=cycle_ids).values_list('id', flat=True))
        # new_cycle_ids = set(cycle_ids) - existing_cycle_ids
        #
        # if new_cycle_ids:
        #     # 批量查询并添加
        #     new_cycles = Cycle.objects.filter(pk__in=new_cycle_ids)
        #     plan.cycles.add(*new_cycles)

        # 3. 批量导入关联的用例
        # 获取所有选中 Cycle 下 Issue 关联的 Case ID
        # 通过连表查询一次性获取所有相关的 case_id
        related_case_ids = (
            CycleIssue.objects.filter(cycle_id__in=cycle_ids)
            .values_list("issue__cases__id", flat=True)
            .distinct()
        )

        # 排除无效的 None 值（如果某些 Issue 没有关联 Case）
        valid_case_ids = [cid for cid in related_case_ids if cid]

        if not valid_case_ids:
            return Response(status=status.HTTP_200_OK)

        # 4. 批量创建 PlanCase
        # 获取该 Plan 已存在的 case_id，避免重复创建
        existing_plan_case_ids = set(
            PlanCase.objects.filter(plan=plan, case_id__in=valid_case_ids).values_list(
                "case_id", flat=True
            )
        )

        # 计算需要新创建的 case_id
        new_case_ids = set(valid_case_ids) - existing_plan_case_ids

        if new_case_ids:
            new_plan_cases = [
                PlanCase(plan=plan, case_id=case_id) for case_id in new_case_ids
            ]
            PlanCase.objects.bulk_create(new_plan_cases, batch_size=1000)

        return Response(status=status.HTTP_200_OK)

    @transaction.atomic
    @action(detail=False, methods=["post"], url_path="add-cases")
    @allow_fine_permission(PermissionKey.QA_PLAN_EDIT)
    def add_cases(self, request, slug):
        plan_id = request.data.get("plan_id")
        raw_case_ids = request.data.get("case_ids")

        if not plan_id:
            return Response(
                {"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(raw_case_ids, list) or len(raw_case_ids) == 0:
            return Response(
                {"error": "case_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            case_ids = [uuid.UUID(str(i)) for i in raw_case_ids if i]
        except Exception:
            return Response(
                {"error": "Invalid case_ids"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not case_ids:
            return Response(
                {"error": "case_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_id = request.query_params.get("project_id")
        plan_lookup = {
            "id": plan_id,
            "deleted_at__isnull": True,
            "project__workspace__slug": slug,
        }
        if project_id:
            plan_lookup["project_id"] = project_id
        plan = get_object_or_404(TestPlan, **plan_lookup)

        repo_ids = list(
            TestCaseRepository.objects.filter(
                project_id=plan.project_id,
                workspace__slug=slug,
                deleted_at__isnull=True,
            ).values_list("id", flat=True)
        )

        found_case_ids = set(
            TestCase.objects.filter(
                id__in=case_ids, repository_id__in=repo_ids, deleted_at__isnull=True
            ).values_list("id", flat=True)
        )
        missing_case_ids = set(case_ids) - found_case_ids
        if missing_case_ids:
            missing_str = ",".join(sorted([str(i) for i in missing_case_ids]))
            return Response(
                {"error": f"TestCase not found: {missing_str}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        existing_case_ids = set(
            PlanCase.objects.filter(
                plan=plan, case_id__in=list(found_case_ids)
            ).values_list("case_id", flat=True)
        )

        soft_deleted_qs = PlanCase.all_objects.filter(
            plan=plan, case_id__in=list(found_case_ids)
        ).exclude(deleted_at__isnull=True)
        soft_deleted_case_ids = set(soft_deleted_qs.values_list("case_id", flat=True))
        if soft_deleted_case_ids:
            soft_deleted_qs.update(deleted_at=None)

        to_create_case_ids = found_case_ids - existing_case_ids - soft_deleted_case_ids
        if to_create_case_ids:
            PlanCase.objects.bulk_create(
                [
                    PlanCase(plan=plan, case_id=case_id)
                    for case_id in to_create_case_ids
                ],
                batch_size=1000,
            )

        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="associate-modules")
    def associate_modules(self, request, slug):
        plan_id = request.data.get("plan_id")
        module_ids = request.data.get("module_ids", [])

        if not plan_id:
            return Response(
                {"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not isinstance(module_ids, list) or len(module_ids) == 0:
            return Response(
                {"error": "module_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plan = get_object_or_404(
            TestPlan, pk=plan_id, deleted_at__isnull=True, project__workspace__slug=slug
        )

        related_case_ids = (
            ModuleIssue.objects.filter(
                module_id__in=module_ids,
                deleted_at__isnull=True,
            )
            .values_list("issue__cases__id", flat=True)
            .distinct()
        )

        valid_case_ids = [cid for cid in related_case_ids if cid]

        if not valid_case_ids:
            plan.modules.add(*module_ids)
            return Response(status=status.HTTP_200_OK)

        existing_plan_case_ids = set(
            PlanCase.objects.filter(
                plan=plan,
                case_id__in=valid_case_ids,
            ).values_list("case_id", flat=True)
        )

        soft_deleted_qs = PlanCase.all_objects.filter(
            plan=plan,
            case_id__in=valid_case_ids,
        ).exclude(deleted_at__isnull=True)
        soft_deleted_case_ids = set(soft_deleted_qs.values_list("case_id", flat=True))
        if soft_deleted_case_ids:
            soft_deleted_qs.update(deleted_at=None)

        new_case_ids = (
            set(valid_case_ids) - existing_plan_case_ids - soft_deleted_case_ids
        )
        if new_case_ids:
            PlanCase.objects.bulk_create(
                [PlanCase(plan=plan, case_id=case_id) for case_id in new_case_ids],
                batch_size=1000,
            )

        plan.modules.add(*module_ids)
        return Response(status=status.HTTP_200_OK)

    @transaction.atomic
    @action(detail=False, methods=["post"], url_path="associate-releases")
    @allow_fine_permission(PermissionKey.QA_PLAN_EDIT)
    def associate_releases(self, request, slug):
        plan_id = request.data.get("plan_id")
        release_ids = request.data.get("release_ids", [])

        if not plan_id:
            return Response(
                {"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not isinstance(release_ids, list) or len(release_ids) == 0:
            return Response(
                {"error": "release_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plan = get_object_or_404(
            TestPlan, pk=plan_id, deleted_at__isnull=True, project__workspace__slug=slug
        )

        related_case_ids = (
            ReleaseIssue.objects.filter(
                release_id__in=release_ids,
                project_id=plan.project_id,
                deleted_at__isnull=True,
            )
            .values_list("issue__cases__id", flat=True)
            .distinct()
        )

        valid_case_ids = [cid for cid in related_case_ids if cid]

        if not valid_case_ids:
            plan.releases.add(*release_ids)
            return Response(status=status.HTTP_200_OK)

        existing_plan_case_ids = set(
            PlanCase.objects.filter(
                plan=plan,
                case_id__in=valid_case_ids,
            ).values_list("case_id", flat=True)
        )

        soft_deleted_qs = PlanCase.all_objects.filter(
            plan=plan,
            case_id__in=valid_case_ids,
        ).exclude(deleted_at__isnull=True)
        soft_deleted_case_ids = set(soft_deleted_qs.values_list("case_id", flat=True))
        if soft_deleted_case_ids:
            soft_deleted_qs.update(deleted_at=None)

        new_case_ids = (
            set(valid_case_ids) - existing_plan_case_ids - soft_deleted_case_ids
        )
        if new_case_ids:
            PlanCase.objects.bulk_create(
                [PlanCase(plan=plan, case_id=case_id) for case_id in new_case_ids],
                batch_size=1000,
            )

        plan.releases.add(*release_ids)
        return Response(status=status.HTTP_200_OK)


class CaseAPIView(BaseAPIView):
    model = TestCase
    queryset = TestCase.objects.select_related(
        "repository", "module", "assignee"
    ).prefetch_related("labels", "issues")
    pagination_class = CustomPaginator
    serializer_class = CaseListSerializer
    filter_backends = (
        DjangoFilterBackend,
        SearchFilter,
        NumericSuffixCodeOrderingFilter,
    )
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "code": ["exact", "icontains", "in"],
        "labels__name": ["exact", "icontains"],
        "repository_id": ["exact"],
        "type": ["exact", "in"],
        "priority": ["exact", "in"],
        "id": ["exact", "in"],
        "plan_cases__plan__id": ["exact", "in"],
    }
    ordering_fields = ["updated_at", "code"]

    @allow_fine_permission(PermissionKey.QA_CASE_VIEW)
    def get(self, request, slug, project_id):
        queryset = self.queryset
        # 按模块过滤时递归包含所有子模块，与模块树上的计数口径保持一致。
        module_id = request.query_params.get("module_id")
        if module_id:
            expanded = {str(module_id)}
            frontier = [str(module_id)]
            while frontier:
                children = list(
                    CaseModule.objects.filter(
                        parent_id__in=frontier, deleted_at__isnull=True
                    ).values_list("id", flat=True)
                )
                new_children = [str(c) for c in children if str(c) not in expanded]
                if not new_children:
                    break
                expanded.update(new_children)
                frontier = new_children
            queryset = queryset.filter(module_id__in=list(expanded))
        cases = self.filter_queryset(queryset)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        data = serializer.data

        return list_response(data=data, count=cases.count())

    @allow_fine_permission(PermissionKey.QA_CASE_CREATE)
    def post(self, request, slug, project_id):
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

    @allow_fine_permission(PermissionKey.QA_CASE_EDIT)
    def put(self, request, slug, project_id):
        case_id = request.data.pop("id")
        case = self.queryset.get(id=case_id)
        # 在更新前抓快照，用于活动比对
        current_snapshot = json.dumps({
            "name": case.name,
            "type": case.type,
            "test_type": case.test_type,
            "priority": case.priority,
            "assignee_id": str(case.assignee_id) if case.assignee_id else None,
            "module_id": str(case.module_id) if case.module_id else None,
            "labels": [str(l) for l in case.labels.values_list("id", flat=True)],
            "precondition": case.precondition,
            "text_description": case.text_description,
            "text_result": case.text_result,
            "remark": case.remark,
        })
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

    @allow_fine_permission(PermissionKey.QA_CASE_DELETE)
    def delete(self, request, slug, project_id):
        cases = self.filter_queryset(self.queryset).all()
        for case in cases:
            test_case_activity.delay(
                type="case.activity.deleted",
                requested_data=None,
                current_instance=json.dumps({"name": case.name}),
                case_id=str(case.id),
                actor_id=str(request.user.id),
                epoch=int(timezone.now().timestamp()),
            )
        cases.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseDetailAPIView(BaseAPIView):
    model = TestCase
    queryset = TestCase.objects.all()
    pagination_class = CustomPaginator
    serializer_class = CaseListSerializer

    def get(self, request, slug, case_id):
        case = self.queryset.get(id=case_id)
        serializer = self.serializer_class(instance=case)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CaseMindmapAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.QA_MINDMAP_VIEW)
    def get(self, request, slug):
        repository_id = request.query_params.get("repository_id")
        module_ids_raw = (
            request.query_params.getlist("module_id")
            or request.query_params.getlist("module_id[]")
            or (
                []
                if request.query_params.get("module_id") is None
                else [request.query_params.get("module_id")]
            )
        )

        if not repository_id:
            return Response(
                {"error": "repository_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        modules = list(
            CaseModule.objects.filter(
                repository_id=repository_id, deleted_at__isnull=True
            )
            .values("id", "name", "parent_id", "sort_order")
            .order_by("sort_order", "created_at")
        )
        module_map = {str(m["id"]): m for m in modules}
        children_map = {}
        roots = []
        for m in modules:
            mid = str(m["id"])
            pid = str(m["parent_id"]) if m["parent_id"] else None
            if pid and pid in module_map:
                children_map.setdefault(pid, []).append(mid)
            else:
                roots.append(mid)

        def collect_descendants(root_id: str) -> set[str]:
            stack = [root_id]
            collected: set[str] = set()
            while stack:
                cur = stack.pop()
                if cur in collected:
                    continue
                collected.add(cur)
                for child_id in children_map.get(cur, []):
                    stack.append(child_id)
            return collected

        selected_module_ids: list[str] = []
        for raw in module_ids_raw:
            if raw is None:
                continue
            for part in str(raw).split(","):
                mid = part.strip()
                if not mid or mid == "all":
                    continue
                selected_module_ids.append(mid)
        selected_module_ids = list(dict.fromkeys(selected_module_ids))

        for mid in selected_module_ids:
            if mid not in module_map:
                return Response(
                    {"error": "module not found"}, status=status.HTTP_404_NOT_FOUND
                )

        allowed_module_ids: set[str] | None = None
        if selected_module_ids:
            allowed_module_ids = set()
            for mid in selected_module_ids:
                allowed_module_ids |= collect_descendants(mid)

        cases_qs = TestCase.objects.filter(
            repository_id=repository_id, deleted_at__isnull=True
        )
        if allowed_module_ids is not None:
            cases_qs = cases_qs.filter(module_id__in=list(allowed_module_ids))

        cases = list(
            cases_qs.values(
                "id",
                "code",
                "name",
                "module_id",
                "mode",
                "precondition",
                "steps",
                "remark",
                "text_description",
                "text_result",
            ).order_by("created_at")
        )

        cases_by_module: dict[str | None, list[dict]] = {}
        for c in cases:
            mid = str(c["module_id"]) if c.get("module_id") else None
            steps = c.get("steps")
            if not isinstance(steps, list):
                c["steps"] = []
            cases_by_module.setdefault(mid, []).append(c)

        def build_module_node(mid: str) -> dict:
            meta = module_map[mid]
            child_ids = children_map.get(mid, [])
            child_ids = sorted(
                child_ids,
                key=lambda x: (
                    module_map[x].get("sort_order") or 0,
                    module_map[x].get("name") or "",
                ),
            )
            return {
                "id": mid,
                "name": meta.get("name") or "",
                "children": [build_module_node(cid) for cid in child_ids],
                "cases": cases_by_module.get(mid, []),
            }

        if selected_module_ids:
            selected_children = sorted(
                selected_module_ids,
                key=lambda x: (
                    module_map[x].get("sort_order") or 0,
                    module_map[x].get("name") or "",
                ),
            )
            root_children_nodes = [build_module_node(mid) for mid in selected_children]
        else:
            root_children = sorted(
                roots,
                key=lambda x: (
                    module_map[x].get("sort_order") or 0,
                    module_map[x].get("name") or "",
                ),
            )
            root_children_nodes = [build_module_node(mid) for mid in root_children]

        root = {
            "id": "all",
            "name": "全部用例",
            "children": root_children_nodes,
            "cases": cases_by_module.get(None, []),
        }

        return Response({"root": root}, status=status.HTTP_200_OK)


class CaseModuleAPIView(BaseAPIView):
    model = CaseModule
    queryset = CaseModule.objects.all()
    serializer_class = CaseModuleCreateUpdateSerializer
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "repository_id": ["exact"],
        "id": ["exact"],
    }

    def get(self, request, slug):
        repository_ids_raw = request.query_params.get("repository_id__in")
        if repository_ids_raw:
            ids = [r.strip() for r in repository_ids_raw.split(",") if r.strip()]
            modules = self.queryset.filter(parent=None, repository_id__in=ids)
        else:
            modules = self.filter_queryset(self.queryset.filter(parent=None))
        serializer = CaseModuleListSerializer(instance=modules, many=True)
        return Response(data=serializer.data)

    def post(self, request, slug):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_plan = serializer.save()
        serializer = CaseModuleListSerializer(instance=test_plan)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, slug):
        self.filter_queryset(self.queryset).all().delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LabelAPIView(BaseAPIView):
    model = CaseLabel
    queryset = CaseLabel.objects.all()
    serializer_class = CaseLabelListSerializer
    filterset_fields = {
        "name": ["exact", "icontains", "in"],
        "repository_id": ["exact"],
    }

    def get(self, request, slug):
        labels = self.filter_queryset(self.queryset).all()
        serializer = self.serializer_class(instance=labels, many=True)
        return Response(data=serializer.data)

    def post(self, request, slug):
        name = request.data["name"]
        case_id = request.data.get("case_id")
        repository_id = request.data["repository_id"]
        label, _ = CaseLabel.objects.get_or_create(
            name=name, repository_id=repository_id
        )
        if case_id:
            case = TestCase.objects.get(id=case_id)
            case.labels.add(label)
            case.save()
        serializer = self.serializer_class(instance=label)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, slug):
        case_id = request.data.get("case_id")
        label_id = request.data["id"]
        label = self.queryset.get(id=label_id)
        if case_id:
            case = TestCase.objects.get(id=case_id)
            case.labels.remove(label)
            case.save()
        if not label.cases.exists():
            label.delete(soft=False)

        return Response(status=status.HTTP_204_NO_CONTENT)


class EnumDataAPIView(BaseAPIView):

    def get(self, request, slug):
        plan_state = dict(TestPlan.State.choices)
        case_state = dict(TestCase.State.choices)
        case_type = dict(TestCase.Type.choices)
        case_priority = dict(TestCase.Priority.choices)
        case_test_type = dict(TestCase.TestType.choices)
        plan_case_result = dict(PlanCase.Result.choices)
        return Response(
            dict(
                plan_state=plan_state,
                case_state=case_state,
                case_type=case_type,
                case_priority=case_priority,
                case_test_type=case_test_type,
                plan_case_result=plan_case_result,
            )
        )


# 新增：测试用例附件 V2 端点，复用 Issue 附件逻辑
class CaseAttachmentV2Endpoint(BaseAPIView):
    serializer_class = CaseAttachmentSerializer
    model = FileAsset

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, case_id):
        name = request.data.get("name")
        type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        # 注：测试用例附件不再限制 MIME 类型。

        workspace = Workspace.objects.get(slug=slug)
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            case_id=case_id,
            project_id=project_id,
            entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=type, file_size=size_limit
        )

        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "attachment": CaseAttachmentSerializer(asset).data,
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], creator=True, model=FileAsset)
    def delete(self, request, slug, project_id, case_id, pk):
        case_attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id
        )
        case_attachment.is_deleted = True
        case_attachment.deleted_at = timezone.now()
        case_attachment.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, slug, case_id, pk=None):
        if pk:
            asset = FileAsset.objects.get(id=pk, workspace__slug=slug)
            if not asset.is_uploaded:
                return Response(
                    {"error": "The asset is not uploaded.", "status": False},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            storage = S3Storage(request=request)
            s3_resp = storage.s3_client.get_object(
                Bucket=storage.aws_storage_bucket_name, Key=asset.storage_key
            )
            body = s3_resp.get("Body")
            content_type = (
                s3_resp.get("ContentType")
                or asset.attributes.get("type")
                or "application/octet-stream"
            )
            resp = StreamingHttpResponse(body, content_type=content_type)
            filename = asset.attributes.get("name")
            if filename:
                resp["Content-Disposition"] = (
                    f"attachment; filename*=UTF-8''{quote(filename)}"
                )
            content_length = s3_resp.get("ContentLength")
            if content_length:
                resp["Content-Length"] = str(content_length)
            return resp

        case_attachments = FileAsset.objects.filter(
            case_id=case_id,
            entity_type=FileAsset.EntityTypeContext.CASE_ATTACHMENT,
            workspace__slug=slug,
            is_uploaded=True,
        )
        serializer = CaseAttachmentSerializer(case_attachments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, case_id, pk):
        case_attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id
        )
        # 首次标记为已上传
        if not case_attachment.is_uploaded:
            case_attachment.is_uploaded = True
            case_attachment.created_by = request.user

        if not case_attachment.storage_metadata:
            get_asset_object_metadata.delay(str(case_attachment.id))

        # 可选：更新 attributes（与 UserAssetsV2Endpoint 同步风格）
        case_attachment.attributes = request.data.get(
            "attributes", case_attachment.attributes
        )
        case_attachment.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserCaseModuleTreeAPIView(BaseAPIView):
    """
    返回当前用户所有工作区的完整用例库模块树，仅需一次请求。
    响应结构：
    [
      { id, slug, name, projects: [
          { id, name,                              # id=null 表示"未关联项目"
            repositories: [
              { id, name,
                modules: [ { id, name, sort_order, repository, children: [...] } ]
              }
            ]
          }
        ]
      }
    ]
    """

    def get(self, request):
        # 1. 获取用户所在的所有工作区 ID
        workspace_ids = list(
            WorkspaceMember.objects.filter(
                member=request.user,
                deleted_at__isnull=True,
            ).values_list("workspace_id", flat=True)
        )
        if not workspace_ids:
            return Response([])

        # 2. 获取这些工作区下所有用例库（含 workspace、project 关联，用于分组）
        repositories = list(
            TestCaseRepository.objects.filter(
                workspace_id__in=workspace_ids,
                deleted_at__isnull=True,
            )
            .select_related("workspace", "project")
            .order_by("workspace_id", "project_id", "-created_at")
        )
        if not repositories:
            return Response([])

        repo_ids = [str(r.id) for r in repositories]

        # 3. 一次性拉取所有层级的模块（flat），避免 N+1
        all_modules = list(
            CaseModule.objects.filter(
                repository_id__in=repo_ids,
                deleted_at__isnull=True,
            ).order_by("sort_order", "-created_at")
        )

        # 4. 在 Python 侧构建父子关系（O(n)）
        children_map: dict = defaultdict(list)
        repo_roots_map: dict = defaultdict(list)
        for m in all_modules:
            if m.parent_id:
                children_map[str(m.parent_id)].append(m)
            else:
                repo_roots_map[str(m.repository_id)].append(m)

        def _build_node(module) -> dict:
            return {
                "id": str(module.id),
                "name": module.name,
                "sort_order": module.sort_order,
                "repository": str(module.repository_id),
                "children": [
                    _build_node(c) for c in children_map.get(str(module.id), [])
                ],
            }

        # 5. 按工作区 → 项目 → 用例库 三层分组
        # workspace_map[ws_id] = { ..., project_map: { proj_key: { id, name, repos: [] } } }
        workspace_map: dict = {}
        for repo in repositories:
            ws = repo.workspace
            ws_id = str(ws.id)
            if ws_id not in workspace_map:
                workspace_map[ws_id] = {
                    "id": ws_id,
                    "slug": ws.slug,
                    "name": ws.name,
                    "_project_map": {},
                }

            proj = repo.project
            proj_key = str(proj.id) if proj else "__no_project__"
            proj_map = workspace_map[ws_id]["_project_map"]
            if proj_key not in proj_map:
                proj_map[proj_key] = {
                    "id": str(proj.id) if proj else None,
                    "name": proj.name if proj else "未关联项目",
                    "repositories": [],
                }
            proj_map[proj_key]["repositories"].append(
                {
                    "id": str(repo.id),
                    "name": repo.name,
                    "modules": [
                        _build_node(m) for m in repo_roots_map.get(str(repo.id), [])
                    ],
                }
            )

        # 6. 整理最终结构（去掉内部 _project_map 辅助键）
        result = []
        for ws_data in workspace_map.values():
            projects = list(ws_data.pop("_project_map").values())
            result.append({**ws_data, "projects": projects})

        return Response(result)
