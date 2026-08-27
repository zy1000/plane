# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from typing import Optional, Union

# Django imports
from django.db.models import Q, QuerySet

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.db.models import Issue, ProjectMember, IssueRelation, IssueType, RequirementIssue
from plane.utils.issue_search import search_issues


class IssueSearchEndpoint(BaseAPIView):
    TYPE_CHILDREN_MAP = {
        Issue.IssueTypeEnum.EPIC: [Issue.IssueTypeEnum.FEATURE],
        Issue.IssueTypeEnum.FEATURE: [Issue.IssueTypeEnum.STORY],
        Issue.IssueTypeEnum.STORY: [Issue.IssueTypeEnum.BUG, Issue.IssueTypeEnum.TASK],
    }

    TYPE_CHILDREN_DEFAULT = [Issue.IssueTypeEnum.BUG, Issue.IssueTypeEnum.TASK]

    TYPE_PARENTS_MAP = {
        Issue.IssueTypeEnum.EPIC: [],
        Issue.IssueTypeEnum.FEATURE: [Issue.IssueTypeEnum.EPIC],
        Issue.IssueTypeEnum.STORY: [Issue.IssueTypeEnum.FEATURE],
    }

    TYPE_PARENTS_DEFAULT = [
        Issue.IssueTypeEnum.BUG,
        Issue.IssueTypeEnum.TASK,
        Issue.IssueTypeEnum.STORY,
    ]

    def filter_issues_by_project(self, project_id: int, issues: QuerySet) -> QuerySet:
        """
        Filter issues by project
        """

        issues = issues.filter(project_id=project_id)

        return issues

    def search_issues_by_query(self, query: str, issues: QuerySet) -> QuerySet:
        """
        Search issues by query
        """

        issues = search_issues(query, issues)

        return issues

    def search_issues_and_excluding_parent(self, issues: QuerySet, issue_id: str) -> QuerySet:
        """
        Search issues and epics by query excluding the parent
        """

        issue = Issue.issue_objects.filter(pk=issue_id).first()
        if issue:
            issues = issues.filter(~Q(pk=issue_id), ~Q(pk=issue.parent_id), ~Q(parent_id=issue_id))
        return issues

    def filter_issues_excluding_related_issues(self, issue_id: str, issues: QuerySet) -> QuerySet:
        """
        Filter issues excluding related issues
        """

        issue = Issue.issue_objects.filter(pk=issue_id).first()
        related_issue_ids = (
            IssueRelation.objects.filter(Q(related_issue=issue) | Q(issue=issue))
            .values_list("issue_id", "related_issue_id")
            .distinct()
        )

        related_issue_ids = [item for sublist in related_issue_ids for item in sublist]
        related_issue_ids.append(issue_id)

        if issue:
            issues = issues.exclude(pk__in=related_issue_ids)

        return issues

    def filter_root_issues_only(self, issue_id: str, issues: QuerySet) -> QuerySet:
        """
        Filter root issues only
        """
        issue = Issue.issue_objects.filter(pk=issue_id).first()
        if issue:
            issues = issues.filter(~Q(pk=issue_id), parent__isnull=True)
        if issue.parent:
            issues = issues.filter(~Q(pk=issue.parent_id))
        return issues

    def exclude_issues_in_cycles(self, issues: QuerySet) -> QuerySet:
        """
        Exclude issues in cycles
        """
        issues = issues.exclude(
            Q(issue_cycle__isnull=False) & Q(issue_cycle__deleted_at__isnull=True))

        return issues

    def exclude_issues_in_releases(self, issues: QuerySet) -> QuerySet:
        """
        Exclude issues already linked to releases
        """
        issues = issues.exclude(
            Q(issue_release__isnull=False) & Q(issue_release__deleted_at__isnull=True))

        return issues

    def exclude_issues_linked_to_requirement(self, issues: QuerySet, requirement_id: str) -> QuerySet:
        """
        排除已挂**这条**需求的工作项（需求 ↔ 工作项是多对多，挂过别的需求不算）。

        用 id__in 子查询而不是 exclude(Q(a__x) & Q(a__y))：后者会被编成两个独立的
        NOT EXISTS，条件不落在同一行关联行上，多对多 + 软删下会把「曾挂本需求已解除、
        现挂别的需求」的工作项错误排除。RequirementIssue.objects 是软删 manager，只看 live 行。
        """
        issues = issues.exclude(
            id__in=RequirementIssue.objects.filter(requirement_id=requirement_id)
            .order_by()
            .values_list("issue_id", flat=True)
        )

        return issues

    def exclude_issues_in_module(self, issues: QuerySet, module: str) -> QuerySet:
        """
        Exclude issues in a module
        """
        issues = issues.exclude(Q(issue_module__module=module) & Q(issue_module__deleted_at__isnull=True))
        return issues

    def filter_issues_without_target_date(self, issues: QuerySet) -> QuerySet:
        """
        Filter issues without a target date
        """
        issues = issues.filter(target_date__isnull=True)
        return issues

    def get_child_optional_types(self, type_name: str) -> list:
        return self.TYPE_CHILDREN_MAP.get(type_name, self.TYPE_CHILDREN_DEFAULT)

    def get_parent_optional_types(self, type_name: str) -> list:
        return self.TYPE_PARENTS_MAP.get(type_name, self.TYPE_PARENTS_DEFAULT)

    def filter_issues_by_id(self, issues: QuerySet, issue_id: str, type_filter: str) -> QuerySet:
        issue = Issue.issue_objects.filter(pk=issue_id).first()
        method = self.get_child_optional_types if type_filter == 'child' else self.get_parent_optional_types
        return issues.filter(type__name__in=method(type_name=issue.type.name))

    def filter_issues_by_type(
        self,
        issues: QuerySet,
        issue_type_id: str,
        project_id: str,
        type_filter: str = 'parent',
    ) -> QuerySet:
        issue_type = IssueType.objects.get(pk=issue_type_id, project_id=project_id)
        method = self.get_child_optional_types if type_filter == 'child' else self.get_parent_optional_types
        return issues.filter(type__name__in=method(type_name=issue_type.name))

    def parse_int_query_param(
        self,
        value: Union[str, int, None],
        default: int,
        *,
        minimum: Optional[int] = None,
        maximum: Optional[int] = None,
    ) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default

        if minimum is not None:
            parsed = max(minimum, parsed)
        if maximum is not None:
            parsed = min(maximum, parsed)

        return parsed

    def get(self, request, slug, project_id):
        query = request.query_params.get("search", False)
        workspace_search = request.query_params.get("workspace_search", "false")
        parent = request.query_params.get("parent", "false")
        issue_relation = request.query_params.get("issue_relation", "false")
        cycle = request.query_params.get("cycle", "false")
        release = request.query_params.get("release", "false")
        exclude_requirement_id = request.query_params.get("exclude_requirement_id")
        module = request.query_params.get("module", False)
        sub_issue = request.query_params.get("sub_issue", "false")
        target_date = request.query_params.get("target_date", True)
        issue_id = request.query_params.get("issue_id", False)
        type_name = request.query_params.get("type_name", False)
        type_filter = request.query_params.get("type_filter", False)
        issue_type_id = request.query_params.get("issue_type_id", False)
        my_work_items = request.query_params.get("my_work_items", "false")
        type_ids = request.query_params.get("type_ids", "")
        limit = self.parse_int_query_param(request.query_params.get("limit"), 100, minimum=1, maximum=1000)
        offset = self.parse_int_query_param(request.query_params.get("offset"), 0, minimum=0)

        issues = Issue.issue_objects.filter(
            workspace__slug=slug,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
        )

        if workspace_search == "false":
            issues = self.filter_issues_by_project(project_id, issues)

        if query:
            issues = self.search_issues_by_query(query, issues)

        if parent == "true" and issue_id:
            issues = self.search_issues_and_excluding_parent(issues, issue_id)
            issues = self.filter_issues_by_id(issues, issue_id, type_filter='parent')

        if issue_relation == "true" and issue_id:
            issues = self.filter_issues_excluding_related_issues(issue_id, issues)

        if sub_issue == "true" and issue_id:
            issues = self.filter_root_issues_only(issue_id, issues)
            issues = self.filter_issues_by_id(issues, issue_id, type_filter='child')

        if issue_type_id:
            issues = self.filter_issues_by_type(issues, issue_type_id, project_id)

        if type_ids:
            parsed_type_ids = [type_id.strip() for type_id in type_ids.split(",") if type_id.strip()]
            if parsed_type_ids:
                issues = issues.filter(type_id__in=parsed_type_ids)

        if my_work_items == "true":
            issues = issues.filter(Q(created_by=self.request.user) | Q(assignees=self.request.user)).distinct()

        if cycle == "true":
            issues = self.exclude_issues_in_cycles(issues)

        if release == "true":
            issues = self.exclude_issues_in_releases(issues)

        if exclude_requirement_id:
            issues = self.exclude_issues_linked_to_requirement(issues, exclude_requirement_id)

        if module:
            issues = self.exclude_issues_in_module(issues, module)

        if target_date == "none":
            issues = self.filter_issues_without_target_date(issues)

        if type_name and type_filter:
            issues = self.filter_issues_by_id(issues, type_name, type_filter)

        if ProjectMember.objects.filter(
                project_id=project_id, member=self.request.user, is_active=True, role=5
        ).exists():
            issues = issues.filter(created_by=self.request.user)

        issues = issues.order_by("-created_at")

        return Response(
            issues.values(
                "name",
                "id",
                "start_date",
                "sequence_id",
                "project__name",
                "project__identifier",
                "project_id",
                "workspace__slug",
                "state__name",
                "state__group",
                "state__color",
                'type_id'
            )[offset:offset + limit],
            status=status.HTTP_200_OK,
        )
