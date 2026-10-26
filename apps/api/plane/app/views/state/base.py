# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from itertools import groupby
from collections import defaultdict

# Django imports
from django.db.utils import IntegrityError

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.app.serializers import StateSerializer
from plane.app.permissions import ROLE, allow_permission, allow_fine_permission, PermissionKey
from plane.app.views.issue_scheme.scope import IssueSchemeScopeMixin
from plane.db.models import State
from plane.utils.cache import invalidate_cache
from plane.utils.issue_scheme import in_use_response_data, is_referenced, state_references
from plane.utils.scheme_views import prune_mode_view_references


class StateViewSet(IssueSchemeScopeMixin, BaseViewSet):
    """状态 CRUD。项目级与方案级（模板中心）路由共用，见 IssueSchemeScopeMixin。"""

    serializer_class = StateSerializer
    model = State

    def get_queryset(self):
        queryset = super().get_queryset().filter(workspace__slug=self.kwargs.get("slug"), is_triage=False)
        if self.is_scheme_route:
            queryset = queryset.filter(scheme_id=self.get_scheme_id())
        else:
            # 本项目所用方案里的状态。项目条件与成员条件必须写在同一个 filter() 里，
            # 才会共用同一条 projects join：分开写的话，共用方案时另一个项目的成员也能看到
            queryset = queryset.filter(
                scheme__projects=self.kwargs.get("project_id"),
                scheme__projects__project_projectmember__member=self.request.user,
                scheme__projects__project_projectmember__is_active=True,
                scheme__projects__archived_at__isnull=True,
            )
        return self.filter_queryset(queryset.select_related("scheme", "workspace").distinct())

    @allow_fine_permission(PermissionKey.STATE_VIEW, PermissionKey.PROJECT_SETTINGS_VIEW)
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_fine_permission(PermissionKey.STATE_CREATE)
    def create(self, request, slug, project_id=None, issue_scheme_id=None):
        try:
            serializer = StateSerializer(data=request.data, context=self.serializer_scope_context())
            if serializer.is_valid():
                serializer.save(scheme_id=self.get_scheme_id())
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "The state name is already taken"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    @allow_fine_permission(PermissionKey.STATE_EDIT)
    def partial_update(self, request, slug, pk, project_id=None, issue_scheme_id=None):
        try:
            state = State.objects.get(pk=pk, scheme_id=self.get_scheme_id(), workspace__slug=slug)
            serializer = StateSerializer(
                state, data=request.data, partial=True, context=self.serializer_scope_context()
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "The state name is already taken"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    @allow_fine_permission(PermissionKey.STATE_VIEW, PermissionKey.PROJECT_SETTINGS_VIEW)
    def list(self, request, slug, project_id=None, issue_scheme_id=None):
        issue_type_id = request.GET.get("issue_type_id", None)
        query = self.get_queryset().filter(issue_type_id=issue_type_id)

        states = StateSerializer(query, many=True).data

        grouped_states = defaultdict(list)
        for state in states:
            grouped_states[state["group"]].append(state)

        for group, group_states in grouped_states.items():
            count = len(group_states)

            for index, state in enumerate(group_states, start=1):
                state["order"] = index / count

        grouped = request.GET.get("grouped", False)

        if grouped == "true":
            state_dict = {}
            for key, value in groupby(
                    sorted(states, key=lambda state: state["group"]),
                    lambda state: state.get("group"),
            ):
                state_dict[str(key)] = list(value)
            return Response(state_dict, status=status.HTTP_200_OK)

        return Response(states, status=status.HTTP_200_OK)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_fine_permission(PermissionKey.STATE_MARK_DEFAULT)
    def mark_as_default(self, request, slug, pk, project_id=None, issue_scheme_id=None):
        # Select all the states which are marked as default
        issue_type_id = request.data['issue_type_id']
        scheme_id = self.get_scheme_id()
        _ = State.objects.filter(workspace__slug=slug, scheme_id=scheme_id, default=True,
                                 issue_type_id=issue_type_id).update(default=False)
        _ = State.objects.filter(workspace__slug=slug, scheme_id=scheme_id, pk=pk).update(default=True)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_fine_permission(PermissionKey.STATE_DELETE)
    def destroy(self, request, slug, pk, project_id=None, issue_scheme_id=None):
        state = State.objects.get(is_triage=False, pk=pk, scheme_id=self.get_scheme_id(), workspace__slug=slug)

        if state.default:
            return Response(
                {"error": "Default state cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 删除保护（需求 4.3）：状态归方案，任一项目（含已脱离的）的工作项、草稿（含归档、软删）
        # 或审批记录起止状态（CASCADE，删了审批历史一起没）在用就不能删，只能停用
        refs = state_references(state.id)
        if is_referenced(refs):
            return Response(in_use_response_data(refs, "状态"), status=status.HTTP_409_CONFLICT)

        # 硬删除后 Django 会把实例主键置空，id 要先取出来
        state_id, scheme_id = state.id, state.scheme_id
        state.delete(soft=False)
        prune_mode_view_references(
            scheme_id, [state_id], delete_views=request.query_params.get("delete_views") == "true"
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IntakeStateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        state = State.triage_objects.filter(workspace__slug=slug, scheme__projects=project_id).first()
        if not state:
            return Response(
                {"error": "Triage state not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(StateSerializer(state).data, status=status.HTTP_200_OK)
