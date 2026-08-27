from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    RequirementApprovalAction,
    RequirementApprovalType,
    RequirementBaseline,
    RequirementBaselineEntry,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementChangeType,
    RequirementTypeSchemaRevision,
    RequirementVersion,
)

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
    """变更单里的一条需求。"""

    requirement_type_name = serializers.CharField(
        source="requirement_type.name", read_only=True
    )
    title = serializers.SerializerMethodField()
    display_id = serializers.SerializerMethodField()

    class Meta:
        model = RequirementChangeItem
        fields = [
            "id",
            "change_type",
            "target_id",
            "requirement_type_id",
            "requirement_type_name",
            "schema_revision_id",
            "title",
            "display_id",
            "before_snapshot",
            "proposed_snapshot",
            "base_version",
            "base_row_version",
            "proposed_sort_order",
        ]
        read_only_fields = fields

    def get_title(self, obj):
        """删除项没有 proposed_snapshot，标题要回落到变更前那份。"""
        snapshot = obj.proposed_snapshot or obj.before_snapshot or {}
        return snapshot.get("title") or ""

    def get_display_id(self, obj):
        # 与 title 同样的回落：删除项只有 before_snapshot
        snapshot = obj.proposed_snapshot or obj.before_snapshot or {}
        return snapshot_display_id(snapshot, self.context)


def snapshot_display_id(snapshot, context):
    """快照里的 sequence_id + context 里的作用域前缀 -> "ECOM-1"。

    快照刻意只存序号不存拼好的编号：产品改标识后，历史版本、变更单与基线里的编号要
    跟着变。前缀由视图放进 context（ProductScopedMixin.snapshot_context），零查询。

    本次改动之前落的快照没有 sequence_id 这个 key，返回 None，前端不显示编号。
    """
    prefix = context.get("scope_identifier")
    sequence_id = (snapshot or {}).get("sequence_id")
    if not prefix or sequence_id is None:
        return None
    return f"{prefix}-{sequence_id}"


class RequirementSchemaRevisionSerializer(BaseSerializer):
    """需求类型的一次字段结构修订。"""

    requirement_type_name = serializers.CharField(
        source="requirement_type.name", read_only=True
    )
    actor_detail = UserLiteSerializer(source="created_by", read_only=True)

    class Meta:
        model = RequirementTypeSchemaRevision
        fields = [
            "id",
            "requirement_type_id",
            "requirement_type_name",
            "revision",
            "diff",
            "actor_detail",
            "created_at",
        ]
        read_only_fields = fields


class RequirementChangeRequestSerializer(BaseSerializer):
    """变更单列表项。

    审批进度直接由 approvals 渲染（审批人数量天然很小），三个计数读 CR 上的冗余字段，
    避免每次 COUNT 变更项。
    """

    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    approvals = RequirementChangeApprovalSerializer(many=True, read_only=True)
    total_count = serializers.SerializerMethodField()
    approved_count = serializers.SerializerMethodField()
    rejected_count = serializers.SerializerMethodField()
    requirement_count = serializers.SerializerMethodField()
    requirement_previews = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = RequirementChangeRequest
        fields = [
            "id",
            "product_id",
            "project_id",
            "sequence_id",
            "status",
            "reason",
            "approval_type",
            "required_count",
            "created_count",
            "updated_count",
            "deleted_count",
            "requirement_count",
            "requirement_previews",
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

    def get_requirement_count(self, obj):
        return obj.created_count + obj.updated_count + obj.deleted_count

    def get_requirement_previews(self, obj):
        """列表里给前 3 条需求的标题，够画一行摘要而不必展开整张单。"""
        previews = []
        for item in list(obj.items.all())[:3]:
            snapshot = item.proposed_snapshot or item.before_snapshot or {}
            previews.append(
                {
                    "id": str(item.target_id),
                    "title": snapshot.get("title") or "",
                    "change_type": item.change_type,
                }
            )
        return previews

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

    N 通常是个位数，所以条目直接内联；只有大批量提交（整个类型视图一次提交）才会
    多到需要分页，那时走 items 端点。
    """

    INLINE_ITEM_LIMIT = 50

    requirement_items = serializers.SerializerMethodField()
    requirement_type_stats = serializers.SerializerMethodField()

    class Meta(RequirementChangeRequestSerializer.Meta):
        fields = RequirementChangeRequestSerializer.Meta.fields + [
            "requirement_items",
            "requirement_type_stats",
        ]
        read_only_fields = fields

    def get_requirement_items(self, obj):
        items = list(obj.items.all())
        if len(items) > self.INLINE_ITEM_LIMIT:
            return None
        return RequirementChangeItemSerializer(items, many=True).data

    def get_requirement_type_stats(self, obj):
        return self.context.get("requirement_type_stats") or []


class RequirementApprovalInboxSerializer(RequirementChangeRequestSerializer):
    """收件箱里的一张单。

    比列表项多一个产品名 —— 收件箱是跨产品的，只给 CR-3 这样的编号，人分不出这是哪个
    产品的单。
    """

    product_name = serializers.CharField(source="product.name", read_only=True)
    my_action = serializers.SerializerMethodField()

    class Meta(RequirementChangeRequestSerializer.Meta):
        fields = RequirementChangeRequestSerializer.Meta.fields + [
            "product_name",
            "my_action",
        ]
        read_only_fields = fields

    def get_my_action(self, obj):
        """我在这张单上表过什么态。已办页要靠它区分「我批了」和「我驳了」。"""
        user = self._current_user()
        if user is None:
            return None
        for approval in obj.approvals.all():
            if approval.approver_id == user.id:
                return approval.action
        return None


class RequirementChangeSubmitItemSerializer(serializers.Serializer):
    requirement_id = serializers.UUIDField()
    change_type = serializers.ChoiceField(
        choices=RequirementChangeType.choices,
        required=False,
        default=RequirementChangeType.UPDATE,
    )


class RequirementChangeApprovalSpecSerializer(serializers.Serializer):
    """一次提交的评审人与通过规则。只对这张变更单有效 —— 产品级没有常驻配置。

    这里只做形状校验（不查库）：成员资格由 utils.requirement_change 在提单时校验，
    产品侧与项目侧两个入口共用。
    """

    approval_type = serializers.ChoiceField(
        choices=RequirementApprovalType.choices,
        default=RequirementApprovalType.ANY,
    )
    required_count = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=1
    )
    approver_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )

    def validate_approver_ids(self, value):
        return list(dict.fromkeys(value))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        approval_type = attrs["approval_type"]
        required_count = attrs.get("required_count")
        approver_ids = attrs["approver_ids"]

        if approval_type == RequirementApprovalType.NONE:
            if approver_ids:
                raise serializers.ValidationError(
                    {"approver_ids": "Approvers must be empty when no review is required."}
                )
        elif not approver_ids:
            raise serializers.ValidationError(
                {"approver_ids": "Select at least one approver."}
            )

        if approval_type == RequirementApprovalType.N_OF_M:
            if required_count is None:
                raise serializers.ValidationError(
                    {"required_count": "This field is required for n_of_m approval."}
                )
            if required_count > len(approver_ids):
                raise serializers.ValidationError(
                    {
                        "required_count": (
                            "The required count cannot exceed the number of approvers."
                        )
                    }
                )
        elif required_count is not None:
            raise serializers.ValidationError(
                {"required_count": "This field must be null unless approval_type is n_of_m."}
            )
        return attrs


class RequirementProjectChangeSubmitSerializer(RequirementChangeApprovalSpecSerializer):
    """项目侧提单：需求由 URL 指定，请求体只有原因与评审规则。"""

    reason = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )

    def validate_reason(self, value):
        return (value or "").strip()


class RequirementChangeSubmitSerializer(RequirementProjectChangeSubmitSerializer):
    """提交 1..N 条需求进入评审。

    只收指针不收快照 —— 服务端自己读当前行内容，否则一个陈旧的网格可以用旧内容开出
    一张新单。change_type 里只有 delete 是真的意图，新增与修改由服务端按
    approved_version 判定。
    """

    items = RequirementChangeSubmitItemSerializer(many=True, allow_empty=False)

    def validate_items(self, value):
        seen = set()
        for item in value:
            key = str(item["requirement_id"])
            if key in seen:
                raise serializers.ValidationError(
                    "A requirement can only appear once in a change request."
                )
            seen.add(key)
        return value


class RequirementChangeActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=RequirementApprovalAction.choices)
    comment = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )
    # 驳回时顺带把内容退回上一个已通过版本（禅道的「撤销变更」）。默认关：多数驳回是
    # 「改一改再提」，直接丢掉提交人的改动太重。
    revert = serializers.BooleanField(required=False, default=False)

    def validate_comment(self, value):
        return (value or "").strip()


class RequirementVersionSerializer(BaseSerializer):
    """一条需求的一个已通过版本。

    snapshot 直接内联 —— 现在一个版本只装一条需求，不再是整个产品的几 MB 快照。
    fields_snapshot 从 schema_revision 取：字段结构立即生效不走审批，没有它就没法把
    旧版本按当年的表头渲染出来。
    """

    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    change_request_sequence_id = serializers.IntegerField(
        source="change_request.sequence_id", read_only=True, allow_null=True
    )
    change_request_reason = serializers.CharField(
        source="change_request.reason", read_only=True, allow_null=True
    )
    fields_snapshot = serializers.SerializerMethodField()
    display_id = serializers.SerializerMethodField()

    class Meta:
        model = RequirementVersion
        fields = [
            "id",
            "target_id",
            "requirement_type_id",
            "version",
            "change_type",
            "snapshot",
            "fields_snapshot",
            "display_id",
            "approved_by",
            "change_request_id",
            "change_request_sequence_id",
            "change_request_reason",
            "created_by",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = fields

    def get_fields_snapshot(self, obj):
        return (obj.schema_revision.fields if obj.schema_revision_id else []) or []

    def get_display_id(self, obj):
        return snapshot_display_id(obj.snapshot, self.context)


class RequirementBaselineSerializer(BaseSerializer):
    """基线快照列表项 / 详情。

    内容不可改 —— 只有名称与说明能改。收录了哪些需求的哪一版在创建那一刻就定死了。
    """

    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    requirement_type_stats = serializers.SerializerMethodField()

    class Meta:
        model = RequirementBaseline
        fields = [
            "id",
            "product_id",
            "project_id",
            "name",
            "description",
            "entry_count",
            "requirement_type_stats",
            "created_by",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = [field for field in fields if field not in ("name", "description")]

    def get_requirement_type_stats(self, obj):
        return self.context.get("requirement_type_stats") or []


class RequirementBaselineWriteSerializer(serializers.Serializer):
    """打基线。

    scope 决定收录范围：all = 作用域内全部，by_type = 指定几个需求类型，
    by_requirement = 指定几条需求。preview=true 时只算不写。
    """

    name = serializers.CharField(
        max_length=255, trim_whitespace=True, required=False, allow_blank=True, default=""
    )
    description = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )
    scope = serializers.ChoiceField(
        choices=["all", "by_type", "by_requirement"], required=False, default="all"
    )
    requirement_type_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    requirement_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )

    def validate(self, attrs):
        # 预览只是「按这个范围算一遍」，名字是保存时才需要的东西 —— 强制先起名会逼着
        # 用户在还不知道会纳入多少条之前就命名。
        if not self.context.get("preview") and not attrs.get("name"):
            raise serializers.ValidationError({"name": "This field is required."})
        if attrs["scope"] == "by_type" and not attrs.get("requirement_type_ids"):
            raise serializers.ValidationError(
                {"requirement_type_ids": "Select at least one requirement type."}
            )
        if attrs["scope"] == "by_requirement" and not attrs.get("requirement_ids"):
            raise serializers.ValidationError(
                {"requirement_ids": "Select at least one requirement."}
            )
        return attrs


class RequirementBaselineEntrySerializer(BaseSerializer):
    """基线里的一条：内容与字段结构都取自被收录的那一版，不跟随需求现状。"""

    snapshot = serializers.JSONField(source="version.snapshot", read_only=True)
    version_number = serializers.IntegerField(source="version.version", read_only=True)
    requirement_type_id = serializers.UUIDField(
        source="version.requirement_type_id", read_only=True
    )
    fields_snapshot = serializers.SerializerMethodField()
    display_id = serializers.SerializerMethodField()

    class Meta:
        model = RequirementBaselineEntry
        fields = [
            "id",
            "requirement_id",
            "requirement_type_id",
            "version_id",
            "version_number",
            "snapshot",
            "fields_snapshot",
            "display_id",
            "sort_order",
        ]
        read_only_fields = fields

    def get_fields_snapshot(self, obj):
        return (obj.version.schema_revision.fields if obj.version.schema_revision_id else []) or []

    def get_display_id(self, obj):
        return snapshot_display_id(obj.version.snapshot, self.context)
