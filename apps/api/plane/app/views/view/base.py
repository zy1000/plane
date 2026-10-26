# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import copy

# Django imports
from django.db.models import (
    Exists,
    F,
    Func,
    OuterRef,
    Q,
    Subquery,
    Prefetch,
)
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page
from django.db import transaction

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import (
    allow_permission,
    allow_fine_permission,
    allow_workspace_member,
    has_workspace_permission,
    PermissionKey,
    ROLE,
)
from plane.app.serializers import IssueViewSerializer, ViewIssueListSerializer
from plane.db.models import (
    Issue,
    FileAsset,
    IssueLink,
    IssueView,
    Workspace,
    WorkspaceMember,
    ProjectMember,
    Project,
    CycleIssue,
    UserRecentVisit,
    IssueAssignee,
    IssueLabel,
    ModuleIssue,
)
from plane.utils.issue_filters import issue_filters
from plane.utils.order_queryset import order_issue_queryset
from plane.bgtasks.recent_visited_task import recent_visited_task
from .. import BaseViewSet
from plane.db.models import UserFavorite
from plane.utils.filters import ComplexFilterBackend
from plane.utils.filters import IssueFilterSet
from plane.utils.scheme_views import following_mode_scheme_id, project_local_filter_labels

#: 带了项目自有条件（迭代 / 模块 / 发布 / 标签）的视图不能存到研发模式
MODE_VIEW_PROJECT_LOCAL_FILTERS = "MODE_VIEW_PROJECT_LOCAL_FILTERS"
#: 研发模式视图从项目里只能改这几样，改名、排序、删除在模板中心
MODE_VIEW_PROJECT_EDITABLE_FIELDS = ("rich_filters", "filters", "display_filters", "display_properties")


def project_local_filters_response(labels):
    return Response(
        {
            "error": f"{'、'.join(labels)}是本项目自己的，去掉后才能存到研发模式",
            "code": MODE_VIEW_PROJECT_LOCAL_FILTERS,
            "labels": labels,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


class WorkspaceViewViewSet(BaseViewSet):
    serializer_class = IssueViewSerializer
    model = IssueView

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace_id=workspace.id, owned_by=self.request.user)

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project__isnull=True, issue_scheme__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .order_by(self.request.GET.get("order_by", "-created_at"))
            .distinct()
        )

    @allow_workspace_member
    def create(self, request, slug):
        return super().create(request, slug)

    @allow_workspace_member
    def list(self, request, slug):
        queryset = self.get_queryset()
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        views = IssueViewSerializer(queryset, many=True, fields=fields if fields else None).data
        return Response(views, status=status.HTTP_200_OK)

    @allow_workspace_member
    def partial_update(self, request, slug, pk):
        with transaction.atomic():
            workspace_view = IssueView.objects.select_for_update().get(
                pk=pk, workspace__slug=slug, project__isnull=True, issue_scheme__isnull=True
            )

            if workspace_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # Only update the view if owner is updating
            if workspace_view.owned_by_id != request.user.id:
                return Response(
                    {"error": "Only the owner of the view can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = IssueViewSerializer(workspace_view, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_workspace_member
    def retrieve(self, request, slug, pk):
        issue_view = self.get_queryset().filter(pk=pk).first()
        serializer = IssueViewSerializer(issue_view)
        recent_visited_task.delay(
            slug=slug,
            project_id=None,
            entity_name="view",
            entity_identifier=pk,
            user_id=request.user.id,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_workspace_member
    def destroy(self, request, slug, pk):
        workspace_view = IssueView.objects.get(
            pk=pk, workspace__slug=slug, project__isnull=True, issue_scheme__isnull=True
        )

        if workspace_view.owned_by == request.user:
            workspace_view.delete()
            # Delete the user favorite view
            UserFavorite.objects.filter(
                workspace__slug=slug,
                entity_identifier=pk,
                project__isnull=True,
                entity_type="view",
            ).delete()
        else:
            return Response(
                {"error": "Only the owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceViewIssuesViewSet(BaseViewSet):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def _get_project_permission_filters(self):
        """
        Get common project permission filters for guest users and role-based access control.
        Returns Q object for filtering issues based on user role and project settings.
        """
        return Q(
            Q(
                project__project_projectmember__role=5,
                project__guest_view_all_features=True,
            )
            | Q(
                project__project_projectmember__role=5,
                project__guest_view_all_features=False,
                created_by=self.request.user,
            )
            |
            # For other roles (role > 5), show all issues
            Q(project__project_projectmember__role__gt=5),
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
        )

    def apply_annotations(self, issues):
        return (
            issues.select_related("type", "state")
            .annotate(
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
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "label_issue",
                    queryset=IssueLabel.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_module",
                    queryset=ModuleIssue.objects.all(),
                )
            )
        )

    def get_queryset(self):
        return Issue.issue_objects.filter(workspace__slug=self.kwargs.get("slug"))

    @method_decorator(gzip_page)
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        issue_queryset = self.get_queryset()

        # Apply filtering from filterset
        issue_queryset = self.filter_queryset(issue_queryset)

        order_by_param = request.GET.get("order_by", "-created_at")

        # Apply legacy filters
        filters = issue_filters(request.query_params, "GET")
        issue_queryset = issue_queryset.filter(**filters)

        # Get common project permission filters
        permission_filters = self._get_project_permission_filters()
        # Apply project permission filters to the issue queryset
        issue_queryset = issue_queryset.filter(permission_filters)

        # Base query for the counts
        total_issue_count_queryset = copy.deepcopy(issue_queryset)
        total_issue_count_queryset = total_issue_count_queryset.only("id")

        # Apply annotations to the issue queryset
        issue_queryset = self.apply_annotations(issue_queryset)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # List Paginate
        return self.paginate(
            order_by=order_by_param,
            request=request,
            queryset=issue_queryset,
            on_results=lambda issues: ViewIssueListSerializer(issues, many=True).data,
            total_count_queryset=total_issue_count_queryset,
        )


class IssueViewViewSet(BaseViewSet):
    serializer_class = IssueViewSerializer
    model = IssueView

    def perform_create(self, serializer):
        serializer.save(project_id=self.kwargs.get("project_id"), owned_by=self.request.user)

    def _mode_scheme_id(self):
        """项目跟随研发模式时的模式方案 id，一次请求只查一次。"""
        if not hasattr(self, "_cached_mode_scheme_id"):
            self._cached_mode_scheme_id = following_mode_scheme_id(self.kwargs.get("project_id"))
        return self._cached_mode_scheme_id

    def _can_manage_dev_modes(self, slug):
        return has_workspace_permission(self.request.user, slug, PermissionKey.WORKSPACE_DEV_MODE_MANAGE)

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")
        is_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=self.request.user,
            is_active=True,
            project__archived_at__isnull=True,
        ).exists()
        if not is_member:
            return IssueView.objects.none()
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_identifier=OuterRef("pk"),
            entity_type="view",
            project_id=project_id,
            workspace__slug=slug,
        )
        # 本项目的视图 + 所跟随研发模式的视图（模式视图都是公共的）
        belongs = Q(project_id=project_id)
        mode_scheme_id = self._mode_scheme_id()
        if mode_scheme_id:
            belongs |= Q(issue_scheme_id=mode_scheme_id, project__isnull=True)
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=slug)
            .filter(belongs)
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .select_related("project")
            .select_related("workspace")
            .annotate(is_favorite=Exists(subquery))
            .order_by("-is_favorite", "name")
        )

    def _is_project_admin(self, slug, project_id):
        return ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=self.request.user,
            role=20,
            is_active=True,
        ).exists()

    @allow_fine_permission(PermissionKey.VIEW_VIEW)
    def list(self, request, slug, project_id):
        # 页内视图页签按页面范围取：不传 scope 时沿用原「视图」页签的工作项视图；all = 不限页面
        queryset = self.get_queryset()
        scope = request.GET.get("scope") or "issues"
        if scope != "all":
            queryset = queryset.filter(scope=scope)
        if request.GET.get("mode_only") == "true":
            queryset = queryset.filter(issue_scheme__isnull=False)
        project = Project.objects.get(id=project_id)
        if (
                ProjectMember.objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    member=request.user,
                    role=5,
                    is_active=True,
                ).exists()
                and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        views = IssueViewSerializer(queryset, many=True, fields=fields if fields else None).data
        return Response(views, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.VIEW_VIEW)
    def retrieve(self, request, slug, project_id, pk):
        issue_view = self.get_queryset().filter(pk=pk).first()
        if not issue_view:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
        project = Project.objects.get(id=project_id)
        """
        if the role is guest and guest_view_all_features is false and owned by is not 
        the requesting user then dont show the view
        """

        if (
                ProjectMember.objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    member=request.user,
                    role=5,
                    is_active=True,
                ).exists()
                and not project.guest_view_all_features
                and not issue_view.owned_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = IssueViewSerializer(issue_view)
        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="view",
            entity_identifier=pk,
            user_id=request.user.id,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        # 前端只用 PATCH；PUT 也走同一套鉴权与校验（研发模式视图要研发模式权限、字段白名单），
        # 不再落到框架默认的 update
        return self.partial_update(request, *args, **kwargs)

    @allow_fine_permission(PermissionKey.VIEW_EDIT)
    def partial_update(self, request, slug, project_id, pk):
        with transaction.atomic():
            issue_view = IssueView.objects.select_for_update().filter(pk=pk, workspace__slug=slug).first()
            if issue_view and issue_view.issue_scheme_id:
                return self._update_mode_view(request, slug, issue_view)
            if not issue_view or issue_view.project_id != project_id:
                return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)

            if issue_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # 个人视图只有创建人能改；公共视图创建人和项目管理员都能改
            is_owner = issue_view.owned_by_id == request.user.id
            if not is_owner and not (issue_view.access == 1 and self._is_project_admin(slug, project_id)):
                return Response(
                    {"error": "Only the owner or a project admin can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            data = {key: value for key, value in request.data.items() if key != "scope"}
            serializer = IssueViewSerializer(issue_view, data=data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.VIEW_DELETE)
    def destroy(self, request, slug, project_id, pk):
        project_view = IssueView.objects.filter(pk=pk, project_id=project_id, workspace__slug=slug).first()
        if not project_view:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
        if self._is_project_admin(slug, project_id) or project_view.owned_by_id == request.user.id:
            project_view.delete()
            # Delete the user favorite view
            UserFavorite.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_type="view",
            ).delete()
            # Delete the page from recent visit
            UserRecentVisit.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_name="view",
            ).delete(soft=False)
        else:
            return Response(
                {"error": "Only admin or owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update_mode_view(self, request, slug, issue_view):
        """在跟随项目里改研发模式视图的条件 / 布局 / 显示字段：要有研发模式的编辑权限，跟随该模式的项目一起变。"""
        if issue_view.issue_scheme_id != self._mode_scheme_id():
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_manage_dev_modes(slug):
            return Response(
                {"error": "只有研发模式的维护人能更新研发模式视图"},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = {key: value for key, value in request.data.items() if key in MODE_VIEW_PROJECT_EDITABLE_FIELDS}
        if "rich_filters" in data:
            labels = project_local_filter_labels(data["rich_filters"])
            if labels:
                return project_local_filters_response(labels)
        serializer = IssueViewSerializer(issue_view, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _create_mode_view(self, request, slug, project_id):
        """「谁能看到」选「研发模式全部项目」：视图挂到模式方案上，跟随该模式的项目都能看到。"""
        scheme_id = self._mode_scheme_id()
        if not scheme_id:
            return Response(
                {"error": "项目没有跟随研发模式，不能存到研发模式"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_manage_dev_modes(slug):
            return Response(
                {"error": "只有研发模式的维护人能存到研发模式"},
                status=status.HTTP_403_FORBIDDEN,
            )
        labels = project_local_filter_labels(request.data.get("rich_filters"))
        if labels:
            return project_local_filters_response(labels)
        serializer = IssueViewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        workspace_id = Project.objects.filter(pk=project_id).values_list("workspace_id", flat=True).first()
        view = serializer.save(
            workspace_id=workspace_id,
            project=None,
            issue_scheme_id=scheme_id,
            source_project_id=project_id,
            owned_by=request.user,
            access=1,
        )
        return Response(IssueViewSerializer(view).data, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.VIEW_CREATE)
    def create(self, request, slug, project_id, *args, **kwargs):
        if request.data.get("share_to_mode"):
            return self._create_mode_view(request, slug, project_id)
        return super().create(request, slug, project_id, *args, **kwargs)


class IssueViewFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(user=self.request.user)
            .select_related("view")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        _ = UserFavorite.objects.create(
            user=request.user,
            entity_identifier=request.data.get("view"),
            entity_type="view",
            project_id=project_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, view_id):
        view_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_type="view",
            entity_identifier=view_id,
        )
        view_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
