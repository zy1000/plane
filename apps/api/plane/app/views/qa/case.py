from pathlib import Path

from collections import defaultdict

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.http import FileResponse
from django.db.models import Count
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.db.utils import IntegrityError
from django.core.exceptions import ValidationError

from plane.app.serializers.qa import CaseAttachmentSerializer, IssueListSerializer, CaseIssueSerializer, \
    TestCaseCommentSerializer, PlanCaseRecordSerializer, CaseListSerializer, CaseLabelListSerializer, \
    IssueUnselectSerializer, ReviewCaseRecordsSerializer
from plane.app.serializers.qa.case import CaseExecuteRecordSerializer
from plane.app.views import BaseAPIView, BaseViewSet
from plane.utils.import_export import parser_case_file
from plane.db.models import TestCase, FileAsset, TestCaseComment, PlanCase, Issue, CaseModule, CaseLabel, \
    CaseReview, CaseReviewThrough, CaseReviewRecord, TestCaseRepository, TestPlan, TestCaseVersion
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class CaseAssetAPIView(BaseAPIView):
    model = FileAsset
    queryset = FileAsset.objects.all()
    serializer_class = CaseAttachmentSerializer

    def get(self, request, slug, case_id: str):
        case = self.queryset.filter(case_id=case_id, is_uploaded=True)
        serializer = self.serializer_class(instance=case, many=True)
        return Response(data=serializer.data)


class CaseIssueWithType(BaseAPIView):
    model = TestCase
    queryset = TestCase.objects.all()
    filterset_fields = {
        'issues__type__name': ['exact', 'icontains', 'in'],
        'id': ['exact'],
    }
    serializer_class = CaseIssueSerializer

    def get(self, request, slug):
        cases = self.filter_queryset(self.queryset).distinct()
        serializer = self.serializer_class(instance=cases, many=True)
        return Response(data=serializer.data)


class CaseLabelAPIView(BaseAPIView):
    model = CaseLabel
    queryset = CaseLabel.objects.all()
    serializer_class = CaseLabelListSerializer
    filterset_fields = {
        'name': ['exact', 'icontains'],
        'repository_id': ['exact'],
        'id': ['exact']
    }

    def get(self, request, slug):
        serializer = self.serializer_class(instance=self.filter_queryset(self.queryset), many=True)
        return Response(data=serializer.data)

    def post(self, request, slug):
        name = request.data['name']
        case_id = request.data['case_id']

        case = TestCase.objects.get(id=case_id)
        label, _ = CaseLabel.objects.get_or_create(name=name, repository=case.repository)
        case.labels.add(label)
        case.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, slug):
        self.filter_queryset(self.queryset).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TestCaseCommentAPIView(BaseAPIView):
    model = TestCaseComment
    queryset = TestCaseComment.objects.all()
    serializer_class = TestCaseCommentSerializer
    pagination_class = CustomPaginator
    filterset_fields = {
        'case_id': ['exact'],
    }

    def get(self, request, slug):
        case_id = request.GET.get('case_id')
        max_depth = min(int(request.GET.get('max_depth', 5)), 5)
        if not case_id:
            return Response({"error": "case_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        roots = self.queryset.filter(case_id=case_id, parent__isnull=True).order_by('created_at')
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(roots, request)
        serializer = TestCaseCommentSerializer(paginated_queryset, many=True,
                                               context={"current_depth": 1, "max_depth": max_depth})
        return list_response(data=serializer.data, count=roots.count())

    @transaction.atomic
    def post(self, request, slug):
        parent_id = request.data.get('parent')
        case_id = request.data.get('case') or request.data.get('case_id')
        content = request.data.get('content')
        if not case_id or not content:
            return Response({"error": "content and case are required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            case = TestCase.objects.get(id=case_id)
        except TestCase.DoesNotExist:
            return Response({"error": "TestCase not found"}, status=status.HTTP_404_NOT_FOUND)
        parent = None
        if parent_id:
            parent = self.queryset.filter(id=parent_id, case_id=case_id).first()
        comment = self.queryset.create(content=content, creator=request.user, case=case, parent=parent)
        serializer = self.serializer_class(comment, context={"current_depth": 1})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def put(self, request, slug, id):
        comment = self.queryset.filter(id=id, creator=request.user).first()
        if not comment:
            return Response({"error": "Comment not found or no permission"}, status=status.HTTP_404_NOT_FOUND)
        content = request.data.get('content')
        if content is None or str(content).strip() == "":
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)
        comment.content = content
        comment.save()
        serializer = self.serializer_class(comment, context={"current_depth": 1})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, slug, id):
        comment = self.queryset.filter(id=id, creator=request.user).first()
        if not comment:
            return Response({"error": "Comment not found or no permission"}, status=status.HTTP_404_NOT_FOUND)

        def delete_subtree(node_id):
            children = TestCaseComment.objects.filter(parent_id=node_id)
            for c in children:
                delete_subtree(c.id)
            TestCaseComment.objects.filter(id=node_id).delete(soft=False)

        delete_subtree(comment.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseAPI(BaseViewSet):
    pagination_class = CustomPaginator

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request, slug):
        template_path = Path(__file__).resolve().parents[4] / '测试用例导入模板-V1.0.xlsx'
        if not template_path.exists():
            return Response({'error': 'template file not found'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            open(template_path, 'rb'),
            as_attachment=True,
            filename='测试用例导入模板-V1.0.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    @action(detail=False, methods=['get'], url_path='execute-record')
    def execute_record(self, request, slug):
        case_id = request.query_params.get('case_id')
        result = []

        plan_cases = PlanCase.objects.filter(case_id=case_id)
        for plan_case in plan_cases:
            record = plan_case.plan_case_records.first()
            if not record:
                continue
            serializer = CaseExecuteRecordSerializer(record)
            result.append(serializer.data)
        return list_response(data=result, count=len(result))

    @action(detail=False, methods=['get'], url_path='plan-case-tree')
    def plan_case_tree(self, request, slug):
        plan_id = request.query_params.get('plan_id')
        if not plan_id:
            return Response({"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        rows = (
            PlanCase.objects.filter(plan_id=plan_id, case__deleted_at__isnull=True,
                                    case__repository__workspace__slug=slug)
            .values('case__repository_id', 'case__repository__name', 'case__module_id')
            .distinct()
        )

        repo_ids: set[str] = set()
        repo_name_by_id: dict[str, str] = {}
        module_ids_by_repo: dict[str, set[str]] = defaultdict(set)

        for r in rows:
            repo_id = r.get('case__repository_id')
            if not repo_id:
                continue
            repo_id = str(repo_id)
            repo_ids.add(repo_id)
            repo_name_by_id[repo_id] = r.get('case__repository__name') or repo_id
            module_id = r.get('case__module_id')
            if module_id:
                module_ids_by_repo[repo_id].add(str(module_id))

        if not repo_ids:
            return Response({"id": "all", "name": "全部用例库", "kind": "root", "children": []},
                            status=status.HTTP_200_OK)

        expanded_ids_by_repo: dict[str, set[str]] = {rid: set(mids) for rid, mids in module_ids_by_repo.items()}
        for repo_id, mids in list(expanded_ids_by_repo.items()):
            frontier = set(mids)
            while frontier:
                parent_ids = set(
                    CaseModule.objects.filter(id__in=list(frontier), deleted_at__isnull=True, repository_id=repo_id)
                    .exclude(parent_id__isnull=True)
                    .values_list('parent_id', flat=True)
                )
                parent_ids = {str(pid) for pid in parent_ids if pid}
                new_parents = parent_ids - mids
                if not new_parents:
                    break
                mids.update(new_parents)
                frontier = new_parents
            expanded_ids_by_repo[repo_id] = mids

        all_module_ids: set[str] = set()
        for mids in expanded_ids_by_repo.values():
            all_module_ids.update(mids)

        module_rows_by_repo: dict[str, list[dict]] = defaultdict(list)
        if all_module_ids:
            for m in CaseModule.objects.filter(id__in=list(all_module_ids), deleted_at__isnull=True).values(
                    'id', 'name', 'parent_id', 'repository_id'
            ):
                module_rows_by_repo[str(m.get('repository_id'))].append(m)

        def build_module_tree(repo_id: str):
            items = module_rows_by_repo.get(repo_id, [])
            by_id = {str(m.get('id')): m for m in items if m.get('id')}
            children_map: dict[str, list[str]] = defaultdict(list)

            for m in items:
                mid = str(m.get('id'))
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if pid and pid in by_id:
                    children_map[pid].append(mid)

            roots: list[str] = []
            for mid, m in by_id.items():
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if not pid or pid not in by_id:
                    roots.append(mid)

            def name_key(mid: str):
                return (by_id.get(mid, {}).get('name') or '').lower()

            roots.sort(key=name_key)
            for pid in list(children_map.keys()):
                children_map[pid].sort(key=name_key)

            def build(mid: str):
                m = by_id.get(mid) or {}
                return {
                    "id": mid,
                    "name": m.get("name") or "-",
                    "kind": "module",
                    "repository_id": repo_id,
                    "children": [build(child) for child in children_map.get(mid, [])],
                }

            return [build(mid) for mid in roots]

        repo_pairs = [(rid, repo_name_by_id.get(rid) or rid) for rid in repo_ids]
        repo_pairs.sort(key=lambda x: (x[1] or '').lower())

        children = []
        for repo_id, repo_name in repo_pairs:
            module_tree = build_module_tree(repo_id)
            children.append(
                {
                    "id": repo_id,
                    "name": repo_name or "-",
                    "kind": "repository",
                    "repository_id": repo_id,
                    "children": [
                        {
                            "id": f"{repo_id}:all_modules",
                            "name": "全部模块",
                            "kind": "repository_modules_all",
                            "repository_id": repo_id,
                            "children": module_tree,
                        }
                    ],
                }
            )

        return Response({"id": "all", "name": "全部用例库", "kind": "root", "children": children},
                        status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='review-case-tree')
    def review_case_tree(self, request, slug):
        review_id = request.query_params.get('review_id')
        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        rows = (
            CaseReviewThrough.objects.filter(
                review_id=review_id, case__deleted_at__isnull=True, case__repository__workspace__slug=slug
            )
            .values('case__repository_id', 'case__repository__name', 'case__module_id')
            .distinct()
        )

        repo_ids: set[str] = set()
        repo_name_by_id: dict[str, str] = {}
        module_ids_by_repo: dict[str, set[str]] = defaultdict(set)

        for r in rows:
            repo_id = r.get('case__repository_id')
            if not repo_id:
                continue
            repo_id = str(repo_id)
            repo_ids.add(repo_id)
            repo_name_by_id[repo_id] = r.get('case__repository__name') or repo_id
            module_id = r.get('case__module_id')
            if module_id:
                module_ids_by_repo[repo_id].add(str(module_id))

        if not repo_ids:
            return Response({"id": "all", "name": "全部用例库", "kind": "root", "children": []},
                            status=status.HTTP_200_OK)

        expanded_ids_by_repo: dict[str, set[str]] = {rid: set(mids) for rid, mids in module_ids_by_repo.items()}
        for repo_id, mids in list(expanded_ids_by_repo.items()):
            frontier = set(mids)
            while frontier:
                parent_ids = set(
                    CaseModule.objects.filter(id__in=list(frontier), deleted_at__isnull=True, repository_id=repo_id)
                    .exclude(parent_id__isnull=True)
                    .values_list('parent_id', flat=True)
                )
                parent_ids = {str(pid) for pid in parent_ids if pid}
                new_parents = parent_ids - mids
                if not new_parents:
                    break
                mids.update(new_parents)
                frontier = new_parents
            expanded_ids_by_repo[repo_id] = mids

        all_module_ids: set[str] = set()
        for mids in expanded_ids_by_repo.values():
            all_module_ids.update(mids)

        module_rows_by_repo: dict[str, list[dict]] = defaultdict(list)
        if all_module_ids:
            for m in CaseModule.objects.filter(id__in=list(all_module_ids), deleted_at__isnull=True).values(
                    'id', 'name', 'parent_id', 'repository_id'
            ):
                module_rows_by_repo[str(m.get('repository_id'))].append(m)

        def build_module_tree(repo_id: str):
            items = module_rows_by_repo.get(repo_id, [])
            by_id = {str(m.get('id')): m for m in items if m.get('id')}
            children_map: dict[str, list[str]] = defaultdict(list)

            for m in items:
                mid = str(m.get('id'))
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if pid and pid in by_id:
                    children_map[pid].append(mid)

            roots: list[str] = []
            for mid, m in by_id.items():
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if not pid or pid not in by_id:
                    roots.append(mid)

            def name_key(mid: str):
                return (by_id.get(mid, {}).get('name') or '').lower()

            roots.sort(key=name_key)
            for pid in list(children_map.keys()):
                children_map[pid].sort(key=name_key)

            def build(mid: str):
                m = by_id.get(mid) or {}
                return {
                    "id": mid,
                    "name": m.get("name") or "-",
                    "kind": "module",
                    "repository_id": repo_id,
                    "children": [build(child) for child in children_map.get(mid, [])],
                }

            return [build(mid) for mid in roots]

        repo_pairs = [(rid, repo_name_by_id.get(rid) or rid) for rid in repo_ids]
        repo_pairs.sort(key=lambda x: (x[1] or '').lower())

        children = []
        for repo_id, repo_name in repo_pairs:
            module_tree = build_module_tree(repo_id)
            children.append(
                {
                    "id": repo_id,
                    "name": repo_name or "-",
                    "kind": "repository",
                    "repository_id": repo_id,
                    "children": [
                        {
                            "id": f"{repo_id}:all_modules",
                            "name": "全部模块",
                            "kind": "repository_modules_all",
                            "repository_id": repo_id,
                            "children": module_tree,
                        }
                    ],
                }
            )

        return Response({"id": "all", "name": "全部用例库", "kind": "root", "children": children},
                        status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='plan-unassociated-tree')
    def plan_unassociated_tree(self, request, slug):
        plan_id = request.query_params.get('plan_id')
        if not plan_id:
            return Response({"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        plan = get_object_or_404(TestPlan, id=plan_id, deleted_at__isnull=True, project__workspace__slug=slug)

        repositories = list(
            TestCaseRepository.objects.filter(project_id=plan.project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values('id', 'name')
            .order_by('name')
        )
        repo_ids = [str(r['id']) for r in repositories]

        modules = list(
            CaseModule.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
            .values('id', 'name', 'parent_id', 'repository_id')
        )

        unassociated = (
            TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
            .exclude(plan_cases__plan__id=plan_id, plan_cases__deleted_at__isnull=True)
        )

        repo_counts = {
            str(r['repository_id']): int(r['count'])
            for r in unassociated.values('repository_id').annotate(count=Count('id'))
            if r.get('repository_id')
        }

        base_module_counts = {
            str(r['module_id']): int(r['count'])
            for r in unassociated.exclude(module_id__isnull=True).values('module_id').annotate(count=Count('id'))
            if r.get('module_id')
        }
        modules_by_repo: dict[str, list[dict]] = defaultdict(list)
        for m in modules:
            rid = m.get('repository_id')
            if rid:
                modules_by_repo[str(rid)].append(m)

        def build_module_tree_with_counts(repo_id: str):
            items = modules_by_repo.get(repo_id, [])
            by_id = {str(m['id']): m for m in items if m.get('id')}
            children_map: dict[str, list[str]] = defaultdict(list)

            for m in items:
                mid = str(m.get('id'))
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if pid and pid in by_id:
                    children_map[pid].append(mid)

            def name_key(mid: str):
                return (by_id.get(mid, {}).get('name') or '').lower()

            roots: list[str] = []
            for mid, m in by_id.items():
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if not pid or pid not in by_id:
                    roots.append(mid)
            roots.sort(key=name_key)
            for pid in list(children_map.keys()):
                children_map[pid].sort(key=name_key)

            memo: dict[str, int] = {}

            def subtree_count(mid: str) -> int:
                if mid in memo:
                    return memo[mid]
                total = int(base_module_counts.get(mid, 0))
                for child in children_map.get(mid, []):
                    total += subtree_count(child)
                memo[mid] = total
                return total

            def build(mid: str):
                m = by_id.get(mid) or {}
                return {
                    "id": mid,
                    "name": m.get("name") or "-",
                    "kind": "module",
                    "repository_id": repo_id,
                    "count": subtree_count(mid),
                    "children": [build(child) for child in children_map.get(mid, [])],
                }

            return [build(mid) for mid in roots]

        children = []
        total = 0
        for r in repositories:
            repo_id = str(r['id'])
            repo_name = r.get('name') or "-"
            repo_total = int(repo_counts.get(repo_id, 0))
            total += repo_total
            module_tree = build_module_tree_with_counts(repo_id)
            children.append(
                {
                    "id": repo_id,
                    "name": repo_name,
                    "kind": "repository",
                    "repository_id": repo_id,
                    "count": repo_total,
                    "children": [
                        {
                            "id": f"{repo_id}:all_modules",
                            "name": "全部模块",
                            "kind": "repository_modules_all",
                            "repository_id": repo_id,
                            "count": repo_total,
                            "children": module_tree,
                        }
                    ],
                }
            )

        return Response(
            {"id": "all", "name": "全部用例库", "kind": "root", "count": total, "children": children},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], url_path='plan-unassociated-cases')
    def plan_unassociated_cases(self, request, slug):
        plan_id = request.query_params.get('plan_id')
        if not plan_id:
            return Response({"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        plan = get_object_or_404(TestPlan, id=plan_id, deleted_at__isnull=True, project__workspace__slug=slug)
        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=plan.project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')
        name__icontains = request.query_params.get('name__icontains')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True).exclude(
            plan_cases__plan__id=plan_id, plan_cases__deleted_at__isnull=True
        )
        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)
        if name__icontains:
            cases = cases.filter(name__icontains=name__icontains)

        cases = cases.order_by('-created_at')
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = CaseListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @action(detail=False, methods=['get'], url_path='plan-unassociated-case-ids')
    def plan_unassociated_case_ids(self, request, slug):
        plan_id = request.query_params.get('plan_id')
        if not plan_id:
            return Response({"error": "plan_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        plan = get_object_or_404(TestPlan, id=plan_id, deleted_at__isnull=True, project__workspace__slug=slug)
        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=plan.project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True).exclude(
            plan_cases__plan__id=plan_id, plan_cases__deleted_at__isnull=True
        )

        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)

        ids = list(cases.values_list('id', flat=True))
        return list_response(data=ids, count=len(ids))

    @action(detail=False, methods=['get'], url_path='project-case-tree')
    def project_case_tree(self, request, slug):
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        repositories = list(
            TestCaseRepository.objects.filter(project_id=project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values('id', 'name')
            .order_by('name')
        )
        repo_ids = [str(r['id']) for r in repositories]

        modules = list(
            CaseModule.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
            .values('id', 'name', 'parent_id', 'repository_id')
        )

        all_cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)

        repo_counts = {
            str(r['repository_id']): int(r['count'])
            for r in all_cases.values('repository_id').annotate(count=Count('id'))
            if r.get('repository_id')
        }

        base_module_counts = {
            str(r['module_id']): int(r['count'])
            for r in all_cases.exclude(module_id__isnull=True).values('module_id').annotate(count=Count('id'))
            if r.get('module_id')
        }

        modules_by_repo: dict[str, list[dict]] = defaultdict(list)
        for m in modules:
            rid = m.get('repository_id')
            if rid:
                modules_by_repo[str(rid)].append(m)

        def build_module_tree_with_counts(repo_id: str):
            items = modules_by_repo.get(repo_id, [])
            by_id = {str(m['id']): m for m in items if m.get('id')}
            children_map: dict[str, list[str]] = defaultdict(list)

            for m in items:
                mid = str(m.get('id'))
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if pid and pid in by_id:
                    children_map[pid].append(mid)

            def name_key(mid: str):
                return (by_id.get(mid, {}).get('name') or '').lower()

            roots: list[str] = []
            for mid, m in by_id.items():
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if not pid or pid not in by_id:
                    roots.append(mid)
            roots.sort(key=name_key)
            for pid in list(children_map.keys()):
                children_map[pid].sort(key=name_key)

            memo: dict[str, int] = {}

            def subtree_count(mid: str) -> int:
                if mid in memo:
                    return memo[mid]
                total = int(base_module_counts.get(mid, 0))
                for child in children_map.get(mid, []):
                    total += subtree_count(child)
                memo[mid] = total
                return total

            def build(mid: str):
                m = by_id.get(mid) or {}
                return {
                    "id": mid,
                    "name": m.get("name") or "-",
                    "kind": "module",
                    "repository_id": repo_id,
                    "count": subtree_count(mid),
                    "children": [build(child) for child in children_map.get(mid, [])],
                }

            return [build(mid) for mid in roots]

        children = []
        total = 0
        for r in repositories:
            repo_id = str(r['id'])
            repo_name = r.get('name') or "-"
            repo_total = int(repo_counts.get(repo_id, 0))
            total += repo_total
            module_tree = build_module_tree_with_counts(repo_id)
            children.append(
                {
                    "id": repo_id,
                    "name": repo_name,
                    "kind": "repository",
                    "repository_id": repo_id,
                    "count": repo_total,
                    "children": [
                        {
                            "id": f"{repo_id}:all_modules",
                            "name": "全部模块",
                            "kind": "repository_modules_all",
                            "repository_id": repo_id,
                            "count": repo_total,
                            "children": module_tree,
                        }
                    ],
                }
            )

        return Response(
            {"id": "all", "name": "全部用例库", "kind": "root", "count": total, "children": children},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], url_path='project-cases')
    def project_cases(self, request, slug):
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')
        name__icontains = request.query_params.get('name__icontains')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)
        if name__icontains:
            cases = cases.filter(name__icontains=name__icontains)

        cases = cases.order_by('-created_at')
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = CaseListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @action(detail=False, methods=['get'], url_path='project-case-ids')
    def project_case_ids(self, request, slug):
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=project_id, workspace__slug=slug, deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)

        ids = list(cases.values_list('id', flat=True))
        return list_response(data=ids, count=len(ids))

    @action(detail=False, methods=['get'], url_path='review-unassociated-tree')
    def review_unassociated_tree(self, request, slug):
        review_id = request.query_params.get('review_id')
        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        review = get_object_or_404(CaseReview, id=review_id, deleted_at__isnull=True, project__workspace__slug=slug)

        repositories = list(
            TestCaseRepository.objects.filter(project_id=review.project_id, workspace__slug=slug,
                                              deleted_at__isnull=True)
            .values('id', 'name')
            .order_by('name')
        )
        repo_ids = [str(r['id']) for r in repositories]

        modules = list(
            CaseModule.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
            .values('id', 'name', 'parent_id', 'repository_id')
        )

        unassociated = (
            TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True)
            .exclude(review_cases__review_id=review_id, review_cases__deleted_at__isnull=True)
        )

        repo_counts = {
            str(r['repository_id']): int(r['count'])
            for r in unassociated.values('repository_id').annotate(count=Count('id'))
            if r.get('repository_id')
        }

        base_module_counts = {
            str(r['module_id']): int(r['count'])
            for r in unassociated.exclude(module_id__isnull=True).values('module_id').annotate(count=Count('id'))
            if r.get('module_id')
        }

        modules_by_repo: dict[str, list[dict]] = defaultdict(list)
        for m in modules:
            rid = m.get('repository_id')
            if rid:
                modules_by_repo[str(rid)].append(m)

        def build_module_tree_with_counts(repo_id: str):
            items = modules_by_repo.get(repo_id, [])
            by_id = {str(m['id']): m for m in items if m.get('id')}
            children_map: dict[str, list[str]] = defaultdict(list)

            for m in items:
                mid = str(m.get('id'))
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if pid and pid in by_id:
                    children_map[pid].append(mid)

            def name_key(mid: str):
                return (by_id.get(mid, {}).get('name') or '').lower()

            roots: list[str] = []
            for mid, m in by_id.items():
                pid = str(m.get('parent_id')) if m.get('parent_id') else None
                if not pid or pid not in by_id:
                    roots.append(mid)
            roots.sort(key=name_key)
            for pid in list(children_map.keys()):
                children_map[pid].sort(key=name_key)

            memo: dict[str, int] = {}

            def subtree_count(mid: str) -> int:
                if mid in memo:
                    return memo[mid]
                total = int(base_module_counts.get(mid, 0))
                for child in children_map.get(mid, []):
                    total += subtree_count(child)
                memo[mid] = total
                return total

            def build(mid: str):
                m = by_id.get(mid) or {}
                return {
                    "id": mid,
                    "name": m.get("name") or "-",
                    "kind": "module",
                    "repository_id": repo_id,
                    "count": subtree_count(mid),
                    "children": [build(child) for child in children_map.get(mid, [])],
                }

            return [build(mid) for mid in roots]

        children = []
        total = 0
        for r in repositories:
            repo_id = str(r['id'])
            repo_name = r.get('name') or "-"
            repo_total = int(repo_counts.get(repo_id, 0))
            total += repo_total
            module_tree = build_module_tree_with_counts(repo_id)
            children.append(
                {
                    "id": repo_id,
                    "name": repo_name,
                    "kind": "repository",
                    "repository_id": repo_id,
                    "count": repo_total,
                    "children": [
                        {
                            "id": f"{repo_id}:all_modules",
                            "name": "全部模块",
                            "kind": "repository_modules_all",
                            "repository_id": repo_id,
                            "count": repo_total,
                            "children": module_tree,
                        }
                    ],
                }
            )

        return Response(
            {"id": "all", "name": "全部用例库", "kind": "root", "count": total, "children": children},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], url_path='review-unassociated-cases')
    def review_unassociated_cases(self, request, slug):
        review_id = request.query_params.get('review_id')
        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        review = get_object_or_404(CaseReview, id=review_id, deleted_at__isnull=True, project__workspace__slug=slug)
        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=review.project_id, workspace__slug=slug,
                                              deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')
        name__icontains = request.query_params.get('name__icontains')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True).exclude(
            review_cases__review_id=review_id, review_cases__deleted_at__isnull=True
        )
        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)
        if name__icontains:
            cases = cases.filter(name__icontains=name__icontains)

        cases = cases.order_by('-created_at')
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = CaseListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @action(detail=False, methods=['get'], url_path='review-unassociated-case-ids')
    def review_unassociated_case_ids(self, request, slug):
        review_id = request.query_params.get('review_id')
        if not review_id:
            return Response({"error": "review_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        review = get_object_or_404(CaseReview, id=review_id, deleted_at__isnull=True, project__workspace__slug=slug)
        repo_ids = list(
            TestCaseRepository.objects.filter(project_id=review.project_id, workspace__slug=slug,
                                              deleted_at__isnull=True)
            .values_list('id', flat=True)
        )

        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')

        cases = TestCase.objects.filter(repository_id__in=repo_ids, deleted_at__isnull=True).exclude(
            review_cases__review_id=review_id, review_cases__deleted_at__isnull=True
        )
        if repository_id:
            cases = cases.filter(repository_id=repository_id)
        if module_id:
            case_module = get_object_or_404(CaseModule, id=module_id, deleted_at__isnull=True,
                                            repository_id__in=repo_ids)
            cases = cases.filter(module_id__in=case_module.get_all_children)

        ids = list(cases.values_list('id', flat=True))
        return list_response(data=ids, count=len(ids))

    @action(detail=False, methods=['get'], url_path='review-record')
    def review_record(self, request, slug):
        case_ids = request.query_params.getlist('case_id')
        if not case_ids:
            case_id = request.query_params.get('case_id')
            case_ids = [i for i in (case_id.split(",") if case_id else []) if i]

        crts = CaseReviewThrough.objects.filter(case_id__in=case_ids).values_list('id', flat=True)
        query = CaseReviewRecord.objects.filter(crt_id__in=crts)
        serializer = ReviewCaseRecordsSerializer(instance=query, many=True)
        return list_response(data=serializer.data, count=query.count())

    @action(detail=False, methods=['get'], url_path='issues-list')
    def issue_list(self, request, slug):
        type_name = request.query_params.get('type_name').split(',')
        case_id = request.query_params.get('case_id')

        issues = TestCase.objects.get(id=case_id).issues.filter(type__name__in=type_name)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(issues, request)
        serializer = IssueListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=issues.count())

    @action(detail=False, methods=['get'], url_path='unselect-issues')
    def unselect_issue_list(self, request, slug):
        type_name = request.query_params.get('type_name').split(',')
        case_id = request.query_params.get('case_id')
        project_id = request.query_params.get('project_id')

        select_issues = TestCase.objects.get(id=case_id).issues.filter(type__name__in=type_name).values_list('id',
                                                                                                             flat=True)
        issues = Issue.objects.filter(type__name__in=type_name, project_id=project_id).select_related('type').exclude(
            id__in=select_issues)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(issues, request)
        serializer = IssueUnselectSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=issues.count())

    @action(detail=False, methods=['get'], url_path='issue-case')
    def get_issue_case(self, request, slug):
        issue_id = request.query_params.get('issue_id')
        issue = Issue.objects.get(id=issue_id)
        cases = issue.cases.all()
        serializer = CaseListSerializer(cases, many=True)
        return Response(data=serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='unselect-issue-case')
    def get_unselect_issue_case(self, request, slug):
        issue_id = request.query_params.get('issue_id')
        repository_id = request.query_params.get('repository_id')
        module_id = request.query_params.get('module_id')
        name__icontains = request.query_params.get('name__icontains')

        issue = Issue.objects.get(id=issue_id)
        case_id = issue.cases.values_list('id', flat=True)
        cases = TestCase.objects.filter(repository__workspace__slug=slug, repository_id=repository_id)
        if module_id:
            case_module = CaseModule.objects.get(id=module_id)
            cases = cases.filter(module_id__in=case_module.get_all_children)
        if name__icontains:
            cases = cases.filter(name__icontains=name__icontains)
        cases = cases.exclude(id__in=case_id)
        cases = cases.order_by('-created_at')

        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = CaseListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=cases.count())

    @action(detail=False, methods=['delete'], url_path='delete-issue-case')
    def delete_issue_case(self, request, slug):
        issue_id = request.data.get('issue_id')
        case_id = request.data.get('case_id')

        if not issue_id or not case_id:
            return Response({"error": "issue_id and case_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = get_object_or_404(Issue, id=issue_id)
        case = get_object_or_404(TestCase, id=case_id)
        issue.cases.remove(case)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='add-issue-case')
    def add_issue_case(self, request, slug):
        issue_id = request.data.get('issue_id')
        case_id = request.data.get('case_id')

        if not issue_id or not case_id:
            return Response({"error": "issue_id and case_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = get_object_or_404(Issue, id=issue_id)
        case = get_object_or_404(TestCase, id=case_id)
        issue.cases.add(case)
        return Response(status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='import-case')
    def import_case(self, request, slug):
        repository_id = request.data.get('repository_id')
        if not repository_id:
            return Response({'error': 'repository_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        get_object_or_404(TestCaseRepository, id=repository_id, workspace__slug=slug, deleted_at__isnull=True)

        files: list[InMemoryUploadedFile] = request.FILES.getlist('file')
        if not files:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            case_data = parser_case_file(files)
        except Exception as e:
            return Response({'error': f'用例导入失败:{str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        total_count = len(case_data)
        success_count = 0
        fail_list = []
        for data in case_data:
            try:
                code_key = data.get('code') or ''
                defaults = dict(
                    name=data['name'],
                    repository_id=repository_id,
                )
                remark = data.get('remark')
                if remark not in (None, ''):
                    defaults['remark'] = remark

                precondition = data.get('precondition')
                if precondition not in (None, ''):
                    defaults['precondition'] = precondition

                steps = data.get('steps')
                if steps not in (None, ''):
                    defaults['steps'] = steps

                priority_key = data.get('priority')
                if priority_key not in (None, ''):
                    defaults['priority'] = TestCase.Priority[priority_key].value

                instance, _ = TestCase.objects.update_or_create(
                    code=code_key,
                    repository_id=repository_id,
                    defaults=defaults
                )

                # 创建模块
                if data.get('module'):
                    case_module, _ = CaseModule.objects.get_or_create(repository_id=repository_id, name=data['module'])
                    instance.module = case_module
                # 创建标签
                # if data.get('label'):
                #     for label in data['label']:
                #         label_instance, _ = CaseLabel.objects.get_or_create(repository_id=repository_id, name=label)
                #         instance.labels.add(label_instance)
                instance.save()

                # 创建历史版本
                TestCaseVersion.create_from_case(instance)
            except IntegrityError as e:
                fail_list.append(dict(name=data['name'], error='case name already exists'))
                continue
            except Exception as e:
                fail_list.append(dict(name=data['name'], error=str(e).replace('\n', '')))
                continue
            success_count += 1

        return Response(data={'total_count': total_count, 'success_count': success_count, 'fail': fail_list},
                        status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='validate-import-case')
    def validate_import_case(self, request, slug):
        repository_id = request.data.get('repository_id')
        if not repository_id:
            return Response({'error': 'repository_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        get_object_or_404(TestCaseRepository, id=repository_id, workspace__slug=slug, deleted_at__isnull=True)

        files: list[InMemoryUploadedFile] = request.FILES.getlist('file')
        if not files:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            case_data = parser_case_file(files)
        except Exception as e:
            return Response({'error': f'用例校验失败:{str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        name_max_length = TestCase._meta.get_field('name').max_length
        module_max_length = CaseModule._meta.get_field('name').max_length
        code_max_length = TestCase._meta.get_field('code').max_length

        results = []
        passed_count = 0

        for row_number, data in enumerate(case_data, start=1):
            title = ""
            errors: list[str] = []

            if not isinstance(data, dict):
                errors.append('行数据格式错误')
            else:
                name = data.get('name')
                if isinstance(name, str):
                    title = name
                if not name or not isinstance(name, str):
                    errors.append('标题不能为空')
                elif name_max_length and len(name) > name_max_length:
                    errors.append(f'标题长度不能超过{name_max_length}')

                code = data.get('code')
                if code not in (None, ''):
                    if not isinstance(code, str):
                        errors.append('编号格式错误')
                    elif code_max_length and len(code) > code_max_length:
                        errors.append(f'编号长度不能超过{code_max_length}')

                module = data.get('module')
                if module not in (None, ''):
                    if not isinstance(module, str):
                        errors.append('模块格式错误')
                    elif module_max_length and len(module) > module_max_length:
                        errors.append(f'模块长度不能超过{module_max_length}')

                steps = data.get('steps')
                if steps not in (None, ''):
                    if not isinstance(steps, list):
                        errors.append('步骤格式错误')
                    else:
                        for idx, step in enumerate(steps, start=1):
                            if not isinstance(step, dict):
                                errors.append(f'步骤{idx}格式错误')
                                continue
                            if 'description' not in step:
                                errors.append(f'步骤{idx}缺少描述')
                            if 'result' not in step:
                                errors.append(f'步骤{idx}缺少预期结果')

                priority_key = data.get('priority')
                if priority_key not in (None, ''):
                    if not isinstance(priority_key, str):
                        errors.append('优先级格式错误')
                    elif priority_key not in TestCase.Priority.__members__:
                        errors.append(f'优先级不合法:{priority_key}')

            passed = len(errors) == 0
            if passed:
                passed_count += 1

            results.append(
                {
                    'row_number': row_number,
                    'title': title,
                    'passed': passed,
                    'error_reason': '; '.join(errors),
                }
            )

        return Response(
            data={
                'total_count': len(results),
                'passed_count': passed_count,
                'all_passed': passed_count == len(results),
                'results': results,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='update-module')
    def update_module(self, request, slug):
        cases_id = request.data.get('cases_id')
        module_id = request.data.get('module_id')

        TestCase.objects.filter(pk__in=cases_id).update(module_id=module_id)
        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='copy-case')
    def copy_case(self, request, slug):
        cases_id = request.data.get('cases_id') or []
        module_id = request.data.get('module_id')

        if not module_id:
            return Response({"error": "module_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(cases_id, list) or len(cases_id) == 0:
            return Response({"error": "cases_id must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        target_module = get_object_or_404(CaseModule, id=module_id, repository__workspace__slug=slug)

        source_cases = (
            TestCase.objects.filter(id__in=cases_id, repository__workspace__slug=slug, deleted_at__isnull=True)
            .select_related("repository", "module", "assignee")
            .prefetch_related("labels", "issues", "review_cases")
        )

        found_ids = set(str(i) for i in source_cases.values_list("id", flat=True))
        missing_ids = [str(i) for i in cases_id if str(i) not in found_ids]
        if missing_ids:
            return Response({"error": f"TestCase not found: {','.join(missing_ids)}"}, status=status.HTTP_404_NOT_FOUND)

        if source_cases.filter(repository_id__isnull=True).exists():
            return Response({"error": "Invalid source case repository"}, status=status.HTTP_400_BAD_REQUEST)

        if source_cases.exclude(repository_id=target_module.repository_id).exists():
            return Response({"error": "Target module repository mismatch"}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        for source_case in source_cases:
            base_fields = dict(
                name=source_case.name,
                precondition=source_case.precondition,
                steps=source_case.steps,
                remark=source_case.remark,
                state=getattr(source_case, "state", None),
                type=source_case.type,
                priority=source_case.priority,
                test_type=getattr(source_case, "test_type", None),
                repository_id=source_case.repository_id,
                module_id=target_module.id,
                assignee_id=source_case.assignee_id,
            )
            base_fields = {k: v for k, v in base_fields.items() if v is not None}

            new_case = TestCase.objects.create(code="", **base_fields)

            new_case.labels.set(list(source_case.labels.all()))
            new_case.issues.set(list(source_case.issues.all()))

            throughs = CaseReviewThrough.objects.filter(case=source_case).select_related("review")
            if throughs.exists():
                CaseReviewThrough.objects.bulk_create(
                    [
                        CaseReviewThrough(
                            review_id=t.review_id,
                            case_id=new_case.id,
                            result=t.result,
                        )
                        for t in throughs
                    ],
                    batch_size=1000,
                )

            created.append(new_case)

        serializer = CaseListSerializer(created, many=True)
        return list_response(data=serializer.data, count=len(created))
