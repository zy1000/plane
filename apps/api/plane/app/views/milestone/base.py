from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.serializers.issue import IssueWithTypeSerializer
from plane.app.serializers.milestone import (
    MilestoneCreateUpdateSerializer,
    MilestoneIssueListSerializer,
    MilestoneListSerializer,
)
from plane.app.views import BaseAPIView, BaseViewSet
from plane.db.models import Milestone, StateGroup, Issue
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class MilestoneAPIView(BaseAPIView):
    model = Milestone
    serializer_class = MilestoneListSerializer
    pagination_class = CustomPaginator
    filterset_fields = {
        'name': ['exact', 'icontains'],
        'state': ['exact', 'in'],
    }

    def get_queryset(self):
        return Milestone.objects.annotate(
            all_count=Count('issues', distinct=True),
            completed_count=Count('issues', distinct=True, filter=Q(issues__state__group=StateGroup.COMPLETED)),
        )

    def get(self, request, slug, project_id: str):
        queryset = self.filter_queryset(self.get_queryset()).filter(project_id=project_id).order_by('-created_at')
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(queryset, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=queryset.count())

    def post(self, request, slug: str, project_id: str):
        serializer = MilestoneCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        milestone = serializer.save()
        serializer = self.serializer_class(instance=milestone)
        return Response(data=serializer.data)

    def put(self, request, slug: str, project_id: str):
        milestone_id = request.data.pop('id')
        milestone = self.get_queryset().get(id=milestone_id)
        serializer = MilestoneCreateUpdateSerializer(instance=milestone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        milestone = serializer.save()
        serializer = self.serializer_class(instance=milestone)
        return Response(data=serializer.data)

    def delete(self, request, slug: str, project_id: str):
        milestone_ids = request.data.pop('id')
        self.get_queryset().filter(id=milestone_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneView(BaseViewSet):
    queryset = Milestone.objects.all()
    pagination_class = CustomPaginator

    @action(detail=False, methods=['get'], url_path='issues')
    def get_issues(self, request, slug, project_id):
        milestone_id = request.query_params.get('milestone_id')
        paginator = self.pagination_class()
        milestone = self.queryset.get(id=milestone_id)
        issues_queryset = (
            milestone.issues.all()
            .select_related("project", "state", "type", "parent", "estimate_point")
            .prefetch_related("issue_assignee", "label_issue", "issue_module", "issue_cycle")
        )
        paginated_queryset = paginator.paginate_queryset(issues_queryset, request)
        serializer = MilestoneIssueListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=milestone.issues.count())

    @action(detail=False, methods=['get'], url_path='unselect')
    def get_unselect_list(self, request, slug, project_id):
        type_id = request.query_params.get('type_id')
        name = request.query_params.get('name')
        milestone = Milestone.objects.get(pk=request.query_params.get('milestone_id'))
        paginator = self.pagination_class()
        unrelated_issues = Issue.objects.filter(milestones__isnull=True, project=milestone.project)
        if type_id:
            unrelated_issues = unrelated_issues.filter(type_id=type_id)
        if name:
            unrelated_issues = unrelated_issues.filter(name__icontains=name)
        paginated_queryset = paginator.paginate_queryset(unrelated_issues, request)
        serializer = IssueWithTypeSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=unrelated_issues.count())

    @action(detail=False, methods=['post'], url_path='add-milestone-issue')
    def add_milestone_issue(self, request, slug, project_id):
        issue_id = request.data.get('issue_id')
        milestone_id = request.data.get('milestone_id')

        if not issue_id or not milestone_id:
            return Response({"error": "issue_id and milestone_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.get(pk=issue_id)
        milestone = Milestone.objects.get(pk=milestone_id)
        milestone.issues.add(issue)
        return Response(status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['delete'], url_path='delete-milestone-issue')
    def delete_milestone_issue(self, request, slug, project_id):
        issue_id = request.data.get('issue_id')
        milestone_id = request.data.get('milestone_id')

        if not issue_id or not milestone_id:
            return Response({"error": "issue_id and milestone_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.get(pk=issue_id)
        milestone = Milestone.objects.get(pk=milestone_id)
        milestone.issues.remove(issue)
        return Response(status=status.HTTP_204_NO_CONTENT)
