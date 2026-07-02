from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import (
    ApprovalType,
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    IssueType,
    State,
    Workflow,
    WorkflowApproverTarget,
    WorkflowPrincipalDimension,
    WorkflowPrincipalKind,
    WorkflowTransition,
)

# 动态对象（特殊审批对象）的中文展示文案
DYNAMIC_TARGET_LABELS = {
    WorkflowApproverTarget.ASSIGNEES: "工作项负责人",
    WorkflowApproverTarget.CREATED_BY: "工作项创建人",
}


def build_workflow_principal_item(principal):
    """把一个流转对象（成员/角色/动态对象）转换成前端可直接展示的字典。"""
    if principal.kind == WorkflowPrincipalKind.MEMBER and principal.member_id:
        member = principal.member
        return {
            "kind": "member",
            "id": str(principal.member_id),
            "label": member.display_name or member.email or "成员",
            "avatar_url": member.avatar_url,
        }
    if principal.kind == WorkflowPrincipalKind.ROLE and principal.role_id:
        return {
            "kind": "role",
            "id": str(principal.role_id),
            "label": principal.role.name,
            "avatar_url": None,
        }
    if principal.kind == WorkflowPrincipalKind.DYNAMIC and principal.dynamic_target:
        return {
            "kind": "dynamic",
            "id": principal.dynamic_target,
            "label": DYNAMIC_TARGET_LABELS.get(
                principal.dynamic_target, principal.dynamic_target
            ),
            "avatar_url": None,
        }
    return None


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

    def validate(self, attrs):
        if attrs.get("issue_type") and str(attrs["issue_type"].project_id) != str(self.context.get("project_id")):
            raise serializers.ValidationError("Issue type is not valid please pass a valid issue_type_id")
        return attrs


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

    def validate(self, attrs):
        project_id = self.context.get("project_id")
        workflow = attrs.get("workflow") or (self.instance.workflow if self.instance else None)
        from_state = attrs.get("from_state") or (self.instance.from_state if self.instance else None)
        to_state = attrs.get("to_state") or (self.instance.to_state if self.instance else None)

        if workflow and str(workflow.project_id) != str(project_id):
            raise serializers.ValidationError("Workflow is not valid for this project")
        if from_state and str(from_state.project_id) != str(project_id):
            raise serializers.ValidationError("From state is not valid for this project")
        if to_state and str(to_state.project_id) != str(project_id):
            raise serializers.ValidationError("To state is not valid for this project")
        return attrs


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
    target_assignee_ids = serializers.JSONField(read_only=True)
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
            "target_assignee_ids",
            "approval_reason",
            "approval_records",
            "created_at",
            "completed_at",
        ]
        read_only_fields = fields


class IssueTransitionActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approved", "rejected"])
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class WorkflowFlowchartStateSerializer(BaseSerializer):
    """流程图中的状态节点（只读）。"""

    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields


class WorkflowFlowchartTransitionSerializer(BaseSerializer):
    """
    流程图中的一条流转边（只读），附带已解析好的发起人、目标负责人、
    审批人、审批规则文案与必填字段，前端无需再二次拼接。
    依赖调用方对 principals / required_fields 做过滤未删除的 prefetch。
    """

    from_state_id = serializers.UUIDField(read_only=True, allow_null=True)
    to_state_id = serializers.UUIDField(read_only=True, allow_null=True)
    approval_rule_label = serializers.SerializerMethodField()
    initiators = serializers.SerializerMethodField()
    assignees = serializers.SerializerMethodField()
    approvers = serializers.SerializerMethodField()
    required_fields = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowTransition
        fields = [
            "id",
            "from_state_id",
            "to_state_id",
            "approval_type",
            "required_count",
            "approval_rule_label",
            "initiators",
            "assignees",
            "approvers",
            "required_fields",
        ]
        read_only_fields = fields

    def _principals(self, obj, dimension):
        items = []
        for principal in obj.principals.all():
            if principal.dimension != dimension:
                continue
            item = build_workflow_principal_item(principal)
            if item:
                items.append(item)
        return items

    def get_initiators(self, obj):
        return self._principals(obj, WorkflowPrincipalDimension.INITIATOR)

    def get_assignees(self, obj):
        return self._principals(obj, WorkflowPrincipalDimension.ASSIGNEE)

    def get_approvers(self, obj):
        return self._principals(obj, WorkflowPrincipalDimension.APPROVER)

    def get_required_fields(self, obj):
        fields = []
        for required in obj.required_fields.all():
            if not required.extra_field_id:
                continue
            fields.append(
                {
                    "id": str(required.extra_field_id),
                    "name": required.extra_field.name,
                    "field_type": required.extra_field.field_type,
                }
            )
        return fields

    def get_approval_rule_label(self, obj):
        approver_count = sum(
            1
            for principal in obj.principals.all()
            if principal.dimension == WorkflowPrincipalDimension.APPROVER
        )
        if approver_count == 0:
            return "无需审批"
        if obj.approval_type == ApprovalType.ALL:
            return "需全部审批人通过"
        if obj.approval_type == ApprovalType.ANY:
            return "任意一人通过即可"
        return f"需 {max(1, obj.required_count or 1)} 人通过"
