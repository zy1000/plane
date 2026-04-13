# Python imports
import copy
import json

from django.db.models import F, Func, OuterRef, Q, Subquery

# Django Imports
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third party imports
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE, allow_fine_permission, PermissionKey
from plane.app.serializers import ReleaseIssueSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    FileAsset,
    IssueLink,
    ReleaseIssue,
    Project,
    CycleIssue,
)
from plane.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.issue_filters import issue_filters
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator, CustomPaginator
from plane.utils.filters import ComplexFilterBackend
from plane.utils.filters import IssueFilterSet
from .. import BaseViewSet
from plane.utils.host import base_host


class ReleaseIssueViewSet(BaseViewSet):
    serializer_class = ReleaseIssueSerializer
    model = ReleaseIssue
    webhook_event = "release_issue"
    bulk = True
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def apply_annotations(self, issues):
        return (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .prefetch_related("assignees", "labels", "issue_release__release")
        )

    def get_queryset(self):
        return (
            Issue.issue_objects.filter(
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                issue_release__release_id=self.kwargs.get("release_id"),
                issue_release__deleted_at__isnull=True,
            )
        ).distinct()

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id, release_id):
        filters = issue_filters(request.query_params, "GET")
        issue_queryset = self.get_queryset()

        issue_queryset = self.filter_queryset(issue_queryset)
        issue_queryset = issue_queryset.filter(**filters)

        total_issue_queryset = copy.deepcopy(issue_queryset)
        issue_queryset = self.apply_annotations(issue_queryset)

        order_by_param = request.GET.get("order_by", "created_at")
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        issue_queryset = issue_queryset_grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)

        if group_by:
            if sub_group_by:
                if group_by == sub_group_by:
                    return Response(
                        {"error": "Group by and sub group by cannot have same parameters"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return self.paginate(
                        request=request,
                        order_by=order_by_param,
                        queryset=issue_queryset,
                        total_count_queryset=total_issue_queryset,
                        on_results=lambda issues: issue_on_results(
                            group_by=group_by, issues=issues, sub_group_by=sub_group_by
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=total_issue_queryset,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=total_issue_queryset,
                        ),
                        group_by_field_name=group_by,
                        sub_group_by_field_name=sub_group_by,
                        count_filter=Q(
                            Q(issue_intake__status=1)
                            | Q(issue_intake__status=-1)
                            | Q(issue_intake__status=2)
                            | Q(issue_intake__isnull=True),
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
            else:
                return self.paginate(
                    request=request,
                    order_by=order_by_param,
                    queryset=issue_queryset,
                    total_count_queryset=total_issue_queryset,
                    on_results=lambda issues: issue_on_results(
                        group_by=group_by, issues=issues, sub_group_by=sub_group_by
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        project_id=project_id,
                        filters=filters,
                        queryset=total_issue_queryset,
                    ),
                    group_by_field_name=group_by,
                    count_filter=Q(
                        Q(issue_intake__status=1)
                        | Q(issue_intake__status=-1)
                        | Q(issue_intake__status=2)
                        | Q(issue_intake__isnull=True),
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
        else:
            return self.paginate(
                order_by=order_by_param,
                request=request,
                queryset=issue_queryset,
                total_count_queryset=total_issue_queryset,
                on_results=lambda issues: issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by),
            )

    @allow_fine_permission(PermissionKey.RELEASES_ISSUE_MANAGE)
    def create_release_issues(self, request, slug, project_id, release_id):
        issues = request.data.get("issues", [])
        if not issues:
            return Response({"error": "Issues are required"}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects.get(pk=project_id)
        _ = ReleaseIssue.objects.bulk_create(
            [
                ReleaseIssue(
                    issue_id=str(issue),
                    release_id=release_id,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for issue in issues
            ],
            batch_size=10,
            ignore_conflicts=True,
        )
        _ = [
            issue_activity.delay(
                type="release.activity.created",
                requested_data=json.dumps({"release_id": str(release_id)}),
                actor_id=str(request.user.id),
                issue_id=str(issue),
                project_id=project_id,
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            for issue in issues
        ]
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.RELEASES_ISSUE_MANAGE)
    def create_issue_releases(self, request, slug, project_id, issue_id):
        releases = request.data.get("releases", [])
        removed_releases = request.data.get("removed_releases", [])
        project = Project.objects.get(pk=project_id)

        if releases:
            _ = ReleaseIssue.objects.bulk_create(
                [
                    ReleaseIssue(
                        issue_id=issue_id,
                        release_id=release,
                        project_id=project_id,
                        workspace_id=project.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for release in releases
                ],
                batch_size=10,
                ignore_conflicts=True,
            )
            _ = [
                issue_activity.delay(
                    type="release.activity.created",
                    requested_data=json.dumps({"release_id": release}),
                    actor_id=str(request.user.id),
                    issue_id=issue_id,
                    project_id=project_id,
                    current_instance=None,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
                for release in releases
            ]

        for release_id in removed_releases:
            release_issue = ReleaseIssue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                release_id=release_id,
                issue_id=issue_id,
            )
            issue_activity.delay(
                type="release.activity.deleted",
                requested_data=json.dumps({"release_id": str(release_id)}),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=json.dumps(
                    {
                        "release_name": (
                            release_issue.first().release.name
                            if (release_issue.first() and release_issue.first().release)
                            else None
                        )
                    }
                ),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            release_issue.delete()

        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.RELEASES_ISSUE_MANAGE)
    def destroy(self, request, slug, project_id, release_id, issue_id):
        release_issue = ReleaseIssue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            release_id=release_id,
            issue_id=issue_id,
        )
        issue_activity.delay(
            type="release.activity.deleted",
            requested_data=json.dumps({"release_id": str(release_id)}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps({"release_name": release_issue.first().release.name}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        release_issue.delete()
        CycleIssue.objects.filter(issue_id=issue_id, workspace__slug=slug, project_id=project_id).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
