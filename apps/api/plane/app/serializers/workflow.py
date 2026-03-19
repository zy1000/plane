from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import (
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    IssueType,
    State,
    Workflow,
    WorkflowApproverTarget,
    WorkflowTransition,
)


class WorkflowSerializer(BaseSerializer):
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueType.objects.all(),
        source="issue_type",
        required=False,
        allow_null=False,
    )

    class Meta:
        model = Workflow
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "issue_type_id",
        ]


class WorkflowTransitionSerializer(BaseSerializer):
    from_state_id = serializers.PrimaryKeyRelatedField(
        queryset=State.objects.all(),
        source="from_state",
        required=False,
        allow_null=True,
    )
    to_state_id = serializers.PrimaryKeyRelatedField(
        queryset=State.objects.all(),
        source="to_state",
    )
    workflow_id = serializers.PrimaryKeyRelatedField(
        queryset=Workflow.objects.all(),
        source="workflow",
    )
    dynamic_approver_types = serializers.ListField(
        child=serializers.ChoiceField(choices=WorkflowApproverTarget.values),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = WorkflowTransition
        fields = [
            "id",
            "workflow_id",
            "from_state_id",
            "to_state_id",
            "approval_type",
            "required_count",
            "dynamic_approver_types",
        ]


class IssueTransitionApprovalRecordSerializer(BaseSerializer):
    approver_id = serializers.UUIDField(source="approver.id", read_only=True)
    approver_display_name = serializers.CharField(source="approver.display_name", read_only=True)
    approver_avatar_url = serializers.CharField(source="approver.avatar_url", read_only=True)

    class Meta:
        model = IssueTransitionApprovalRecord
        fields = [
            "id",
            "approver_id",
            "approver_display_name",
            "approver_avatar_url",
            "action",
            "comment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class IssueTransitionRecordListSerializer(BaseSerializer):
    issue_id = serializers.UUIDField(source="issue.id", read_only=True)
    issue_sequence_id = serializers.IntegerField(source="issue.sequence_id", read_only=True)
    issue_name = serializers.CharField(source="issue.name", read_only=True)
    from_state_id = serializers.UUIDField(source="from_state.id", read_only=True, allow_null=True)
    from_state_name = serializers.CharField(source="from_state.name", read_only=True, allow_null=True)
    from_state_color = serializers.CharField(source="from_state.color", read_only=True, allow_null=True)
    from_state_group = serializers.CharField(source="from_state.group", read_only=True, allow_null=True)
    to_state_id = serializers.UUIDField(source="to_state.id", read_only=True, allow_null=True)
    to_state_name = serializers.CharField(source="to_state.name", read_only=True, allow_null=True)
    to_state_color = serializers.CharField(source="to_state.color", read_only=True, allow_null=True)
    to_state_group = serializers.CharField(source="to_state.group", read_only=True, allow_null=True)
    required_count = serializers.IntegerField(source="transition.required_count", read_only=True, allow_null=True)
    approval_records = IssueTransitionApprovalRecordSerializer(many=True, read_only=True)

    class Meta:
        model = IssueTransitionRecord
        fields = [
            "id",
            "issue_id",
            "issue_sequence_id",
            "issue_name",
            "from_state_id",
            "from_state_name",
            "from_state_color",
            "from_state_group",
            "to_state_id",
            "to_state_name",
            "to_state_color",
            "to_state_group",
            "status",
            "required_count",
            "approval_records",
            "created_at",
            "completed_at",
        ]
        read_only_fields = fields


class IssueTransitionActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approved", "rejected"])
    comment = serializers.CharField(required=False, allow_blank=True, default="")
