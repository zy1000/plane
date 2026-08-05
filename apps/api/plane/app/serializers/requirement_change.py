from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    RequirementApprovalAction,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementChangeTargetKind,
    RequirementChangeType,
    RequirementVersion,
)
from plane.utils.requirement_change import snapshot_requirement_type_stats

from .base import BaseSerializer


class RequirementChangeApprovalSerializer(BaseSerializer):
    approver_detail = UserLiteSerializer(source="approver", read_only=True)

    class Meta:
        model = RequirementChangeApproval
        fields = [
            "id",
            "approver_id",
            "approver_detail",
            "action",
            "comment",
            "acted_at",
        ]
        read_only_fields = fields


class RequirementChangeItemSerializer(BaseSerializer):
    class Meta:
        model = RequirementChangeItem
        fields = [
            "id",
            "target_kind",
            "change_type",
            "target_id",
            "before_snapshot",
            "proposed_snapshot",
            "base_version",
            "proposed_sort_order",
        ]
        read_only_fields = fields


class RequirementChangeRequestSerializer(BaseSerializer):
    """变更单列表项。

    审批进度直接由 approvals 渲染（审批人数量天然很小），三个计数读 CR 上的
    冗余字段，避免每次 COUNT 上千条变更项。
    """

    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    approvals = RequirementChangeApprovalSerializer(many=True, read_only=True)
    total_count = serializers.SerializerMethodField()
    approved_count = serializers.SerializerMethodField()
    rejected_count = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = RequirementChangeRequest
        fields = [
            "id",
            "baseline_id",
            "sequence_id",
            "request_kind",
            "status",
            "reason",
            "base_version",
            "approval_type",
            "required_count",
            "created_count",
            "updated_count",
            "deleted_count",
            "item_count",
            "changed_field_ids",
            "approvals",
            "total_count",
            "approved_count",
            "rejected_count",
            "can_approve",
            "can_cancel",
            "created_by",
            "created_by_detail",
            "created_at",
            "completed_at",
        ]
        read_only_fields = fields

    def get_total_count(self, obj):
        return len(obj.approvals.all())

    def get_approved_count(self, obj):
        return sum(
            1
            for approval in obj.approvals.all()
            if approval.action == RequirementApprovalAction.APPROVED
        )

    def get_rejected_count(self, obj):
        return sum(
            1
            for approval in obj.approvals.all()
            if approval.action == RequirementApprovalAction.REJECTED
        )

    def get_item_count(self, obj):
        return obj.created_count + obj.updated_count + obj.deleted_count

    def _current_user(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or user.is_anonymous:
            return None
        return user

    def get_can_approve(self, obj):
        user = self._current_user()
        if user is None or obj.status != RequirementChangeStatus.PENDING:
            return False
        return any(
            approval.approver_id == user.id and not approval.action
            for approval in obj.approvals.all()
        )

    def get_can_cancel(self, obj):
        user = self._current_user()
        if user is None:
            return False
        return (
            obj.status == RequirementChangeStatus.PENDING
            and obj.created_by_id == user.id
        )


class RequirementChangeRequestDetailSerializer(RequirementChangeRequestSerializer):
    """变更单详情。

    针对千行需求专门设计：只内联「审批配置」与「字段定义」两组变更项（这两组天然
    很小），需求条目组只给计数，实际内容由独立的分页端点按需拉取。
    """

    baseline_items = serializers.SerializerMethodField()
    schema_items = serializers.SerializerMethodField()
    requirement_item_count = serializers.SerializerMethodField()
    requirement_type_stats = serializers.SerializerMethodField()

    class Meta(RequirementChangeRequestSerializer.Meta):
        fields = RequirementChangeRequestSerializer.Meta.fields + [
            "baseline_items",
            "schema_items",
            "requirement_item_count",
            "requirement_type_stats",
        ]
        read_only_fields = fields

    def _grouped_items(self, obj, target_kind):
        return [
            item
            for item in obj.items.all()
            if item.target_kind == target_kind
        ]

    def get_baseline_items(self, obj):
        return RequirementChangeItemSerializer(
            self._grouped_items(obj, RequirementChangeTargetKind.BASELINE),
            many=True,
        ).data

    def get_schema_items(self, obj):
        return RequirementChangeItemSerializer(
            self._grouped_items(obj, RequirementChangeTargetKind.SCHEMA),
            many=True,
        ).data

    def get_requirement_item_count(self, obj):
        return self.context.get("requirement_item_count", 0)

    def get_requirement_type_stats(self, obj):
        return self.context.get("requirement_type_stats") or []


class RequirementChangeSubmitSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )

    def validate_reason(self, value):
        return (value or "").strip()


class RequirementChangeActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=RequirementApprovalAction.choices)
    comment = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )

    def validate_comment(self, value):
        return (value or "").strip()


class RequirementVersionSerializer(BaseSerializer):
    """版本列表项，不带 snapshot —— 快照可能是几 MB。"""

    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    change_request_sequence_id = serializers.IntegerField(
        source="change_request.sequence_id", read_only=True, allow_null=True
    )
    change_request_reason = serializers.CharField(
        source="change_request.reason", read_only=True, allow_null=True
    )

    class Meta:
        model = RequirementVersion
        fields = [
            "id",
            "baseline_id",
            "version",
            "change_type",
            "approved_by",
            "change_request_id",
            "change_request_sequence_id",
            "change_request_reason",
            "created_by",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = fields


class RequirementVersionDetailSerializer(RequirementVersionSerializer):
    """版本详情：带 meta 与字段定义，需求条目走独立分页端点。"""

    baseline_snapshot = serializers.SerializerMethodField()
    fields_snapshot = serializers.SerializerMethodField()
    requirement_count = serializers.SerializerMethodField()
    requirement_type_stats = serializers.SerializerMethodField()

    class Meta(RequirementVersionSerializer.Meta):
        fields = RequirementVersionSerializer.Meta.fields + [
            "baseline_snapshot",
            "fields_snapshot",
            "requirement_count",
            "requirement_type_stats",
        ]
        read_only_fields = fields

    def get_baseline_snapshot(self, obj):
        return (obj.snapshot or {}).get("baseline") or {}

    def get_fields_snapshot(self, obj):
        return (obj.snapshot or {}).get("fields") or []

    def get_requirement_count(self, obj):
        return len((obj.snapshot or {}).get("requirements") or [])

    def get_requirement_type_stats(self, obj):
        return snapshot_requirement_type_stats(obj.snapshot or {})


class RequirementVersionComparisonItemSerializer(serializers.Serializer):
    """版本比较产生的瞬时变更项，与已落库的变更项保持同一前端契约。"""

    id = serializers.CharField()
    target_kind = serializers.ChoiceField(
        choices=RequirementChangeTargetKind.choices
    )
    change_type = serializers.ChoiceField(choices=RequirementChangeType.choices)
    target_id = serializers.UUIDField(allow_null=True)
    before_snapshot = serializers.JSONField(allow_null=True)
    proposed_snapshot = serializers.JSONField(allow_null=True)
    base_version = serializers.IntegerField(allow_null=True)
    proposed_sort_order = serializers.FloatField(allow_null=True)


class RequirementVersionComparisonSerializer(serializers.Serializer):
    """版本比较的非分页部分；需求条目结果由通用分页响应的 results 承载。"""

    from_version = serializers.IntegerField()
    to_version = serializers.IntegerField()
    baseline_items = RequirementVersionComparisonItemSerializer(many=True)
    schema_items = RequirementVersionComparisonItemSerializer(many=True)
    requirement_item_count = serializers.IntegerField()
    changed_field_ids = serializers.ListField(child=serializers.CharField())
    to_fields_snapshot = serializers.JSONField()
    requirement_type_stats = serializers.JSONField()
