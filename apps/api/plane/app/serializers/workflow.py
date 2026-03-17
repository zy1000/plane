from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import IssueType, State, Workflow, WorkflowTransition


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

    class Meta:
        model = WorkflowTransition
        fields = [
            "id",
            "workflow_id",
            "from_state_id",
            "to_state_id",
            "approval_type",
            "required_count",
        ]
