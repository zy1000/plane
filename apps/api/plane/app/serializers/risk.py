"""风险的序列化：List / Detail 负责输出，Write 负责输入校验。

规则（等级、关联缺陷、推简道云）都在 ``utils/risk.py``；这里只校验形状和必填。
"""

from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    ProjectMember,
    Risk,
    RiskActivity,
    RiskCategory,
    RiskComment,
    RiskLevel,
    RiskScale,
    RiskStatus,
    RiskStrategy,
    User,
)

from .base import BaseSerializer


# --- 输出 -------------------------------------------------------------------


class RiskListSerializer(BaseSerializer):
    proposer_detail = UserLiteSerializer(source="proposer", read_only=True)
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    stakeholder_ids = serializers.SerializerMethodField()
    risk_score = serializers.SerializerMethodField()
    issue_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Risk
        fields = [
            "id",
            "workspace",
            "project",
            "code",
            "name",
            "status",
            "category",
            "impact_level",
            "probability",
            "risk_level",
            "risk_score",
            "strategy",
            "is_in_risk_production",
            "proposer",
            "proposer_detail",
            "proposed_date",
            "owner",
            "owner_detail",
            "stakeholder_ids",
            "planned_handle_date",
            "actual_close_date",
            "issue_count",
            # 简道云绑定：有 external_id 才同步过；code 为空时前端按 sync_status 显示「生成中 / 未同步」
            "external_id",
            "sync_status",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_stakeholder_ids(self, obj):
        # 视图已 prefetch，这里不会逐行查
        return [str(user.id) for user in obj.stakeholders.all()]

    def get_risk_score(self, obj):
        if not obj.impact_level or not obj.probability:
            return None
        return int(obj.impact_level) * int(obj.probability)


class RiskDetailSerializer(RiskListSerializer):
    stakeholder_details = UserLiteSerializer(
        source="stakeholders", many=True, read_only=True
    )

    class Meta(RiskListSerializer.Meta):
        fields = RiskListSerializer.Meta.fields + [
            "description",
            "impact_description",
            "response_measures",
            "risk_loss",
            "trigger_factors",
            "stakeholder_details",
            "sync_error",
            "synced_at",
        ]
        read_only_fields = fields


class RiskActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = RiskActivity
        fields = [
            "id",
            "risk",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "comment",
            "risk_comment",
            "old_identifier",
            "new_identifier",
            "epoch",
            "extra",
            "created_at",
        ]
        read_only_fields = fields


class RiskCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    def validate_parent(self, value):
        # 父评论只能是同一条风险下的：挂到别的风险上，那边一删这条就跟着级联没了
        if value is not None and str(value.risk_id) != str(self.context.get("risk_id")):
            raise serializers.ValidationError("RISK_COMMENT_PARENT_MISMATCH")
        return value

    class Meta:
        model = RiskComment
        fields = [
            "id",
            "workspace",
            "project",
            "risk",
            "actor",
            "actor_detail",
            "comment_stripped",
            "comment_json",
            "comment_html",
            "parent",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "project",
            "risk",
            "actor",
            "comment_stripped",
            "edited_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


# --- 输入 -------------------------------------------------------------------


class RiskWriteSerializer(serializers.ModelSerializer):
    """新建 / 部分更新共用。新建时视图已把提出人、提出时间兜底填好。

    ``risk_level`` 选填：不传按影响程度 × 发生概率推算，传了就是手动调整，规则见
    ``utils/risk.py::create_risk / update_risk``。影响程度 / 发生概率模型上可空（简道云同步来的会空），
    本地写入仍必填。三段文本是纯文本，只去首尾空白。
    """

    name = serializers.CharField(max_length=255)
    status = serializers.ChoiceField(choices=RiskStatus.choices, default=RiskStatus.DRAFT)
    category = serializers.ChoiceField(
        choices=RiskCategory.choices, required=False, allow_blank=True, default=""
    )
    description = serializers.CharField(allow_blank=True, trim_whitespace=False)
    impact_description = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default="", trim_whitespace=False
    )
    response_measures = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default="", trim_whitespace=False
    )
    impact_level = serializers.ChoiceField(choices=RiskScale.choices)
    probability = serializers.ChoiceField(choices=RiskScale.choices)
    risk_level = serializers.ChoiceField(choices=RiskLevel.choices, required=False)
    strategy = serializers.ChoiceField(
        choices=RiskStrategy.choices, required=False, allow_blank=True, default=""
    )
    proposer_id = serializers.PrimaryKeyRelatedField(
        source="proposer", queryset=User.objects.all()
    )
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner", queryset=User.objects.all()
    )
    stakeholder_ids = serializers.PrimaryKeyRelatedField(
        source="stakeholders", many=True, required=False, queryset=User.objects.all()
    )

    class Meta:
        model = Risk
        fields = [
            "name",
            "status",
            "category",
            "description",
            "impact_description",
            "response_measures",
            "impact_level",
            "probability",
            "risk_level",
            "risk_loss",
            "trigger_factors",
            "strategy",
            "is_in_risk_production",
            "proposer_id",
            "proposed_date",
            "owner_id",
            "stakeholder_ids",
            "planned_handle_date",
            "actual_close_date",
        ]
        extra_kwargs = {
            "risk_loss": {"required": False, "allow_blank": True},
            "trigger_factors": {"required": False, "allow_blank": True},
            "is_in_risk_production": {"required": False, "allow_null": True},
            "proposed_date": {"required": True},
            "planned_handle_date": {"required": False, "allow_null": True},
            "actual_close_date": {"required": False, "allow_null": True},
        }

    # 人员都得是本项目的在职成员（含访客），否则责任人就能指给项目外的人
    def _assert_member(self, user):
        project_id = self.context.get("project_id")
        if project_id and not ProjectMember.objects.filter(
            project_id=project_id, member=user, is_active=True
        ).exists():
            raise serializers.ValidationError("RISK_MEMBER_NOT_IN_PROJECT")
        return user

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("RISK_NAME_REQUIRED")
        return value.strip()

    def validate_description(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("RISK_DESCRIPTION_REQUIRED")
        return cleaned

    def validate_impact_description(self, value):
        return (value or "").strip()

    def validate_response_measures(self, value):
        return (value or "").strip()

    def validate_proposer_id(self, value):
        return self._assert_member(value)

    def validate_owner_id(self, value):
        return self._assert_member(value)

    def validate_stakeholder_ids(self, value):
        users = list({user.id: user for user in value}.values())
        for user in users:
            self._assert_member(user)
        return users

    def validate(self, attrs):
        # 实际关闭不能早于提出：两个日期都可能只改一个，所以合着看
        proposed = attrs.get("proposed_date", getattr(self.instance, "proposed_date", None))
        closed = attrs.get(
            "actual_close_date", getattr(self.instance, "actual_close_date", None)
        )
        if proposed and closed and closed < proposed:
            raise serializers.ValidationError(
                {"actual_close_date": "RISK_CLOSE_BEFORE_PROPOSED"}
            )
        return attrs
