from pathlib import Path

from collections import defaultdict
import csv
import io
import json
from urllib.parse import quote

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
from django.utils import timezone

from plane.app.permissions import (
    allow_fine_permission,
    allow_fine_permission_or_template,
    allow_workspace_member,
    PermissionKey,
)
from plane.app.serializers.qa import CaseAttachmentSerializer, IssueListSerializer, CaseIssueSerializer, \
    TestCaseCommentSerializer, TestCaseActivitySerializer, PlanCaseRecordSerializer, CaseListSerializer, \
    CaseLabelListSerializer, IssueUnselectSerializer, ReviewCaseRecordsSerializer, ProjectCaseListSerializer
from plane.app.serializers.qa.case import CaseExecuteRecordSerializer
from plane.app.views import BaseAPIView, BaseViewSet
from plane.app.views.qa.utils import expand_module_subtree_ids
from plane.utils.import_export import parser_case_file
from plane.db.models import TestCase, FileAsset, TestCaseComment, TestCaseActivity, PlanCase, Issue, CaseModule, \
    CaseLabel, CaseReview, CaseReviewThrough, CaseReviewRecord, TestCaseRepository, TestPlan, TestCaseVersion
from plane.bgtasks.test_case_activities_task import test_case_activity
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


def get_or_create_case_module(repository_id, name, parent):
    lookup = {
        "repository_id": repository_id,
        "name": name,
        "parent": parent,
        "deleted_at__isnull": True,
    }
    try:
        module, _ = CaseModule.objects.get_or_create(**lookup)
        return module
    except CaseModule.MultipleObjectsReturned:
        return CaseModule.objects.filter(**lookup).order_by("created_at", "id").first()


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
        comment_html = request.data.get('comment_html', '<p></p>')
        comment_json = request.data.get('comment_json', {})
        # 兼容旧纯文本字段
        content = request.data.get('content', '')
        if not case_id:
            return Response({"error": "case is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not comment_html or comment_html.strip() in ('', '<p></p>'):
            if not content:
                return Response({"error": "comment_html is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            case = TestCase.objects.get(id=case_id)
        except TestCase.DoesNotExist:
            return Response({"error": "TestCase not found"}, status=status.HTTP_404_NOT_FOUND)
        parent = None
        if parent_id:
            parent = self.queryset.filter(id=parent_id, case_id=case_id).first()
        comment = self.queryset.create(
            comment_html=comment_html,
            comment_json=comment_json,
            content=content,
            creator=request.user,
            case=case,
            parent=parent,
        )
        # 触发活动记录
        test_case_activity.delay(
            type="case_comment.activity.created",
            requested_data=json.dumps({"id": str(comment.id), "comment_html": comment_html}),
            current_instance=None,
            case_id=str(case_id),
            actor_id=str(request.user.id),
            epoch=int(timezone.now().timestamp()),
        )
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

        current_snapshot = json.dumps({"id": str(comment.id), "comment_html": comment.comment_html})
        case_id = str(comment.case_id)

        def delete_subtree(node_id):
            children = TestCaseComment.objects.filter(parent_id=node_id)
            for c in children:
                delete_subtree(c.id)
            TestCaseComment.objects.filter(id=node_id).delete(soft=False)

        delete_subtree(comment.id)

        test_case_activity.delay(
            type="case_comment.activity.deleted",
            requested_data=None,
            current_instance=current_snapshot,
            case_id=case_id,
            actor_id=str(request.user.id),
            epoch=int(timezone.now().timestamp()),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TestCaseActivityAPIView(BaseAPIView):
    """用例活动记录列表，按 case_id 过滤，支持 created_at__gt 增量拉取。"""

    def get(self, request, slug, case_id):
        created_at__gt = request.query_params.get("created_at__gt")
        qs = (
            TestCaseActivity.objects.filter(case_id=case_id)
            .select_related("actor")
            .order_by("created_at")
        )
        if created_at__gt:
            qs = qs.filter(created_at__gt=created_at__gt)
        serializer = TestCaseActivitySerializer(qs, many=True)
        return list_response(data=serializer.data, count=qs.count())


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

    @action(detail=False, methods=['post'], url_path='export')
    @allow_fine_permission_or_template(PermissionKey.QA_CASE_IMPORT_EXPORT)
    def export(self, request, slug):
        fields = request.data.get('fields') or []
        if not isinstance(fields, list) or not fields:
            return Response({"error": "fields must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        ids = request.data.get('ids') or []
        repository_id = request.data.get('repository_id')
        module_id = request.data.get('module_id')

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
            "mode": "步骤类型",
            "text_description": "文本描述",
            "text_result": "文本结果",
            "remark": "备注",
            "labels": "标签",
            "issues": "关联缺陷",
            "assignee": "维护人",
            "created_at": "创建时间",
            "updated_at": "更新时间",
        }
        fields = [f for f in fields if f in allowed.keys()]
        if not fields:
            return Response({"error": "no valid fields selected"}, status=status.HTTP_400_BAD_REQUEST)

        qs = (
            TestCase.objects.filter(deleted_at__isnull=True, repository__workspace__slug=slug)
            .select_related("repository", "module", "assignee")
            .prefetch_related("labels", "issues")
        )
        if ids:
            qs = qs.filter(id__in=ids)
        if repository_id:
            qs = qs.filter(repository_id=repository_id)
        if module_id:
            qs = qs.filter(module_id__in=expand_module_subtree_ids(module_id))

        header = [allowed[f] for f in fields]
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=",", quoting=csv.QUOTE_ALL)
        writer.writerow(header)

        def val(c, key):
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
                return c.get_priority_display() if hasattr(c, "get_priority_display") else ""
            if key == "test_type":
                return c.get_test_type_display() if hasattr(c, "get_test_type_display") else ""
            if key == "state":
                return c.get_state_display() if hasattr(c, "get_state_display") else ""
            if key == "precondition":
                return c.precondition or ""
            if key == "steps":
                return c.steps or ""
            if key == "mode":
                return c.get_mode_display() if hasattr(c, "get_mode_display") else ""
            if key == "text_description":
                return c.text_description or ""
            if key == "text_result":
                return c.text_result or ""
            if key == "remark":
                return c.remark or ""
            if key == "labels":
                return ",".join([l.name for l in c.labels.all()]) if hasattr(c, "labels") else ""
            if key == "issues":
                return ",".join([str(i.id) for i in c.issues.all()]) if hasattr(c, "issues") else ""
            if key == "assignee":
                return getattr(getattr(c, "assignee", None), "display_name", "") or ""
            if key == "created_at":
                return timezone.localtime(c.created_at).strftime("%Y-%m-%d %H:%M:%S") if c.created_at else ""
            if key == "updated_at":
                return timezone.localtime(c.updated_at).strftime("%Y-%m-%d %H:%M:%S") if c.updated_at else ""
            return ""

        for c in qs.iterator():
            row = [val(c, f) for f in fields]
            writer.writerow(row)

        content = "\ufeff" + buffer.getvalue()
        resp = FileResponse(io.BytesIO(content.encode("utf-8")), content_type="text/csv; charset=utf-8")
        filename = f"test-cases-export-{timezone.now().strftime('%Y%m%d%H%M%S')}.csv"
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(filename)}"
        return resp

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
        serializer = ProjectCaseListSerializer(paginated_queryset, many=True)
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

        cases = cases.select_related('module', 'repository').only(
            'id', 'name', 'code', 'type', 'priority', 'created_at',
            'repository_id', 'repository__name',
            'module_id', 'module__name',
        ).order_by('-created_at')

        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(cases, request)
        serializer = ProjectCaseListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=paginator.page.paginator.count)

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

        issues = TestCase.objects.get(id=case_id).issues.filter(type__category__name__in=type_name)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(issues, request)
        serializer = IssueListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=issues.count())

    @action(detail=False, methods=['get'], url_path='unselect-issues')
    def unselect_issue_list(self, request, slug):
        type_name = request.query_params.get('type_name').split(',')
        case_id = request.query_params.get('case_id')
        project_id = request.query_params.get('project_id')

        select_issues = TestCase.objects.get(id=case_id).issues.filter(type__category__name__in=type_name).values_list('id',
                                                                                                             flat=True)
        issues = Issue.objects.filter(type__category__name__in=type_name, project_id=project_id).select_related('type').exclude(
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
    @allow_fine_permission_or_template(PermissionKey.QA_CASE_IMPORT_EXPORT)
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

        selected_row_numbers_raw = request.data.get('row_numbers')
        if selected_row_numbers_raw is not None:
            try:
                selected_row_numbers = json.loads(selected_row_numbers_raw)
                selected_set = set(selected_row_numbers)
                filtered = [
                    data for idx, data in enumerate(case_data, start=1)
                    if idx in selected_set
                ]
                if not filtered:
                    return Response(
                        {'error': '未选择任何有效行，请至少选择一行进行导入'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                case_data = filtered
            except (json.JSONDecodeError, TypeError):
                return Response(
                    {'error': 'row_numbers 参数格式错误'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        module_name_max_length = CaseModule._meta.get_field('name').max_length
        total_count = len(case_data)
        success_count = 0
        fail_list = []
        request_user_id = getattr(request.user, 'id', None)
        for data in case_data:
            try:
                code_key = data.get('code') or ''
                defaults = dict(
                    name=data['name'],
                    repository_id=repository_id,
                )
                if request_user_id is not None:
                    defaults['assignee_id'] = request_user_id
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
                    module_path = str(data['module']).strip()
                    if module_path:
                        module_path = module_path.strip("/")
                        module_names = [name.strip() for name in module_path.split("/")]
                        if not module_names or any(not name for name in module_names):
                            raise ValueError(f"模块路径格式错误:{data['module']}")
                        if module_name_max_length and any(len(name) > module_name_max_length for name in module_names):
                            raise ValueError(f"模块名称长度不能超过{module_name_max_length}")

                        parent = None
                        for name in module_names:
                            module = get_or_create_case_module(repository_id, name, parent)
                            parent = module
                        instance.module = parent
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
    @allow_fine_permission_or_template(PermissionKey.QA_CASE_IMPORT_EXPORT)
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
                    else:
                        module_path = module.strip().strip("/")
                        module_names = [name.strip() for name in module_path.split("/")] if module_path else []
                        if not module_names or any(not name for name in module_names):
                            errors.append('模块路径格式错误')
                        elif module_max_length and any(len(name) > module_max_length for name in module_names):
                            errors.append(f'模块名称长度不能超过{module_max_length}')

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
    @allow_workspace_member
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

        created = []
        target_repository_id = target_module.repository_id
        for source_case in source_cases:
            base_fields = dict(
                name=source_case.name,
                precondition=source_case.precondition,
                steps=source_case.steps,
                # 文本模式三件套必须一并复制，否则 mode=TEXT 的用例复制后丢正文
                mode=source_case.mode,
                text_description=source_case.text_description,
                text_result=source_case.text_result,
                remark=source_case.remark,
                state=getattr(source_case, "state", None),
                type=source_case.type,
                priority=source_case.priority,
                test_type=getattr(source_case, "test_type", None),
                repository_id=target_repository_id,
                module_id=target_module.id,
                assignee_id=getattr(request.user, "id", None),
            )
            base_fields = {k: v for k, v in base_fields.items() if v is not None}

            new_case = TestCase.objects.create(code="", **base_fields)

            label_names = list(source_case.labels.values_list("name", flat=True))
            target_labels = []
            if label_names:
                existing_labels = CaseLabel.objects.filter(
                    repository_id=target_repository_id, name__in=label_names, deleted_at__isnull=True
                )
                existing_by_name = {label.name: label for label in existing_labels}
                missing_names = [name for name in label_names if name not in existing_by_name]
                for name in missing_names:
                    target_labels.append(CaseLabel.objects.create(repository_id=target_repository_id, name=name))
                target_labels.extend(list(existing_by_name.values()))

            new_case.labels.set(target_labels)
            # 不复制评审与执行记录；问题关联保持原样
            new_case.issues.set(list(source_case.issues.all()))

            created.append(new_case)

        serializer = CaseListSerializer(created, many=True)
        return list_response(data=serializer.data, count=len(created))


class CaseMindmapAPIView(BaseAPIView):
    model = TestCase

    def get(self, request, slug):
        repository_id = request.query_params.get("repository_id")
        module_id = request.query_params.get("module_id")

        if not repository_id:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        modules = list(CaseModule.objects.filter(repository_id=repository_id, module_id=module_id).values("id", 'name',
                                                                                                          'parent_id',
                                                                                                          'sort_order'))
        module_map = {str(m['id']): m for m in modules}
        children_map = {}
        for module in modules:
            mid = str(module['id'])
            pid = str(module['parent_id'])


class CaseModuleView(BaseViewSet):

    @allow_workspace_member
    def copy(self, request, slug):
        case_module_id = request.data.get('module_id')
        target_module_id = request.data.get('target_module_id')
        target_repository_id = request.data.get('repository_id')

        if not case_module_id:
            return Response({"error": "module_id 为必填项"}, status=status.HTTP_400_BAD_REQUEST)
        if not target_module_id and not target_repository_id:
            return Response(
                {"error": "target_module_id 和 repository_id 必须填写其中一个"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_module_id and target_repository_id:
            return Response(
                {"error": "target_module_id 和 repository_id 只能填写一个"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_module = get_object_or_404(
            CaseModule, id=case_module_id, repository__workspace__slug=slug, deleted_at__isnull=True
        )

        if target_module_id:
            # 复制到指定模块下作为子模块，目标库从该模块推断
            target_parent = get_object_or_404(
                CaseModule, id=target_module_id, repository__workspace__slug=slug, deleted_at__isnull=True
            )
            target_repository = target_parent.repository
            target_repository_id = target_repository.id
        else:
            # 复制到目标库根级，无父模块
            target_parent = None
            target_repository = get_object_or_404(
                TestCaseRepository, id=target_repository_id, workspace__slug=slug
            )

        # 检查目标库同级下是否已存在同名模板
        if CaseModule.objects.filter(
            repository=target_repository,
            name=source_module.name,
            parent=target_parent,
            deleted_at__isnull=True,
        ).exists():
            return Response(
                {"error": f"目标用例库中已存在同名模板「{source_module.name}」，请重命名后再复制"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def _sync_labels(source_case, new_case, repo_id):
            label_names = list(source_case.labels.values_list("name", flat=True))
            if not label_names:
                return
            existing = CaseLabel.objects.filter(
                repository_id=repo_id, name__in=label_names, deleted_at__isnull=True
            )
            existing_by_name = {lb.name: lb for lb in existing}
            labels = list(existing_by_name.values())
            for name in label_names:
                if name not in existing_by_name:
                    labels.append(CaseLabel.objects.create(repository_id=repo_id, name=name))
            new_case.labels.set(labels)

        def _copy_cases(source_mod, new_mod, repo_id):
            source_cases = (
                TestCase.objects.filter(module=source_mod, deleted_at__isnull=True)
                .prefetch_related("labels", "issues")
            )
            for sc in source_cases:
                new_case = TestCase.objects.create(
                    code="",
                    name=sc.name,
                    precondition=sc.precondition,
                    steps=sc.steps,
                    mode=sc.mode,
                    text_description=sc.text_description,
                    text_result=sc.text_result,
                    remark=sc.remark,
                    type=sc.type,
                    test_type=sc.test_type,
                    priority=sc.priority,
                    repository_id=repo_id,
                    module=new_mod,
                    assignee_id=getattr(request.user, "id", None),
                )
                _sync_labels(sc, new_case, repo_id)
                new_case.issues.set(list(sc.issues.all()))

        def _copy_module_recursive(source_mod, parent_mod, repo_id):
            new_mod = CaseModule.objects.create(
                name=source_mod.name,
                sort_order=source_mod.sort_order,
                repository_id=repo_id,
                parent=parent_mod,
            )
            _copy_cases(source_mod, new_mod, repo_id)
            for child in source_mod.children.filter(deleted_at__isnull=True).order_by("sort_order"):
                _copy_module_recursive(child, new_mod, repo_id)
            return new_mod

        with transaction.atomic():
            new_root = _copy_module_recursive(source_module, target_parent, str(target_repository_id))

        return Response(
            {"id": str(new_root.id), "name": new_root.name},
            status=status.HTTP_201_CREATED,
        )

