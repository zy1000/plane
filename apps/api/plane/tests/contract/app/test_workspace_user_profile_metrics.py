# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    CaseReview,
    CaseReviewRecord,
    CaseReviewThrough,
    Cycle,
    Issue,
    IssueAssignee,
    IssueSubscriber,
    Project,
    ProjectMember,
    Release,
    ReleaseStatus,
    State,
    TestCase as QATestCase,
    TestCaseRepository as QATestCaseRepository,
    User,
    Workspace,
    WorkspaceMember,
)


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceUserProfileMetrics:
    def setup_method(self):
        self.viewer = User.objects.create(email="metric-viewer@plane.so", display_name="Metric Viewer")
        self.target = User.objects.create(email="metric-target@plane.so", display_name="Metric Target")
        self.workspace = Workspace.objects.create(
            name="Metric Workspace",
            slug="metric-workspace",
            owner=self.viewer,
        )
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.viewer, role=5)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.target, role=15)
        self.project = Project.objects.create(
            name="Metric Project",
            identifier="MET",
            workspace=self.workspace,
        )
        ProjectMember.objects.create(project=self.project, member=self.viewer, role=5)
        ProjectMember.objects.create(project=self.project, member=self.target, role=15)
        self.repository = QATestCaseRepository.objects.create(
            name="Metric Repository",
            workspace=self.workspace,
            project=self.project,
        )
        self.review = CaseReview.objects.create(name="Metric Review", project=self.project)
        self.review.assignees.add(self.target)

    def _create_review_case(self, suffix):
        case = QATestCase.objects.create(
            code=f"MET-{suffix}",
            name=f"Metric case {suffix}",
            repository=self.repository,
        )
        through = CaseReviewThrough.objects.create(case=case, review=self.review)
        return case, through

    def _create_state(self, name, group):
        return State.objects.create(
            name=name,
            color="#60646C",
            group=group,
            project=self.project,
        )

    def _create_issue(self, name, state):
        issue = Issue.objects.create(
            name=name,
            project=self.project,
            workspace=self.workspace,
            state=state,
        )
        Issue.objects.filter(id=issue.id).update(created_by_id=self.target.id)
        IssueAssignee.objects.create(issue=issue, assignee=self.target, project=self.project)
        IssueSubscriber.objects.create(issue=issue, subscriber=self.target, project=self.project)
        return issue

    def test_scope_and_coverage_metrics_only_include_open_items(self, api_client):
        open_state = self._create_state("Metric Open", "started")
        completed_state = self._create_state("Metric Completed", "completed")
        cancelled_state = self._create_state("Metric Cancelled", "cancelled")

        self._create_issue("Open issue", open_state)
        self._create_issue("Completed issue", completed_state)
        self._create_issue("Cancelled issue", cancelled_state)

        Cycle.objects.create(
            name="Open cycle",
            project=self.project,
            workspace=self.workspace,
            owned_by=self.target,
            status=Cycle.Status.IN_PROGRESS,
        )
        Cycle.objects.create(
            name="Completed cycle",
            project=self.project,
            workspace=self.workspace,
            owned_by=self.target,
            status=Cycle.Status.COMPLETED,
        )
        Cycle.objects.create(
            name="Cancelled cycle",
            project=self.project,
            workspace=self.workspace,
            owned_by=self.target,
            status=Cycle.Status.CANCELLED,
        )
        Release.objects.create(
            name="Open release",
            project=self.project,
            workspace=self.workspace,
            lead=self.target,
            status=ReleaseStatus.IN_PROGRESS,
        )
        Release.objects.create(
            name="Completed release",
            project=self.project,
            workspace=self.workspace,
            lead=self.target,
            status=ReleaseStatus.COMPLETED,
        )
        Release.objects.create(
            name="Cancelled release",
            project=self.project,
            workspace=self.workspace,
            lead=self.target,
            status=ReleaseStatus.CANCELLED,
        )

        api_client.force_authenticate(user=self.viewer)
        base_url = f"/api/workspaces/{self.workspace.slug}/user-stats/{self.target.id}"
        metric_keys = [
            "responsible_cycles",
            "responsible_releases",
            "open_assigned_issues",
            "open_created_issues",
            "open_subscribed_issues",
        ]

        stats_response = api_client.get(f"{base_url}/")
        assert stats_response.status_code == status.HTTP_200_OK
        assert stats_response.data["assigned_issues"] == 3
        assert stats_response.data["created_issues"] == 3
        assert stats_response.data["subscribed_issues"] == 3
        for metric in metric_keys:
            assert stats_response.data[metric] == 1

            tree_response = api_client.get(f"{base_url}/metrics/{metric}/tree/")
            assert tree_response.status_code == status.HTTP_200_OK
            assert tree_response.data["count"] == 1

            items_response = api_client.get(f"{base_url}/metrics/{metric}/items/")
            assert items_response.status_code == status.HTTP_200_OK
            assert items_response.data["count"] == 1

    def test_pending_review_metric_count_tree_pagination_and_soft_delete(self, api_client):
        case_without_record, _ = self._create_review_case("1")

        _, suggestion_through = self._create_review_case("2")
        CaseReviewRecord.objects.create(
            crt=suggestion_through,
            assignee=self.target,
            result=CaseReviewRecord.Result.SUGGEST,
        )

        _, re_review_through = self._create_review_case("3")
        CaseReviewRecord.objects.create(
            crt=re_review_through,
            assignee=self.target,
            result=CaseReviewRecord.Result.PASS,
        )
        CaseReviewRecord.objects.create(
            crt=re_review_through,
            assignee=self.target,
            result=CaseReviewRecord.Result.RE_REVIEW,
        )

        _, completed_through = self._create_review_case("4")
        CaseReviewRecord.objects.create(
            crt=completed_through,
            assignee=self.target,
            result=CaseReviewRecord.Result.PASS,
        )

        api_client.force_authenticate(user=self.viewer)
        base_url = f"/api/workspaces/{self.workspace.slug}/user-stats/{self.target.id}"

        stats_response = api_client.get(f"{base_url}/")
        assert stats_response.status_code == status.HTTP_200_OK
        assert stats_response.data["pending_review_cases"] == 3

        tree_response = api_client.get(f"{base_url}/metrics/pending_review_cases/tree/")
        assert tree_response.status_code == status.HTTP_200_OK
        assert tree_response.data["count"] == 3
        assert tree_response.data["nodes"][0]["count"] == 3
        assert tree_response.data["nodes"][0]["children"][0]["count"] == 3

        first_page = api_client.get(
            f"{base_url}/metrics/pending_review_cases/items/",
            {"page": 1, "page_size": 2},
        )
        second_page = api_client.get(
            f"{base_url}/metrics/pending_review_cases/items/",
            {"page": 2, "page_size": 2},
        )
        assert first_page.status_code == status.HTTP_200_OK
        assert first_page.data["count"] == 3
        assert len(first_page.data["data"]) == 2
        assert len(second_page.data["data"]) == 1

        QATestCase.objects.filter(id=case_without_record.id).update(deleted_at=timezone.now())
        after_delete = api_client.get(f"{base_url}/metrics/pending_review_cases/items/")
        assert after_delete.data["count"] == 2

    def test_rejects_filters_not_supported_by_metric(self, api_client):
        api_client.force_authenticate(user=self.viewer)
        response = api_client.get(
            f"/api/workspaces/{self.workspace.slug}/user-stats/{self.target.id}/metrics/assigned_issues/items/",
            {"plan_id": self.review.id},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
