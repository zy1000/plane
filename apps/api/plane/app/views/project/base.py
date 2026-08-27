# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from datetime import date, timedelta

import pytz

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import (
    Count,
    Exists,
    F,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    Sum,
    Value, Model, Max,
)
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.decorators import action

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import (
    ROLE,
    ProjectMemberPermission,
    allow_permission,
    allow_fine_permission,
    PermissionKey,
)
from plane.app.permissions.base import _is_instance_admin
from plane.app.serializers import (
    DeployBoardSerializer,
    ProjectListSerializer,
    ProjectSerializer,
    IssueActivitySerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.webhook_task import model_activity, webhook_activity
from plane.db.models import (
    UserFavorite,
    DeployBoard,
    Intake,
    Project,
    Cycle,
    ProjectIdentifier,
    ProjectMember,
    ProjectMemberRole,
    ProjectGroupRole,
    ProjectNetwork,
    ProjectRole,
    ProjectUserProperty,
    Workspace,
    WorkspaceMember,
    IssueActivity,
    Issue,
    IssueType,
    Module,
    Release,
    ReleaseIssue,
    PlanCase,
    TestPlan,
    CaseReview,
    TestCaseRepository,
    TestCase,
    TimeSheet,
    User,
    IssueSequence,
    IssueAssignee,
)
from plane.db.models.intake import IntakeIssueStatus
from plane.db.models.issue_type import (
    ISSUE_TYPE_PERMISSION_ACTIONS,
    build_issue_type_permission_key,
)
from plane.utils.host import base_host
from plane.utils.paginator import CustomPaginator
from plane.utils.project.defaults import (
    bulk_create_issue_state,
    create_default_bug_workflow,
    temporary_create_issue_type,
    create_default_bug_extra_field, create_default_role,
)
from plane.utils.response import list_response


class ProjectViewSet(BaseViewSet):
    serializer_class = ProjectListSerializer
    model = Project
    webhook_event = "project"
    use_read_replica = True

    def get_queryset(self):
        sort_order = ProjectUserProperty.objects.filter(
            user=self.request.user,
            project_id=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        ).values("sort_order")
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related(
                "workspace",
                "workspace__owner",
                "default_assignee",
                "project_lead",
                "cover_image_asset",
                "business_unit",
                "status",
                "project_type",
                # product_manager_detail 要出头像 URL，一并把 avatar_asset 拉上，否则每行一条查询
                "product_manager__avatar_asset",
            )
            .annotate(
                is_favorite=Exists(
                    UserFavorite.objects.filter(
                        user=self.request.user,
                        entity_identifier=OuterRef("pk"),
                        entity_type="project",
                        project_id=OuterRef("pk"),
                    )
                )
            )
            .annotate(
                member_role=ProjectMember.objects.filter(
                    project_id=OuterRef("pk"),
                    member_id=self.request.user.id,
                    is_active=True,
                ).values("role")
            )
            .annotate(
                anchor=DeployBoard.objects.filter(
                    entity_name="project",
                    entity_identifier=OuterRef("pk"),
                    workspace__slug=self.kwargs.get("slug"),
                ).values("anchor")
            )
            .annotate(sort_order=Subquery(sort_order))
            .annotate(next_work_item_sequence=Coalesce(
                Subquery(
                    IssueSequence.objects.filter(project_id=OuterRef('pk'))
                    .values("project")
                    .annotate(max_seq=Max('sequence'))
                    .values('max_seq')[:1], output_field=IntegerField()
                ),
                Value(0, output_field=IntegerField()),
            ) + Value(1, output_field=IntegerField())
                      )
            .prefetch_related(
                Prefetch(
                    "project_projectmember",
                    queryset=ProjectMember.objects.filter(
                        workspace__slug=self.kwargs.get("slug"), is_active=True
                    ).select_related("member"),
                    to_attr="members_list",
                )
            )
            .distinct()
        )

    def _get_project_row_value(self, project_row, field):
        if isinstance(project_row, dict):
            value = project_row.get(field)
        elif field == "project_lead":
            value = getattr(project_row, "project_lead_id", None)
        elif field == "created_by":
            value = getattr(project_row, "created_by_id", None)
        else:
            value = getattr(project_row, field, None)
        return str(value) if value is not None else None

    def _get_permission_keys_by_project(self, slug, project_rows):
        if not project_rows:
            return {}

        project_ids = [
            self._get_project_row_value(row, "id")
            for row in project_rows
            if self._get_project_row_value(row, "id")
        ]
        permission_keys_by_project = {project_id: set() for project_id in project_ids}
        user_id = str(self.request.user.id)

        is_instance_admin = _is_instance_admin(self.request.user)
        if is_instance_admin:
            privileged_project_ids = set(project_ids)
        else:
            privileged_project_ids = {
                self._get_project_row_value(row, "id")
                for row in project_rows
                if self._get_project_row_value(row, "id")
                and (
                    self._get_project_row_value(row, "project_lead") == user_id
                    or self._get_project_row_value(row, "created_by") == user_id
                )
            }

        if privileged_project_ids:
            issue_type_permission_keys = {}
            issue_type_rows = IssueType.objects.filter(
                project_id__in=privileged_project_ids, deleted_at__isnull=True
            ).values_list("project_id", "id")

            for project_id, issue_type_id in issue_type_rows:
                issue_type_keys = issue_type_permission_keys.setdefault(
                    str(project_id), set()
                )
                for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS:
                    issue_type_keys.add(
                        build_issue_type_permission_key(issue_type_id, action)
                    )

            static_permission_keys = set(PermissionKey.values())
            for project_id in privileged_project_ids:
                permission_keys_by_project[project_id] = (
                        static_permission_keys
                        | issue_type_permission_keys.get(project_id, set())
                )

        member_scoped_project_ids = [
            project_id
            for project_id in project_ids
            if project_id not in privileged_project_ids
        ]
        if not member_scoped_project_ids:
            return permission_keys_by_project

        project_members = list(
            ProjectMember.objects.filter(
                member_id=user_id,
                workspace__slug=slug,
                project_id__in=member_scoped_project_ids,
                is_active=True,
            ).values("id", "project_id")
        )
        if not project_members:
            return permission_keys_by_project

        member_project_map = {
            member["id"]: str(member["project_id"]) for member in project_members
        }

        direct_role_rows = list(
            ProjectMemberRole.objects.filter(
                member_id__in=member_project_map.keys(),
                deleted_at__isnull=True,
                role__deleted_at__isnull=True,
            ).values_list("member_id", "role_id")
        )
        project_role_rows = [
            (member_project_map[member_id], role_id)
            for member_id, role_id in direct_role_rows
        ]
        project_role_rows.extend(
            (str(project_id), role_id)
            for project_id, role_id in ProjectGroupRole.objects.filter(
                project_id__in=member_scoped_project_ids,
                deleted_at__isnull=True,
                role__deleted_at__isnull=True,
                group__deleted_at__isnull=True,
                group__workspace__slug=slug,
                group__group_members__deleted_at__isnull=True,
                group__group_members__member__deleted_at__isnull=True,
                group__group_members__member__is_active=True,
                group__group_members__member__member_id=user_id,
            )
            .values_list("project_id", "role_id")
            .distinct()
        )
        if not project_role_rows:
            return permission_keys_by_project

        role_ids = {role_id for _, role_id in project_role_rows}
        role_permissions = {
            role["id"]: role["permissions"]
            for role in ProjectRole.objects.filter(
                pk__in=role_ids,
                deleted_at__isnull=True,
            ).values("id", "permissions")
        }

        project_permission_keys = {}
        for scoped_project_id, role_id in project_role_rows:
            permissions = role_permissions.get(role_id)
            if not isinstance(permissions, dict):
                continue

            valid_keys = [
                key
                for key in permissions.get("permission_keys", [])
                if isinstance(key, str)
            ]
            if not valid_keys:
                continue

            if scoped_project_id not in project_permission_keys:
                project_permission_keys[scoped_project_id] = set()
            project_permission_keys[scoped_project_id].update(valid_keys)

        for scoped_project_id in member_project_map.values():
            permission_keys_by_project[scoped_project_id] = project_permission_keys.get(
                scoped_project_id, set()
            )

        return permission_keys_by_project

    def _serialize_projects_with_permission_keys(self, slug, projects, fields=None):
        project_rows = list(projects)
        permission_keys_by_project = self._get_permission_keys_by_project(
            slug, project_rows
        )
        serialized_projects = [
            dict(project)
            for project in ProjectListSerializer(
                project_rows, many=True, fields=fields if fields else None
            ).data
        ]
        for index, row in enumerate(serialized_projects):
            project_id = self._get_project_row_value(project_rows[index], "id")
            row["permission_keys"] = list(
                permission_keys_by_project.get(project_id, set())
            )
        return serialized_projects

    def _get_project_list_stats(self, project_ids):
        stats_by_project = {
            project_id: {
                "bug_count": 0,
                "cycle_count": 0,
                "total_work_items": 0,
                "started_work_items": 0,
                "backlog_work_items": 0,
                "un_started_work_items": 0,
                "completed_work_items": 0,
                "cancelled_work_items": 0,
            }
            for project_id in project_ids
        }
        if not stats_by_project:
            return stats_by_project

        work_item_stats = (
            Issue.issue_objects.filter(project_id__in=project_ids)
            .values("project_id")
            .annotate(
                total_work_items=Count("id"),
                started_work_items=Count(
                    "id", filter=Q(state__group="started")
                ),
                backlog_work_items=Count(
                    "id", filter=Q(state__group="backlog")
                ),
                un_started_work_items=Count(
                    "id", filter=Q(state__group="unstarted")
                ),
                completed_work_items=Count(
                    "id", filter=Q(state__group="completed")
                ),
                cancelled_work_items=Count(
                    "id", filter=Q(state__group="cancelled")
                ),
            )
        )
        for row in work_item_stats:
            stats_by_project[row["project_id"]].update(
                {
                    "total_work_items": row["total_work_items"],
                    "started_work_items": row["started_work_items"],
                    "backlog_work_items": row["backlog_work_items"],
                    "un_started_work_items": row["un_started_work_items"],
                    "completed_work_items": row["completed_work_items"],
                    "cancelled_work_items": row["cancelled_work_items"],
                }
            )

        bug_counts = (
            Issue.objects.filter(
                project_id__in=project_ids, type__category__name="缺陷"
            )
            .values("project_id")
            .annotate(bug_count=Count("id"))
        )
        for row in bug_counts:
            stats_by_project[row["project_id"]]["bug_count"] = row["bug_count"]

        cycle_counts = (
            Cycle.objects.filter(
                project_id__in=project_ids, archived_at__isnull=True
            )
            .values("project_id")
            .annotate(cycle_count=Count("id"))
        )
        for row in cycle_counts:
            stats_by_project[row["project_id"]]["cycle_count"] = row[
                "cycle_count"
            ]

        return stats_by_project

    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_VIEW, level="WORKSPACE")
    def list_detail(self, request, slug):
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        projects = self.get_queryset().order_by("sort_order", "name")
        projects = projects.filter(
            Q(
                project_projectmember__member=self.request.user,
                project_projectmember__is_active=True,
            )
            | Q(network=ProjectNetwork.PUBLIC.value)
        ).distinct()

        if request.GET.get("per_page", False) and request.GET.get("cursor", False):
            return self.paginate(
                order_by=request.GET.get("order_by", "-created_at"),
                request=request,
                queryset=(projects),
                on_results=lambda projects: self._serialize_projects_with_permission_keys(
                    slug, projects
                ),
            )

        projects = self._serialize_projects_with_permission_keys(
            slug, projects, fields=fields
        )
        return Response(projects, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_VIEW, level="WORKSPACE")
    def list(self, request, slug):
        sort_order = ProjectUserProperty.objects.filter(
            user=self.request.user,
            project_id=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        ).values("sort_order")

        projects = (
            Project.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related(
                "workspace",
                "workspace__owner",
                "default_assignee",
                "project_lead",
                "cover_image_asset",
            )
            .annotate(
                member_role=ProjectMember.objects.filter(
                    project_id=OuterRef("pk"),
                    member_id=self.request.user.id,
                    is_active=True,
                ).values("role")
            )
            .annotate(
                intake_count=Count(
                    "project_intakeissue",
                    filter=Q(
                        project_intakeissue__status=IntakeIssueStatus.PENDING.value,
                        project_intakeissue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(inbox_view=F("intake_view"))
            .annotate(sort_order=Subquery(sort_order))
            .distinct()
        ).values(
            "id",
            "name",
            "identifier",
            "sort_order",
            "logo_props",
            "member_role",
            "intake_count",
            "archived_at",
            "workspace",
            "cycle_view",
            "issue_views_view",
            "module_view",
            "page_view",
            "inbox_view",
            "guest_view_all_features",
            "project_lead",
            "network",
            "code",
            "business_unit",
            "status",
            "project_type",
            "product_manager",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

        projects = projects.filter(
            Q(
                project_projectmember__member=self.request.user,
                project_projectmember__is_active=True,
            )
            | Q(network=ProjectNetwork.PUBLIC.value)
        ).distinct()
        project_rows = list(projects)
        stats_by_project = self._get_project_list_stats(
            [row["id"] for row in project_rows]
        )
        permission_keys_by_project = self._get_permission_keys_by_project(
            slug, project_rows
        )
        for row in project_rows:
            row.update(stats_by_project[row["id"]])
            row["permission_keys"] = list(
                permission_keys_by_project.get(str(row["id"]), set())
            )
        return Response(project_rows, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_VIEW, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        project = (
            self.get_queryset().filter(archived_at__isnull=True).filter(pk=pk).first()
        )

        if project is None:
            return Response(
                {"error": "Project does not exist"}, status=status.HTTP_404_NOT_FOUND
            )

        member_ids = [
            str(project_member.member_id) for project_member in project.members_list
        ]

        if str(request.user.id) not in member_ids:
            if project.network == ProjectNetwork.SECRET.value:
                return Response(
                    {"error": "You do not have permission"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            else:
                return Response(
                    {"error": "You are not a member of this project"},
                    status=status.HTTP_409_CONFLICT,
                )

        recent_visited_task.delay(
            slug=slug,
            project_id=pk,
            entity_name="project",
            entity_identifier=pk,
            user_id=request.user.id,
        )

        serializer = ProjectListSerializer(project)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_CREATE, level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        serializer = ProjectSerializer(
            data={**request.data}, context={"workspace_id": workspace.id}
        )
        if serializer.is_valid():
            serializer.save()
            issue_types = temporary_create_issue_type(project_id=serializer.data["id"])

            # Add the user as Administrator to the project
            _ = ProjectMember.objects.create(
                project_id=serializer.data["id"],
                member=request.user,
                role=ROLE.ADMIN.value,
            )

            if serializer.data["project_lead"] is not None and str(
                    serializer.data["project_lead"]
            ) != str(request.user.id):
                ProjectMember.objects.create(
                    project_id=serializer.data["id"],
                    member_id=serializer.data["project_lead"],
                    role=ROLE.ADMIN.value,
                )

            create_default_role(workspace=workspace,project_id=serializer.data["id"])

            bulk_create_issue_state(
                issue_types=issue_types,
                workspace=serializer.instance.workspace,
                project=serializer.instance,
                created_by=request.user,
            )
            create_default_bug_extra_field(issue_types=issue_types)

            create_default_bug_workflow(
                issue_types=issue_types,
                workspace=serializer.instance.workspace,
                project=serializer.instance,
                created_by=request.user,
            )

            project = self.get_queryset().filter(pk=serializer.data["id"]).first()

            # Create the model activity
            model_activity.delay(
                model_name="project",
                model_id=str(project.id),
                requested_data=request.data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )

            serializer = ProjectListSerializer(project)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def partial_update(self, request, slug, pk=None):
        # try:
        # is_workspace_admin = WorkspaceMember.objects.filter(
        #     member=request.user,
        #     workspace__slug=slug,
        #     is_active=True,
        #     role=ROLE.ADMIN.value,
        # ).exists()
        #
        # is_project_admin = ProjectMember.objects.filter(
        #     member=request.user,
        #     workspace__slug=slug,
        #     project_id=pk,
        #     role=ROLE.ADMIN.value,
        #     is_active=True,
        # ).exists()

        # Return error for if the user is neither workspace admin nor project admin
        # if not is_project_admin and not is_workspace_admin:
        #     return Response(
        #         {"error": "You don't have the required permissions."},
        #         status=status.HTTP_403_FORBIDDEN,
        #     )

        workspace = Workspace.objects.get(slug=slug)

        # select_related 四个扩展 FK：下面 ProjectSerializer(project).data 的快照要出 *_detail
        project = Project.objects.select_related(
            "business_unit", "status", "project_type", "product_manager__avatar_asset"
        ).get(pk=pk, workspace=workspace)
        intake_view = request.data.get("inbox_view", project.intake_view)
        current_instance = json.dumps(
            ProjectSerializer(project).data, cls=DjangoJSONEncoder
        )
        if project.archived_at:
            return Response(
                {"error": "Archived projects cannot be updated"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProjectSerializer(
            project,
            data={**request.data, "intake_view": intake_view},
            context={"workspace_id": workspace.id},
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()
            if intake_view:
                intake = Intake.objects.filter(project=project, is_default=True).first()
                if not intake:
                    Intake.objects.create(
                        name=f"{project.name} Intake",
                        project=project,
                        is_default=True,
                    )

            project = self.get_queryset().filter(pk=serializer.data["id"]).first()

            model_activity.delay(
                model_name="project",
                model_id=str(project.id),
                requested_data=request.data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            serializer = ProjectListSerializer(project)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.PROJECT_DELETE)
    def destroy(self, request, slug, pk):
        project = Project.objects.get(pk=pk, workspace__slug=slug)
        # 项目下的需求关联行随级联软删,但级联是异步的;这里同步软删四张关联行,
        # 让产品侧的需求数 / 关联项目立刻对得上。删除项目不改需求状态（只升不降）
        from plane.db.models import (
            RequirementCycle,
            RequirementIssue,
            RequirementProject,
            RequirementRelease,
            RequirementTestCase,
        )

        RequirementCycle.objects.filter(project_id=pk).delete()
        RequirementRelease.objects.filter(project_id=pk).delete()
        RequirementIssue.objects.filter(project_id=pk).delete()
        # 用例关联没有 project 列（用例的作用域来自 repository），按用例库的项目筛;
        # 共享用例库(repository.project 为空)的关联行不属于本项目,保留
        RequirementTestCase.objects.filter(case__repository__project_id=pk).delete()
        RequirementProject.objects.filter(project_id=pk).delete()
        project.delete()
        webhook_activity.delay(
            event="project",
            verb="deleted",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=project.id,
            old_identifier=None,
            new_identifier=None,
        )
        DeployBoard.objects.filter(project_id=pk, workspace__slug=slug).delete()
        UserFavorite.objects.filter(project_id=pk, workspace__slug=slug).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectArchiveUnarchiveEndpoint(BaseAPIView):

    @allow_fine_permission(PermissionKey.PROJECT_ARCHIVE)
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        project.archived_at = timezone.now()
        project.save()
        UserFavorite.objects.filter(workspace__slug=slug, project=project_id).delete()
        return Response(
            {"archived_at": str(project.archived_at)}, status=status.HTTP_200_OK
        )

    @allow_fine_permission(PermissionKey.PROJECT_UNARCHIVE)
    def delete(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        project.archived_at = None
        project.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectIdentifierEndpoint(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_CREATE, level="WORKSPACE")
    def get(self, request, slug):
        name = request.GET.get("name", "").strip().upper()

        if name == "":
            return Response(
                {"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        exists = ProjectIdentifier.objects.filter(
            name=name, workspace__slug=slug
        ).values("id", "name", "project")

        return Response(
            {"exists": len(exists), "identifiers": exists}, status=status.HTTP_200_OK
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_PROJECT_CREATE, level="WORKSPACE")
    def delete(self, request, slug):
        name = request.data.get("name", "").strip().upper()

        if name == "":
            return Response(
                {"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if Project.objects.filter(identifier=name, workspace__slug=slug).exists():
            return Response(
                {"error": "Cannot delete an identifier of an existing project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ProjectIdentifier.objects.filter(name=name, workspace__slug=slug).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectUserViewsEndpoint(BaseAPIView):
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        project_member = ProjectMember.objects.filter(
            member=request.user, project=project, is_active=True
        ).first()

        if project_member is None:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        view_props = project_member.view_props
        default_props = project_member.default_props
        preferences = project_member.preferences
        sort_order = project_member.sort_order

        project_member.view_props = request.data.get("view_props", view_props)
        project_member.default_props = request.data.get("default_props", default_props)
        project_member.preferences = request.data.get("preferences", preferences)
        project_member.sort_order = request.data.get("sort_order", sort_order)

        project_member.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectFavoritesViewSet(BaseViewSet):
    model = UserFavorite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(user=self.request.user)
            .select_related(
                "project", "project__project_lead", "project__default_assignee"
            )
            .select_related("workspace", "workspace__owner")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, slug):
        _ = UserFavorite.objects.create(
            user=request.user,
            entity_type="project",
            entity_identifier=request.data.get("project"),
            project_id=request.data.get("project"),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, project_id):
        project_favorite = UserFavorite.objects.get(
            entity_identifier=project_id,
            entity_type="project",
            project=project_id,
            user=request.user,
            workspace__slug=slug,
        )
        project_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeployBoardViewSet(BaseViewSet):
    permission_classes = [ProjectMemberPermission]
    serializer_class = DeployBoardSerializer
    model = DeployBoard

    def list(self, request, slug, project_id):
        project_deploy_board = DeployBoard.objects.filter(
            entity_name="project", entity_identifier=project_id, workspace__slug=slug
        ).first()

        serializer = DeployBoardSerializer(project_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_PUBLISH_CREATE)
    def create(self, request, slug, project_id):
        comments = request.data.get("is_comments_enabled", False)
        reactions = request.data.get("is_reactions_enabled", False)
        intake = request.data.get("intake", None)
        votes = request.data.get("is_votes_enabled", False)
        views = request.data.get(
            "views",
            {
                "list": True,
                "kanban": True,
                "calendar": True,
                "gantt": True,
                "spreadsheet": True,
            },
        )

        project_deploy_board, _ = DeployBoard.objects.get_or_create(
            entity_name="project", entity_identifier=project_id, project_id=project_id
        )
        project_deploy_board.intake = intake
        project_deploy_board.view_props = views
        project_deploy_board.is_votes_enabled = votes
        project_deploy_board.is_comments_enabled = comments
        project_deploy_board.is_reactions_enabled = reactions

        project_deploy_board.save()

        serializer = DeployBoardSerializer(project_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_PUBLISH_DELETE)
    def destroy(self, request, slug, project_id, pk):
        return super().destroy(request, slug, project_id)

    @allow_fine_permission(PermissionKey.PROJECT_PUBLISH_EDIT)
    def partial_update(self, request, slug, project_id, pk):
        return super().partial_update(request, slug, project_id)


class ProjectAPI(BaseViewSet):
    model = Project
    # ProjectListSerializer 现在带 4 个 *_detail，不 select_related 会 N+1
    queryset = Project.objects.select_related(
        "business_unit", "status", "project_type", "product_manager__avatar_asset"
    )
    pagination_class = CustomPaginator
    filterset_fields = {"name": ["exact", "icontains", "in"], "id": ["exact"]}
    serializer_class = ProjectListSerializer

    def _get_statistic_project_id(self, request):
        project_id = request.query_params.get("project_id")
        if not project_id:
            return None, Response(
                {"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        return project_id, None

    def _has_statistic_project_access(self, slug, project_id, user_id):
        return ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member_id=user_id,
            is_active=True,
        ).exists()

    def _parse_statistic_date_range(self, request):
        start_date_param = request.query_params.get("start_date")
        end_date_param = request.query_params.get("end_date")
        today = timezone.now().date()
        try:
            end_date = date.fromisoformat(end_date_param) if end_date_param else today
            start_date = (
                date.fromisoformat(start_date_param)
                if start_date_param
                else (end_date - timedelta(days=29))
            )
        except ValueError:
            return None, None, Response(
                {"error": "invalid start_date/end_date"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start_date > end_date:
            return None, None, Response(
                {"error": "start_date must be <= end_date"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return start_date, end_date, None

    def _parse_statistic_page_size(self, request):
        statistic_table_page_size = 6
        page_size_param = request.query_params.get("page_size")
        if page_size_param:
            try:
                custom_page_size = int(page_size_param)
                if 1 <= custom_page_size <= 1000:
                    statistic_table_page_size = custom_page_size
            except (ValueError, TypeError):
                pass
        return statistic_table_page_size

    def _parse_include_all_statuses(self, request):
        include_all_statuses_param = request.query_params.get("include_all_statuses")
        return str(include_all_statuses_param).lower() in {"1", "true", "yes", "y"}

    def _parse_positive_page(self, request, page_param_name):
        page_param = request.query_params.get(page_param_name)
        try:
            page = int(page_param) if page_param else 1
            if page < 1:
                raise ValueError
        except ValueError:
            return None, Response(
                {"error": f"invalid {page_param_name}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return page, None

    def _build_work_item_stats(self, base_issue_qs):
        work_item_type_rows = (
            base_issue_qs.values("type_id", "type__name", "type__logo_props", "state__group")
            .annotate(count=Count("id"))
            .order_by()
        )
        work_item_stats_map = {}
        for row in work_item_type_rows:
            type_id = row.get("type_id") or "none"
            name = row.get("type__name") or "未指定类型"
            logo_props = row.get("type__logo_props") or {}
            group = row.get("state__group") or "unstarted"

            if group == "completed":
                bucket = "completed"
            elif group == "started":
                bucket = "started"
            else:
                bucket = "unstarted"

            if type_id not in work_item_stats_map:
                work_item_stats_map[type_id] = {
                    "type_id": type_id,
                    "name": name,
                    "logo_props": logo_props,
                    "unstarted": 0,
                    "started": 0,
                    "completed": 0,
                    "cancelled": 0,
                    "total": 0,
                }

            count = row.get("count") or 0
            work_item_stats_map[type_id][bucket] += count
            work_item_stats_map[type_id]["total"] += count
            if group == "cancelled":
                work_item_stats_map[type_id]["cancelled"] += count

        return sorted(work_item_stats_map.values(), key=lambda x: x["total"], reverse=True)

    def _build_overview_work_item_payload(self, issue):
        return {
            "id": str(issue.id),
            "name": issue.name,
            "sequence_id": issue.sequence_id,
            "project_id": str(issue.project_id),
            "project_identifier": issue.project.identifier if issue.project else "",
            "state": (
                {
                    "id": str(issue.state_id),
                    "name": issue.state.name,
                    "group": issue.state.group,
                    "color": issue.state.color,
                }
                if issue.state_id and issue.state
                else None
            ),
            "priority": issue.priority,
            "target_date": issue.target_date.isoformat() if issue.target_date else None,
            "completed_at": issue.completed_at.isoformat() if issue.completed_at else None,
            "type": (
                {
                    "id": str(issue.type_id),
                    "name": issue.type.name,
                }
                if issue.type_id and issue.type
                else None
            ),
            "assignees": [
                {
                    "id": str(assignee.assignee.id),
                    "display_name": assignee.assignee.display_name
                    or assignee.assignee.email
                    or str(assignee.assignee.id),
                    "avatar_url": assignee.assignee.avatar_url or "",
                }
                for assignee in getattr(issue, "active_issue_assignees", [])
                if assignee.assignee
            ],
        }

    def _build_overview_statistic_payload(
        self,
        request,
        slug,
        project_id,
        base_issue_qs,
        statistic_table_page_size,
        include_all_statuses,
    ):
        work_item_stats = self._build_work_item_stats(base_issue_qs)

        cycles_queryset = (
            Cycle.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                archived_at__isnull=True,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("owned_by")
            .annotate(
                work_item_count=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                )
            )
        )
        if not include_all_statuses:
            cycles_queryset = cycles_queryset.filter(
                status__in=[
                    Cycle.Status.NOT_STARTED,
                    Cycle.Status.IN_PROGRESS,
                    Cycle.Status.TESTING,
                ]
            )
        cycles_queryset = cycles_queryset.order_by("start_date", "name")

        cycles_paginator = CustomPaginator()
        cycles_paginator.page_size = statistic_table_page_size
        cycles_paginator.max_page_size = statistic_table_page_size
        paginated_cycles = cycles_paginator.paginate_queryset(cycles_queryset, request)

        cycles_data = [
            {
                "id": str(cycle.id),
                "name": cycle.name,
                "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
                "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
                "status": cycle.status,
                "work_item_count": getattr(cycle, "work_item_count", 0) or 0,
                "owner": (
                    {
                        "id": str(cycle.owned_by.id),
                        "display_name": cycle.owned_by.display_name,
                    }
                    if cycle.owned_by
                    else None
                ),
            }
            for cycle in (paginated_cycles or [])
        ]

        release_page, error_response = self._parse_positive_page(request, "release_page")
        if error_response:
            return None, error_response

        release_page_size = statistic_table_page_size
        release_offset = (release_page - 1) * release_page_size
        release_limit = release_offset + release_page_size

        releases_queryset = (
            Release.objects.filter(
                project_id=project_id,
                deleted_at__isnull=True,
                archived_at__isnull=True,
            )
            .select_related("lead")
            .annotate(
                work_item_count=Count(
                    "issue_release__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_release__issue__archived_at__isnull=True,
                        issue_release__issue__is_draft=False,
                        issue_release__deleted_at__isnull=True,
                        issue_release__issue__deleted_at__isnull=True,
                    ),
                )
            )
        )
        if not include_all_statuses:
            releases_queryset = releases_queryset.exclude(
                status__in=["completed", "cancelled"]
            )
        releases_queryset = releases_queryset.order_by("start_date", "name")
        releases_data = [
            {
                "id": str(release.id),
                "name": release.name,
                "start_date": release.start_date.isoformat() if release.start_date else None,
                "end_date": (
                    release.target_date.isoformat() if release.target_date else None
                ),
                "status": release.status,
                "work_item_count": getattr(release, "work_item_count", 0) or 0,
                "owner": (
                    {
                        "id": str(release.lead.id),
                        "display_name": release.lead.display_name,
                    }
                    if release.lead
                    else None
                ),
            }
            for release in releases_queryset[release_offset:release_limit]
        ]

        plan_page, error_response = self._parse_positive_page(request, "plan_page")
        if error_response:
            return None, error_response

        plan_page_size = statistic_table_page_size
        plan_offset = (plan_page - 1) * plan_page_size
        plan_limit = plan_offset + plan_page_size

        test_plan_queryset = TestPlan.objects.filter(
            project_id=project_id,
            deleted_at__isnull=True,
        )
        if not include_all_statuses:
            test_plan_queryset = test_plan_queryset.filter(state=TestPlan.State.PROGRESS)
        test_plan_queryset = (
            test_plan_queryset.prefetch_related(
                Prefetch(
                    "plan_cases",
                    queryset=PlanCase.objects.filter(
                        deleted_at__isnull=True,
                        assignee__isnull=False,
                    ).select_related("assignee"),
                    to_attr="active_plan_cases_with_assignee",
                )
            )
            .annotate(case_count=Count("cases", distinct=True))
            .order_by("begin_time", "name")
        )

        test_plan_data = []
        for plan in test_plan_queryset[plan_offset:plan_limit]:
            first_assignee = None
            for plan_case in getattr(plan, "active_plan_cases_with_assignee", []):
                if plan_case.assignee:
                    first_assignee = plan_case.assignee
                    break
            test_plan_data.append(
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "start_date": plan.begin_time.isoformat() if plan.begin_time else None,
                    "end_date": plan.end_time.isoformat() if plan.end_time else None,
                    "status": plan.state,
                    "case_count": getattr(plan, "case_count", 0) or 0,
                    "owner": (
                        {
                            "id": str(first_assignee.id),
                            "display_name": first_assignee.display_name,
                        }
                        if first_assignee
                        else None
                    ),
                }
            )

        review_page, error_response = self._parse_positive_page(request, "review_page")
        if error_response:
            return None, error_response

        review_page_size = statistic_table_page_size
        review_offset = (review_page - 1) * review_page_size
        review_limit = review_offset + review_page_size

        case_review_queryset = CaseReview.objects.filter(
            project_id=project_id,
            deleted_at__isnull=True,
        )
        if not include_all_statuses:
            case_review_queryset = case_review_queryset.filter(
                state=CaseReview.State.PROGRESS
            )
        case_review_queryset = (
            case_review_queryset.prefetch_related("assignees")
            .annotate(case_count=Count("cases", distinct=True))
            .order_by("started_at", "name")
        )

        case_review_data = []
        for review in case_review_queryset[review_offset:review_limit]:
            first_assignee = review.assignees.first()
            case_review_data.append(
                {
                    "id": str(review.id),
                    "name": review.name,
                    "start_date": review.started_at.isoformat() if review.started_at else None,
                    "end_date": review.ended_at.isoformat() if review.ended_at else None,
                    "status": review.state,
                    "case_count": getattr(review, "case_count", 0) or 0,
                    "owner": (
                        {
                            "id": str(first_assignee.id),
                            "display_name": first_assignee.display_name,
                        }
                        if first_assignee
                        else None
                    ),
                }
            )

        return (
            {
                "work_item_stats": work_item_stats,
                "cycles": {
                    "count": cycles_queryset.count(),
                    "data": cycles_data,
                },
                "releases": {
                    "count": releases_queryset.count(),
                    "data": releases_data,
                },
                "test_plans": {
                    "count": test_plan_queryset.count(),
                    "data": test_plan_data,
                },
                "case_reviews": {
                    "count": case_review_queryset.count(),
                    "data": case_review_data,
                },
            },
            None,
        )

    @action(detail=False, methods=["get"], url_path="user-project")
    def get_user_project(self, request, slug):
        project_id = ProjectMember.objects.filter(
            workspace__slug=slug,
            member_id=request.user.id,
            is_active=True,
            member__member_workspace__workspace__slug=slug,
            member__member_workspace__is_active=True,
        ).values_list("project_id", flat=True)

        query = Project.objects.filter(pk__in=project_id).select_related(
            "business_unit", "status", "project_type", "product_manager__avatar_asset"
        )
        query = self.filter_queryset(query).order_by("-created_at")
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        serializer = self.serializer_class(instance=paginated_queryset, many=True)
        return list_response(data=serializer.data, count=query.count())

    @action(detail=False, methods=["get"], url_path="activity")
    def get_activity(self, request, slug):
        queryset = IssueActivity.objects.filter(
            project_id=request.query_params["project_id"]
        ).select_related("actor", "workspace", "issue", "project")

        return self.paginate(
            order_by=request.GET.get("order_by", "-created_at"),
            request=request,
            queryset=queryset,
            on_results=lambda issue_activities: IssueActivitySerializer(
                issue_activities, many=True
            ).data,
        )

    @action(detail=False, methods=["get"], url_path="statistic")
    @allow_fine_permission(PermissionKey.PROJECT_OVERVIEW_VIEW)
    def get_statistic(self, request, slug):
        project_id, error_response = self._get_statistic_project_id(request)
        if error_response:
            return error_response

        if not self._has_statistic_project_access(slug, project_id, request.user.id):
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        start_date, end_date, error_response = self._parse_statistic_date_range(request)
        if error_response:
            return error_response

        statistic_table_page_size = self._parse_statistic_page_size(request)
        include_all_statuses = self._parse_include_all_statuses(request)

        base_issue_qs = Issue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            archived_at__isnull=True,
            deleted_at__isnull=True,
            is_draft=False,
        ).select_related("type", "state")

        in_progress_requirements = (
            base_issue_qs.exclude(type__category__name="缺陷")
            .exclude(state__group="completed")
            .count()
        )
        total_requirements = base_issue_qs.exclude(type__category__name="缺陷").count()
        pending_defects = (
            base_issue_qs.filter(type__category__name="缺陷")
            .exclude(state__group="completed")
            .count()
        )

        requirement_qs = base_issue_qs.exclude(type__category__name="缺陷")
        defect_qs = base_issue_qs.filter(type__category__name="缺陷")
        total_defects = defect_qs.count()

        test_repository_ids = list(
            TestCaseRepository.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                deleted_at__isnull=True,
            ).values_list("id", flat=True)
        )
        total_cases = (
            TestCase.objects.filter(
                repository_id__in=test_repository_ids, deleted_at__isnull=True
            ).count()
            if test_repository_ids
            else 0
        )

        total_timesheet_hours = float(
            TimeSheet.objects.filter(project_id=project_id).aggregate(
                total=Sum("hours")
            )["total"]
            or 0
        )

        member_timesheet_rows = list(
            TimeSheet.objects.filter(project_id=project_id)
            .values("member_id")
            .annotate(hours=Sum("hours"))
            .order_by("-hours")
        )
        member_ids = [
            row["member_id"] for row in member_timesheet_rows if row.get("member_id")
        ]
        timesheet_users = {
            str(user.id): user
            for user in User.objects.filter(id__in=member_ids).only(
                "id",
                "display_name",
                "first_name",
                "last_name",
                "avatar",
                "avatar_asset_id",
            )
        }
        member_timesheet_hours = []
        for row in member_timesheet_rows:
            member_id = row.get("member_id")
            if not member_id:
                continue
            user = timesheet_users.get(str(member_id))
            if not user:
                continue
            display_name = (
                    user.display_name
                    or f"{user.first_name or ''} {user.last_name or ''}".strip()
                    or "-"
            )
            member_timesheet_hours.append(
                {
                    "member_id": str(user.id),
                    "display_name": display_name,
                    "avatar_url": user.avatar_url or "",
                    "hours": float(row.get("hours") or 0),
                }
            )

        req_created_before = requirement_qs.filter(
            created_at__date__lt=start_date
        ).count()
        req_completed_before = requirement_qs.filter(
            completed_at__isnull=False, completed_at__date__lt=start_date
        ).count()

        req_created_daily = {
            row["day"]: row["count"]
            for row in requirement_qs.filter(
                created_at__date__range=(start_date, end_date)
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
        }
        req_completed_daily = {
            row["day"]: row["count"]
            for row in requirement_qs.filter(
                completed_at__isnull=False,
                completed_at__date__range=(start_date, end_date),
            )
            .annotate(day=TruncDate("completed_at"))
            .values("day")
            .annotate(count=Count("id"))
        }

        requirement_daily_status = []
        cum_created = req_created_before
        cum_completed = req_completed_before
        d = start_date
        while d <= end_date:
            cum_created += req_created_daily.get(d, 0)
            cum_completed += req_completed_daily.get(d, 0)
            requirement_daily_status.append(
                {
                    "date": d.isoformat(),
                    "completed": cum_completed,
                    "incomplete": max(cum_created - cum_completed, 0),
                }
            )
            d += timedelta(days=1)

        defect_created_daily = {
            row["day"]: row["count"]
            for row in defect_qs.filter(created_at__date__range=(start_date, end_date))
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
        }

        defect_daily_created = []
        d = start_date
        while d <= end_date:
            defect_daily_created.append(
                {"date": d.isoformat(), "created": defect_created_daily.get(d, 0)}
            )
            d += timedelta(days=1)

        today = timezone.now().date()
        overdue_issue_qs = base_issue_qs.filter(
            target_date__isnull=False, target_date__lt=today
        ).exclude(state__group__in=["completed", "cancelled"])
        overdue_rows = list(
            overdue_issue_qs.filter(assignees__isnull=False)
            .values("assignees__id")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count")
        )
        overdue_user_ids = [
            row["assignees__id"] for row in overdue_rows if row.get("assignees__id")
        ]
        overdue_users = {
            str(user.id): user
            for user in User.objects.filter(id__in=overdue_user_ids).only(
                "id",
                "display_name",
                "first_name",
                "last_name",
                "avatar",
                "avatar_asset_id",
            )
        }
        overdue_by_assignee = []
        for row in overdue_rows:
            assignee_id = row.get("assignees__id")
            if not assignee_id:
                continue
            user = overdue_users.get(str(assignee_id))
            if not user:
                continue
            display_name = (
                    user.display_name
                    or f"{user.first_name or ''} {user.last_name or ''}".strip()
                    or "-"
            )
            overdue_by_assignee.append(
                {
                    "assignee_id": str(user.id),
                    "display_name": display_name,
                    "avatar_url": user.avatar_url or "",
                    "count": row.get("count") or 0,
                }
            )
        overdue_unassigned_count = overdue_issue_qs.filter(
            assignees__isnull=True
        ).count()
        if overdue_unassigned_count > 0:
            overdue_by_assignee.append(
                {
                    "assignee_id": None,
                    "display_name": "未指定负责人",
                    "avatar_url": "",
                    "count": overdue_unassigned_count,
                }
            )
        overdue_total = sum(item["count"] for item in overdue_by_assignee)

        project = Project.objects.filter(workspace__slug=slug, id=project_id).first()
        project_timezone = project.timezone if project and project.timezone else "UTC"
        local_tz = pytz.timezone(project_timezone)
        current_time_in_project_tz = timezone.now().astimezone(local_tz)
        current_time_in_utc = current_time_in_project_tz.astimezone(pytz.utc)

        overview_statistic_payload, error_response = self._build_overview_statistic_payload(
            request=request,
            slug=slug,
            project_id=project_id,
            base_issue_qs=base_issue_qs,
            statistic_table_page_size=statistic_table_page_size,
            include_all_statuses=include_all_statuses,
        )
        if error_response:
            return error_response

        return Response(
            {
                "counts": {
                    "in_progress_requirements": in_progress_requirements,
                    "total_requirements": total_requirements,
                    "pending_defects": pending_defects,
                    "total_defects": total_defects,
                    "total_cases": total_cases,
                    "total_timesheet_hours": total_timesheet_hours,
                },
                "cycles": overview_statistic_payload["cycles"],
                "releases": overview_statistic_payload["releases"],
                "test_plans": overview_statistic_payload["test_plans"],
                "case_reviews": overview_statistic_payload["case_reviews"],
                "requirement_daily_status": requirement_daily_status,
                "defect_daily_created": defect_daily_created,
                "work_item_stats": overview_statistic_payload["work_item_stats"],
                "overdue_by_assignee": {
                    "total": overdue_total,
                    "data": overdue_by_assignee,
                },
                "member_timesheet_hours": member_timesheet_hours,
                "range": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="overview-statistic")
    @allow_fine_permission(PermissionKey.PROJECT_OVERVIEW_VIEW)
    def get_overview_statistic(self, request, slug):
        project_id, error_response = self._get_statistic_project_id(request)
        if error_response:
            return error_response

        if not self._has_statistic_project_access(slug, project_id, request.user.id):
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        statistic_table_page_size = self._parse_statistic_page_size(request)
        include_all_statuses = self._parse_include_all_statuses(request)
        base_issue_qs = Issue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            archived_at__isnull=True,
            deleted_at__isnull=True,
            is_draft=False,
        ).select_related("type", "state")
        overview_statistic_payload, error_response = self._build_overview_statistic_payload(
            request=request,
            slug=slug,
            project_id=project_id,
            base_issue_qs=base_issue_qs,
            statistic_table_page_size=statistic_table_page_size,
            include_all_statuses=include_all_statuses,
        )
        if error_response:
            return error_response

        return Response(overview_statistic_payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="overview-work-items")
    @allow_fine_permission(PermissionKey.PROJECT_OVERVIEW_VIEW)
    def get_overview_work_items(self, request, slug):
        project_id, error_response = self._get_statistic_project_id(request)
        if error_response:
            return error_response

        if not self._has_statistic_project_access(slug, project_id, request.user.id):
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        metric = request.query_params.get("metric")
        if metric not in {"completed", "in_progress", "overdue", "due_soon"}:
            return Response(
                {"error": "invalid metric"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page, error_response = self._parse_positive_page(request, "page")
        if error_response:
            return error_response

        page_size = self._parse_statistic_page_size(request)
        today = timezone.now().date()
        open_state_filter = ~Q(state__group__in=["completed", "cancelled"])

        queryset = (
            Issue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                archived_at__isnull=True,
                deleted_at__isnull=True,
                is_draft=False,
            )
            .select_related("project", "state", "type")
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("assignee"),
                    to_attr="active_issue_assignees",
                )
            )
        )

        if metric == "completed":
            queryset = queryset.filter(state__group="completed").order_by(
                F("completed_at").desc(nulls_last=True),
                "-updated_at",
            )
        elif metric == "in_progress":
            queryset = queryset.filter(open_state_filter).order_by(
                F("target_date").asc(nulls_last=True),
                "-updated_at",
            )
        elif metric == "overdue":
            queryset = queryset.filter(
                open_state_filter,
                target_date__isnull=False,
                target_date__lt=today,
            ).order_by("target_date", "-updated_at")
        else:
            queryset = queryset.filter(
                open_state_filter,
                target_date__isnull=False,
                target_date__gte=today,
                target_date__lte=today + timedelta(days=7),
            ).order_by("target_date", "-updated_at")

        total_count = queryset.count()
        offset = (page - 1) * page_size
        items = queryset[offset: offset + page_size]

        return Response(
            {
                "count": total_count,
                "data": [
                    self._build_overview_work_item_payload(issue) for issue in items
                ],
            },
            status=status.HTTP_200_OK,
        )
