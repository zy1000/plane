import pytest

from plane.app.serializers.workflow import IssueTransitionRecordListSerializer
from plane.db.models import (
    ApprovalType,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueTransitionApprovalRecord,
    IssueType,
    Project,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    State,
    TransitionRecordStatus,
    TypeExtraField,
    TypeExtraFieldValue,
    Workflow,
    WorkflowApproverTarget,
    WorkflowPrincipalDimension,
    WorkflowPrincipalKind,
    WorkflowTransition,
    WorkflowTransitionPrincipal,
    WorkflowTransitionRequiredField,
    Workspace,
    WorkspaceMember,
)
from plane.utils.workflow.transition import (
    approve_transition_record,
    check_state_assignee_constraint,
    check_update_state_permission,
)


def _add_dynamic_approvers(transition, dynamic_targets):
    """为流转边写入审批人维度的动态对象行（替代旧的 dynamic_approver_types 字段）。"""
    for dynamic_target in dynamic_targets:
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.APPROVER,
            kind=WorkflowPrincipalKind.DYNAMIC,
            dynamic_target=dynamic_target,
        )


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

        project_members = {}
        for member in (creator, assignee, initiator):
            WorkspaceMember.objects.create(workspace=workspace, member=member, role=20)
            project_members[member.id] = ProjectMember.objects.create(
                project=project, member=member, role=20
            )

        issue_type = IssueType.objects.create(
            project=project,
            name="任务",
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
            "project_members": project_members,
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
        )
        _add_dynamic_approvers(
            transition,
            [
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
    def test_creates_approval_record_with_reason(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
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
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            approval_reason="  需要进入完成态给验收方确认  ",
        )

        assert allowed is False
        assert "已创建审批流程" in error
        assert record.approval_reason == "需要进入完成态给验收方确认"
        assert (
            IssueTransitionRecordListSerializer(record).data["approval_reason"]
            == "需要进入完成态给验收方确认"
        )
        assert IssueTransitionApprovalRecord.objects.filter(
            transition_record=record,
            approver=creator,
        ).exists()

    @pytest.mark.django_db
    def test_reused_approval_record_updates_reason_and_resets_votes(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
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
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])

        allowed, _, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            approval_reason="第一次原因",
        )
        assert allowed is False

        approval_record = IssueTransitionApprovalRecord.objects.get(
            transition_record=record,
            approver=creator,
        )
        approval_record.action = "approved"
        approval_record.comment = "同意"
        approval_record.save(update_fields=["action", "comment", "updated_at"])

        allowed, _, reused_record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            approval_reason="第二次原因",
        )

        assert allowed is False
        assert reused_record.id == record.id
        reused_record.refresh_from_db()
        approval_record.refresh_from_db()
        assert reused_record.approval_reason == "第二次原因"
        assert approval_record.action is None
        assert approval_record.comment == ""

    @pytest.mark.django_db
    def test_rejects_when_runtime_approvers_are_less_than_required_count(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        assignee = workflow_context["assignee"]
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
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.ASSIGNEES])
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

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])

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

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=2,
        )
        _add_dynamic_approvers(
            transition,
            [
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

    @pytest.mark.django_db
    def test_type_required_field_blocks_state_change_until_filled(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        initiator = workflow_context["initiator"]
        issue_type = workflow_context["issue_type"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        field = TypeExtraField.objects.create(
            project=project,
            issue_type=issue_type,
            name="验收说明",
            is_required=True,
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert "工作项类型必填字段缺失" in error
        assert "验收说明" in error
        assert record is None

        TypeExtraFieldValue.objects.create(
            issue=issue,
            extra_field=field,
            project=project,
            value="已填写",
        )
        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is True
        assert error is None
        assert record is None

    @pytest.mark.django_db
    def test_transition_required_field_still_blocks_state_change(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        initiator = workflow_context["initiator"]
        issue_type = workflow_context["issue_type"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        field = TypeExtraField.objects.create(
            project=project,
            issue_type=issue_type,
            name="发布备注",
            is_required=False,
        )
        WorkflowTransitionRequiredField.objects.create(
            workflow=transition,
            extra_field=field,
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert error == "按照工作流规则[发布备注]是必填项"
        assert record is None

        TypeExtraFieldValue.objects.create(
            issue=issue,
            extra_field=field,
            project=project,
            value="已填写",
        )
        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is True
        assert error is None
        assert record is None

    @pytest.mark.django_db
    def test_approval_cancels_when_type_required_field_is_cleared_before_final_apply(
        self, workflow_context
    ):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        initiator = workflow_context["initiator"]
        issue_type = workflow_context["issue_type"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])
        field = TypeExtraField.objects.create(
            project=project,
            issue_type=issue_type,
            name="验收说明",
            is_required=True,
        )
        value = TypeExtraFieldValue.objects.create(
            issue=issue,
            extra_field=field,
            project=project,
            value="已填写",
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )

        assert allowed is False
        assert "已创建审批流程" in error
        assert record is not None

        value.value = None
        value.save(update_fields=["value", "updated_at"])

        success, action_error, record = approve_transition_record(
            record_id=record.id,
            approver=creator,
            action="approved",
        )

        assert success is True
        assert action_error is None
        issue.refresh_from_db()
        record.refresh_from_db()
        assert record.status == TransitionRecordStatus.CANCELLED
        assert issue.state_id == from_state.id

    @pytest.mark.django_db
    def test_role_principal_creates_any_approval_record(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]
        initiator_member = workflow_context["project_members"][initiator.id]

        role = ProjectRole.objects.create(
            project=project,
            name="审批角色",
            permissions={},
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=initiator_member,
            role=role,
        )
        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ANY,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.APPROVER,
            kind=WorkflowPrincipalKind.ROLE,
            role=role,
        )

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
            IssueTransitionApprovalRecord.objects.filter(
                transition_record=record
            ).values_list("approver_id", flat=True)
        ) == {initiator.id}

    @pytest.mark.django_db
    def test_initiator_dimension_blocks_non_matching_user(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
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
            approval_type=ApprovalType.ALL,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.INITIATOR,
            kind=WorkflowPrincipalKind.MEMBER,
            member=creator,
        )

        allowed, error, _ = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )
        assert allowed is False
        assert "发起人" in error

        allowed, error, _ = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=creator,
            project_id=project.id,
        )
        assert allowed is True
        assert error is None

    @pytest.mark.django_db
    def test_assignee_dimension_validates_target_assignees(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=assignee,
        )

        allowed, error, _ = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[assignee.id],
        )
        assert allowed is True
        assert error is None

        allowed, error, _ = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[creator.id],
        )
        assert allowed is False
        assert "负责人" in error

    @pytest.mark.django_db
    def test_approval_record_stores_and_applies_target_assignees(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        IssueAssignee.objects.create(issue=issue, assignee=creator, project=project)
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project)
        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=assignee,
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[assignee.id],
        )

        assert allowed is False
        assert "已创建审批流程" in error
        assert record is not None
        assert record.target_assignee_ids == [str(assignee.id)]

        success, action_error, _ = approve_transition_record(
            record_id=record.id,
            approver=creator,
            action="approved",
        )
        assert success is True
        assert action_error is None

        issue.refresh_from_db()
        record.refresh_from_db()
        assignee_ids = set(
            IssueAssignee.objects.filter(issue=issue, deleted_at__isnull=True).values_list(
                "assignee_id", flat=True
            )
        )
        assert record.status == TransitionRecordStatus.APPROVED
        assert issue.state_id == to_state.id
        assert assignee_ids == {assignee.id}

    @pytest.mark.django_db
    def test_reused_pending_record_updates_target_assignees_and_resets_votes(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
        initiator = workflow_context["initiator"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        IssueAssignee.objects.create(issue=issue, assignee=creator, project=project)
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project)
        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.N_OF_M,
            required_count=2,
        )
        _add_dynamic_approvers(
            transition,
            [
                WorkflowApproverTarget.CREATED_BY,
                WorkflowApproverTarget.ASSIGNEES,
            ],
        )
        for member in (creator, assignee):
            WorkflowTransitionPrincipal.objects.create(
                transition=transition,
                dimension=WorkflowPrincipalDimension.ASSIGNEE,
                kind=WorkflowPrincipalKind.MEMBER,
                member=member,
            )

        allowed, _, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[creator.id],
        )
        assert allowed is False
        assert record.target_assignee_ids == [str(creator.id)]

        approval_record = IssueTransitionApprovalRecord.objects.get(
            transition_record=record,
            approver=creator,
        )
        approval_record.action = "approved"
        approval_record.save(update_fields=["action", "updated_at"])

        allowed, _, reused_record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[assignee.id],
        )
        assert allowed is False
        assert reused_record.id == record.id
        reused_record.refresh_from_db()
        approval_record.refresh_from_db()
        assert reused_record.target_assignee_ids == [str(assignee.id)]
        assert approval_record.action is None

    @pytest.mark.django_db
    def test_approval_cancels_when_assignee_rule_changes_before_final_apply(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
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
            required_count=1,
        )
        _add_dynamic_approvers(transition, [WorkflowApproverTarget.CREATED_BY])
        principal = WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=assignee,
        )

        allowed, _, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
            target_assignee_ids=[assignee.id],
        )
        assert allowed is False
        assert record is not None

        WorkflowTransitionPrincipal.objects.filter(id=principal.id).delete()
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=creator,
        )

        success, action_error, _ = approve_transition_record(
            record_id=record.id,
            approver=creator,
            action="approved",
        )
        assert success is True
        assert action_error is None

        issue.refresh_from_db()
        record.refresh_from_db()
        assert record.status == TransitionRecordStatus.CANCELLED
        assert issue.state_id == from_state.id

    @pytest.mark.django_db
    def test_state_assignee_constraint_union_and_unconstrained_fallback(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
        creator = workflow_context["creator"]
        assignee = workflow_context["assignee"]
        to_state = workflow_context["to_state"]
        workflow = workflow_context["workflow"]
        from_state = workflow_context["from_state"]

        other_state = State.objects.create(
            name="进行中",
            color="#5A67D8",
            group="started",
            project=project,
            issue_type=workflow_context["issue_type"],
        )
        third_state = State.objects.create(
            name="评审中",
            color="#C05621",
            group="started",
            project=project,
            issue_type=workflow_context["issue_type"],
        )
        outsider = type(creator).objects.create(
            email="outsider@example.com",
            username="outsider",
            first_name="Out",
            last_name="Sider",
        )

        issue.state = to_state
        issue.save(update_fields=["state", "updated_at"])

        t1 = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=from_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=t1,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=assignee,
        )

        t2 = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=other_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=t2,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
            kind=WorkflowPrincipalKind.MEMBER,
            member=creator,
        )

        allowed, error = check_state_assignee_constraint(
            issue=issue,
            state=to_state,
            desired_assignee_ids=[creator.id],
        )
        assert allowed is True
        assert error is None

        allowed, error = check_state_assignee_constraint(
            issue=issue,
            state=to_state,
            desired_assignee_ids=[outsider.id],
        )
        assert allowed is False
        assert "负责人" in error

        WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            from_state=third_state,
            to_state=to_state,
            approval_type=ApprovalType.ALL,
        )
        allowed, error = check_state_assignee_constraint(
            issue=issue,
            state=to_state,
            desired_assignee_ids=[outsider.id],
        )
        assert allowed is True
        assert error is None

    @pytest.mark.django_db
    def test_backward_compatible_without_new_dimensions(self, workflow_context):
        issue = workflow_context["issue"]
        project = workflow_context["project"]
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
            required_count=1,
        )
        WorkflowTransitionPrincipal.objects.create(
            transition=transition,
            dimension=WorkflowPrincipalDimension.APPROVER,
            kind=WorkflowPrincipalKind.MEMBER,
            member=creator,
        )

        allowed, error, record = check_update_state_permission(
            issue=issue,
            to_state=to_state,
            user=initiator,
            project_id=project.id,
        )
        assert allowed is False
        assert "已创建审批流程" in error
        assert record is not None
