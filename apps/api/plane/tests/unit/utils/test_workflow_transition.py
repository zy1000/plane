import pytest

from plane.db.models import (
    ApprovalType,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueTransitionApprovalRecord,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    Workflow,
    WorkflowApproverTarget,
    WorkflowTransition,
    Workspace,
    WorkspaceMember,
)
from plane.utils.workflow.transition import approve_transition_record, check_update_state_permission


@pytest.mark.unit
class TestWorkflowTransitionDynamicApprovers:
    @pytest.fixture
    def workflow_context(self, create_user):
        creator = create_user
        assignee = type(create_user).objects.create(
            email="assignee@example.com",
            username="assignee",
            first_name="Issue",
            last_name="Assignee",
        )
        initiator = type(create_user).objects.create(
            email="initiator@example.com",
            username="initiator",
            first_name="Flow",
            last_name="Initiator",
        )

        workspace = Workspace.objects.create(
            name="Workflow Workspace",
            slug="workflow-workspace",
            owner=creator,
        )
        project = Project.objects.create(
            name="Workflow Project",
            identifier="WFP",
            workspace=workspace,
            created_by=creator,
        )

        for member in (creator, assignee, initiator):
            WorkspaceMember.objects.create(workspace=workspace, member=member, role=20)
            ProjectMember.objects.create(project=project, member=member, role=20)

        issue_type = IssueType.objects.create(
            workspace=workspace,
            name="任务",
        )
        ProjectIssueType.objects.create(
            project=project,
            issue_type=issue_type,
        )

        from_state = State.objects.create(
            name="待处理",
            color="#60646C",
            group="backlog",
            default=True,
            project=project,
            issue_type=issue_type,
        )
        to_state = State.objects.create(
            name="已完成",
            color="#46A758",
            group="completed",
            project=project,
            issue_type=issue_type,
        )

        workflow = Workflow.objects.create(
            project=project,
            issue_type=issue_type,
            name="任务审批流",
            is_active=True,
        )

        issue = Issue.objects.create(
            name="需要审批的工作项",
            workspace=workspace,
            project=project,
            state=from_state,
            type=issue_type,
            created_by=creator,
        )

        return {
            "creator": creator,
            "assignee": assignee,
            "initiator": initiator,
            "workspace": workspace,
            "project": project,
            "issue_type": issue_type,
            "from_state": from_state,
            "to_state": to_state,
            "workflow": workflow,
            "issue": issue,
        }

    @pytest.mark.django_db
    def test_creates_approval_records_for_creator_and_assignee(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        assignee = workflow_context["assignee"]
        creator = workflow_context["creator"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=2,
            dynamic_approver_types=[
                WorkflowApproverTarget.ASSIGNEES,
                WorkflowApproverTarget.CREATED_BY,
            ],
        )
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project)

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert "已创建审批流程" in error
        assert record is not None
        assert set(
            IssueTransitionApprovalRecord.objects.filter(transition_record=record).values_list(
                "approver_id", flat=True
            )
        ) == {creator.id, assignee.id}

    @pytest.mark.django_db
    def test_rejects_when_runtime_approvers_are_less_than_required_count(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        assignee = workflow_context["assignee"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=2,
            dynamic_approver_types=[WorkflowApproverTarget.ASSIGNEES],
        )
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project)

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert error == "当前工作项可用审批人数不足，无法发起审批"
        assert record is None

    @pytest.mark.django_db
    def test_rejected_summary_activity_uses_rejecting_approver_as_actor(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ANY,
            required_count=1,
            dynamic_approver_types=[WorkflowApproverTarget.CREATED_BY],
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert record is not None

        success, action_error, record = approve_transition_record(
            record_id=record.id,
            approver=creator,
            action="rejected",
        )

        assert success is True
        assert action_error is None

        rejected_activity = IssueActivity.objects.filter(
            issue=issue,
            field="workflow_approval_request",
            new_value="rejected",
        ).latest("created_at")

        assert rejected_activity.actor_id == creator.id

    @pytest.mark.django_db
    def test_approved_state_activity_uses_final_approver_as_actor(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=2,
            dynamic_approver_types=[
                WorkflowApproverTarget.CREATED_BY,
                WorkflowApproverTarget.ASSIGNEES,
            ],
        )
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project)

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert record is not None

        first_success, first_error, _ = approve_transition_record(
            record_id=record.id,
            approver=creator,
            action="approved",
        )
        assert first_success is True
        assert first_error is None

        second_success, second_error, record = approve_transition_record(
            record_id=record.id,
            approver=assignee,
            action="approved",
        )

        assert second_success is True
        assert second_error is None
        issue.refresh_from_db()
        assert issue.state_id == to_state.id

        state_activity = IssueActivity.objects.filter(
            issue=issue,
            field="state",
            new_identifier=to_state.id,
        ).latest("created_at")

        assert state_activity.actor_id == assignee.id
