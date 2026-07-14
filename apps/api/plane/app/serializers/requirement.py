from django.db import transaction
from django.db.models import Q
from rest_framework import serializers

from plane.db.models import (
    FileAsset,
    Requirement,
    RequirementAttachment,
    RequirementComment,
    RequirementChange,
    RequirementChangeAttachment,
    RequirementChangeKind,
    RequirementChangeReviewer,
    RequirementChangeStatus,
    RequirementLifecycleAction,
    RequirementLifecycleEvent,
    RequirementModule,
    RequirementReviewOpinion,
    RequirementReviewRecord,
    RequirementVersion,
    User,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.requirement import (
    build_requirement_diff,
    can_edit_requirement_draft,
    can_manage_requirement_lifecycle,
    create_requirement_change,
    is_eligible_requirement_member,
    proposal_data_from_change,
    submit_requirement_change,
    update_requirement_draft,
)

from .base import BaseSerializer
from .user import UserLiteSerializer


class RequirementModuleLiteSerializer(BaseSerializer):
    class Meta:
        model = RequirementModule
        fields = ["id", "name"]
        read_only_fields = fields


class RequirementModuleSerializer(BaseSerializer):
    requirement_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RequirementModule
        fields = [
            "id",
            "product",
            "name",
            "requirement_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "product",
            "requirement_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("REQUIREMENT_MODULE_NAME_REQUIRED")
        product = self.context["product"]
        queryset = RequirementModule.objects.filter(product=product, name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("REQUIREMENT_MODULE_NAME_ALREADY_EXISTS")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        return RequirementModule.objects.create(
            product=self.context["product"],
            created_by=request.user,
            **validated_data,
        )


class RequirementParentLiteSerializer(BaseSerializer):
    class Meta:
        model = Requirement
        fields = ["id", "name", "type", "status", "current_version"]
        read_only_fields = fields


class RequirementAttachmentDetailSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="asset_id", read_only=True)
    attributes = serializers.JSONField(source="asset.attributes", read_only=True)
    asset_url = serializers.CharField(source="asset.asset_url", read_only=True)
    created_at = serializers.DateTimeField(source="asset.created_at", read_only=True)
    updated_at = serializers.DateTimeField(source="asset.updated_at", read_only=True)
    created_by = serializers.UUIDField(source="asset.created_by_id", read_only=True, allow_null=True)

    class Meta:
        model = RequirementAttachment
        fields = [
            "id",
            "attributes",
            "asset_url",
            "created_at",
            "updated_at",
            "created_by",
        ]


class RequirementCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
        default=list,
    )

    class Meta:
        model = RequirementComment
        fields = [
            "id",
            "requirement",
            "actor",
            "actor_detail",
            "comment_stripped",
            "comment_json",
            "comment_html",
            "parent",
            "asset_ids",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "requirement",
            "actor",
            "comment_stripped",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_parent(self, value):
        if value and value.requirement_id != self.context["requirement"].id:
            raise serializers.ValidationError("REQUIREMENT_COMMENT_PARENT_INVALID")
        return value

    def validate_asset_ids(self, value):
        asset_ids = list(dict.fromkeys(value))
        if not asset_ids:
            return []

        requirement = self.context["requirement"]
        request = self.context["request"]
        matched_ids = set(
            FileAsset.objects.filter(
                id__in=asset_ids,
                workspace=requirement.product.workspace,
                product=requirement.product,
                entity_type=FileAsset.EntityTypeContext.REQUIREMENT_COMMENT_DESCRIPTION,
                entity_identifier=str(requirement.id),
                requirement_comment__isnull=True,
                created_by=request.user,
                is_uploaded=True,
                is_deleted=False,
            ).values_list("id", flat=True)
        )
        if matched_ids != set(asset_ids):
            raise serializers.ValidationError("REQUIREMENT_COMMENT_ASSETS_INVALID")
        return asset_ids

    @transaction.atomic
    def create(self, validated_data):
        asset_ids = validated_data.pop("asset_ids", [])
        requirement = self.context["requirement"]
        request = self.context["request"]

        assets = FileAsset.objects.none()
        if asset_ids:
            assets = FileAsset.objects.select_for_update().filter(
                id__in=asset_ids,
                workspace=requirement.product.workspace,
                product=requirement.product,
                entity_type=FileAsset.EntityTypeContext.REQUIREMENT_COMMENT_DESCRIPTION,
                entity_identifier=str(requirement.id),
                requirement_comment__isnull=True,
                created_by=request.user,
                is_uploaded=True,
                is_deleted=False,
            )
            if set(assets.values_list("id", flat=True)) != set(asset_ids):
                raise serializers.ValidationError({"asset_ids": "REQUIREMENT_COMMENT_ASSETS_INVALID"})

        comment = RequirementComment(
            requirement=requirement,
            actor=request.user,
            **validated_data,
        )
        comment.save(created_by_id=request.user.id)
        if asset_ids:
            assets.update(
                requirement_comment=comment,
                entity_identifier=str(comment.id),
            )
        return comment


class RequirementReviewRecordSerializer(BaseSerializer):
    reviewer_detail = serializers.SerializerMethodField()

    class Meta:
        model = RequirementReviewRecord
        fields = [
            "id",
            "opinion",
            "reason",
            "reviewer_detail",
            "created_at",
        ]
        read_only_fields = fields

    def get_reviewer_detail(self, obj):
        return UserLiteSerializer(obj.assignment.reviewer).data


class RequirementChangeReviewerSerializer(BaseSerializer):
    reviewer_detail = UserLiteSerializer(source="reviewer", read_only=True)
    records = RequirementReviewRecordSerializer(many=True, read_only=True)

    class Meta:
        model = RequirementChangeReviewer
        fields = [
            "id",
            "reviewer",
            "reviewer_detail",
            "latest_opinion",
            "latest_reason",
            "reviewed_at",
            "records",
        ]
        read_only_fields = fields


class RequirementChangeSerializer(BaseSerializer):
    module_detail = RequirementModuleLiteSerializer(source="module", read_only=True)
    parent_detail = RequirementParentLiteSerializer(source="parent", read_only=True)
    assignee_detail = UserLiteSerializer(source="assignee", read_only=True)
    proposed_reviewer_details = UserLiteSerializer(source="proposed_reviewers", many=True, read_only=True)
    attachments = RequirementAttachmentDetailSerializer(source="change_attachments", many=True, read_only=True)
    reviewer_assignments = RequirementChangeReviewerSerializer(many=True, read_only=True)
    base_version_number = serializers.IntegerField(source="base_version.version", read_only=True, allow_null=True)
    diff = serializers.SerializerMethodField()
    review_progress = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    requirement_type = serializers.CharField(source="requirement.type", read_only=True)
    requirement_status = serializers.CharField(source="requirement.status", read_only=True)
    requirement_current_version = serializers.IntegerField(source="requirement.current_version", read_only=True)

    class Meta:
        model = RequirementChange
        fields = [
            "id",
            "requirement",
            "requirement_type",
            "requirement_status",
            "requirement_current_version",
            "sequence",
            "kind",
            "status",
            "base_version",
            "base_version_number",
            "base_snapshot",
            "proposal_snapshot",
            "name",
            "priority",
            "module",
            "module_detail",
            "parent",
            "parent_detail",
            "assignee",
            "assignee_detail",
            "proposed_reviewers",
            "proposed_reviewer_details",
            "description_html",
            "acceptance_criteria_html",
            "attachments",
            "reviewer_assignments",
            "diff",
            "review_progress",
            "can_review",
            "created_at",
            "created_by",
            "completed_at",
        ]
        read_only_fields = fields

    def get_diff(self, obj):
        return build_requirement_diff(obj.base_snapshot, obj.proposal_snapshot)

    def get_review_progress(self, obj):
        assignments = list(obj.reviewer_assignments.all())
        approved = len([item for item in assignments if item.latest_opinion == RequirementReviewOpinion.APPROVED])
        rejected = len([item for item in assignments if item.latest_opinion == RequirementReviewOpinion.REJECTED])
        clarification = len(
            [item for item in assignments if item.latest_opinion == RequirementReviewOpinion.NEEDS_CLARIFICATION]
        )
        return {
            "total": len(assignments),
            "approved": approved,
            "rejected": rejected,
            "needs_clarification": clarification,
            "pending": len(assignments) - approved - rejected,
        }

    def get_can_review(self, obj):
        request = self.context.get("request")
        if not request or obj.status != RequirementChangeStatus.PENDING:
            return False
        assignment = next(
            (item for item in obj.reviewer_assignments.all() if str(item.reviewer_id) == str(request.user.id)),
            None,
        )
        return bool(
            assignment
            and assignment.latest_opinion not in {RequirementReviewOpinion.APPROVED, RequirementReviewOpinion.REJECTED}
        )


class RequirementChangeSummarySerializer(RequirementChangeSerializer):
    class Meta(RequirementChangeSerializer.Meta):
        fields = [
            "id",
            "sequence",
            "kind",
            "status",
            "name",
            "review_progress",
            "can_review",
            "created_at",
            "created_by",
            "completed_at",
        ]
        read_only_fields = fields


class RequirementListSerializer(BaseSerializer):
    module_detail = RequirementModuleLiteSerializer(source="module", read_only=True)
    parent_detail = RequirementParentLiteSerializer(source="parent", read_only=True)
    assignee_detail = UserLiteSerializer(source="assignee", read_only=True)
    reviewer_details = UserLiteSerializer(source="reviewers", many=True, read_only=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)
    sub_requirements_count = serializers.IntegerField(read_only=True, default=0)
    active_change = serializers.SerializerMethodField()
    closed_by_detail = UserLiteSerializer(source="closed_by", read_only=True)
    archived_by_detail = UserLiteSerializer(source="archived_by", read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Requirement
        fields = [
            "id",
            "product",
            "name",
            "type",
            "priority",
            "status",
            "current_version",
            "closed_at",
            "closed_by",
            "closed_by_detail",
            "closed_reason_code",
            "closed_note",
            "archived_at",
            "archived_by",
            "archived_by_detail",
            "module",
            "module_detail",
            "parent",
            "parent_detail",
            "assignee",
            "assignee_detail",
            "reviewers",
            "reviewer_details",
            "attachment_count",
            "sub_requirements_count",
            "active_change",
            "permissions",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields

    def get_active_change(self, obj):
        changes = getattr(obj, "prefetched_open_changes", None)
        change = changes[0] if changes else None
        if change is None:
            return None
        return RequirementChangeSummarySerializer(change, context=self.context).data

    def get_permissions(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        changes = getattr(obj, "prefetched_open_changes", None)
        open_change = changes[0] if changes else None
        can_manage = can_manage_requirement_lifecycle(obj, user)
        can_edit_draft = bool(
            open_change
            and open_change.status == RequirementChangeStatus.DRAFT
            and can_edit_requirement_draft(open_change, user)
        )
        can_withdraw = bool(
            open_change
            and open_change.status == RequirementChangeStatus.PENDING
            and can_edit_requirement_draft(open_change, user)
        )
        is_published = obj.status == Requirement.Status.PUBLISHED and obj.archived_at is None
        is_terminal = obj.status == Requirement.Status.CLOSED
        return {
            "can_create_revision": bool(
                obj.archived_at is None
                and obj.status in {Requirement.Status.PUBLISHED, Requirement.Status.REJECTED}
                and open_change is None
            ),
            "can_edit_draft": can_edit_draft,
            "can_submit": can_edit_draft,
            "can_withdraw": can_withdraw,
            "can_discard_draft": bool(can_edit_draft and obj.current_version > 0),
            "can_close": bool(can_manage and is_published and open_change is None),
            "can_reopen": bool(can_manage and is_terminal and obj.archived_at is None),
            "can_archive": bool(can_manage and is_terminal and obj.archived_at is None),
            "can_restore": bool(can_manage and obj.archived_at is not None),
            "can_delete": bool(user and not user.is_anonymous),
        }


class RequirementDetailSerializer(RequirementListSerializer):
    attachments = RequirementAttachmentDetailSerializer(source="requirement_attachments", many=True, read_only=True)
    latest_change = serializers.SerializerMethodField()
    open_change = serializers.SerializerMethodField()

    class Meta(RequirementListSerializer.Meta):
        fields = RequirementListSerializer.Meta.fields + [
            "description_html",
            "acceptance_criteria_html",
            "attachments",
            "latest_change",
            "open_change",
        ]
        read_only_fields = fields

    def get_latest_change(self, obj):
        changes = getattr(obj, "prefetched_changes", None)
        change = changes[0] if changes else obj.changes.first()
        if change is None:
            return None
        return RequirementChangeSerializer(change, context=self.context).data

    def get_open_change(self, obj):
        changes = getattr(obj, "prefetched_open_changes", None)
        change = changes[0] if changes else None
        if change is None:
            return None
        return RequirementChangeSerializer(change, context=self.context).data


class RequirementWriteSerializer(BaseSerializer):
    module = serializers.PrimaryKeyRelatedField(
        queryset=RequirementModule.objects.all(), required=False, allow_null=True
    )
    parent = serializers.PrimaryKeyRelatedField(queryset=Requirement.objects.all(), required=False, allow_null=True)
    assignee = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    reviewers = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False, allow_empty=True
    )
    description_html = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    acceptance_criteria_html = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    attachment_ids = serializers.ListField(child=serializers.UUIDField(), required=False, write_only=True)

    class Meta:
        model = Requirement
        fields = [
            "name",
            "priority",
            "module",
            "parent",
            "assignee",
            "reviewers",
            "description_html",
            "acceptance_criteria_html",
            "attachment_ids",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("REQUIREMENT_NAME_REQUIRED")
        return value

    def _validate_html(self, value, error_code):
        if not value:
            return value
        is_valid, _error_message, sanitized_html = validate_html_content(str(value))
        if not is_valid:
            raise serializers.ValidationError(error_code)
        return sanitized_html if sanitized_html is not None else value

    def validate_description_html(self, value):
        return self._validate_html(value, "REQUIREMENT_DESCRIPTION_INVALID_HTML")

    def validate_acceptance_criteria_html(self, value):
        return self._validate_html(value, "REQUIREMENT_ACCEPTANCE_CRITERIA_INVALID_HTML")

    def validate_module(self, value):
        if value and value.product_id != self.context["product"].id:
            raise serializers.ValidationError("REQUIREMENT_MODULE_PRODUCT_MISMATCH")
        return value

    def validate_parent(self, value):
        if value is None:
            return None
        product = self.context["product"]
        requirement_type = self.instance.type if self.instance else self.context["requirement_type"]
        if value.product_id != product.id:
            raise serializers.ValidationError("REQUIREMENT_PARENT_PRODUCT_MISMATCH")
        if requirement_type == Requirement.RequirementType.USER and value.type != Requirement.RequirementType.USER:
            raise serializers.ValidationError("REQUIREMENT_PARENT_TYPE_MISMATCH")
        if self.instance and value.id == self.instance.id:
            raise serializers.ValidationError("REQUIREMENT_PARENT_SELF_REFERENCE")

        ancestor = value
        visited = set()
        while ancestor is not None:
            if ancestor.id in visited or (self.instance and ancestor.id == self.instance.id):
                raise serializers.ValidationError("REQUIREMENT_PARENT_CYCLE")
            visited.add(ancestor.id)
            ancestor = ancestor.parent
        return value

    def _is_eligible_member(self, user):
        return is_eligible_requirement_member(self.context["product"], user)

    def validate_assignee(self, value):
        if value and not self._is_eligible_member(value):
            raise serializers.ValidationError("REQUIREMENT_ASSIGNEE_INVALID")
        return value

    def validate_reviewers(self, value):
        invalid = [user for user in value if not self._is_eligible_member(user)]
        if invalid:
            raise serializers.ValidationError("REQUIREMENT_REVIEWERS_INVALID")
        return list(dict.fromkeys(value))

    def validate_attachment_ids(self, value):
        asset_ids = list(dict.fromkeys(value))
        if not asset_ids:
            return []

        product = self.context["product"]
        request = self.context["request"]
        current_ids = set()
        if self.instance:
            current_ids = set(self.instance.requirement_attachments.values_list("asset_id", flat=True))

        assets = FileAsset.objects.filter(
            id__in=asset_ids,
            workspace=product.workspace,
            product=product,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
            is_uploaded=True,
            is_deleted=False,
        )
        matched_ids = set(assets.values_list("id", flat=True))
        if matched_ids != set(asset_ids):
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_INVALID")

        new_assets = assets.exclude(id__in=current_ids)
        reusable_asset_ids = set()
        if self.instance:
            reusable_asset_ids.update(
                FileAsset.objects.filter(
                    Q(requirement_change_attachments__change__requirement=self.instance)
                    | Q(requirement_version_attachments__version__requirement=self.instance),
                    id__in=new_assets.values("id"),
                ).values_list("id", flat=True)
            )
        if new_assets.exclude(created_by=request.user).exclude(id__in=reusable_asset_ids).exists():
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_NOT_OWNED")
        bound_requirements = RequirementAttachment.objects.filter(asset_id__in=new_assets.values("id"))
        if self.instance:
            bound_requirements = bound_requirements.exclude(requirement=self.instance)
        if bound_requirements.exists():
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_ALREADY_BOUND")
        foreign_changes = RequirementChangeAttachment.objects.filter(asset_id__in=new_assets.values("id"))
        if self.instance:
            foreign_changes = foreign_changes.exclude(change__requirement=self.instance)
        if foreign_changes.exists():
            raise serializers.ValidationError("REQUIREMENT_ATTACHMENTS_ALREADY_BOUND")
        return asset_ids

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        reviewers = validated_data.get("reviewers", [])
        attachment_ids = validated_data.get("attachment_ids", [])
        requirement = Requirement(
            product=self.context["product"],
            type=self.context["requirement_type"],
            name=validated_data["name"],
            priority=validated_data.get("priority", "none"),
            module=validated_data.get("module"),
            parent=validated_data.get("parent"),
            assignee=validated_data.get("assignee"),
            description_html=validated_data.get("description_html"),
            acceptance_criteria_html=validated_data.get("acceptance_criteria_html"),
            status=Requirement.Status.DRAFT,
            current_version=0,
        )
        requirement.save(created_by_id=request.user.id)
        create_requirement_change(
            requirement,
            {**validated_data, "reviewers": reviewers, "attachment_ids": attachment_ids},
            request.user,
            kind=RequirementChangeKind.INITIAL,
            submit_for_review=self.context.get("submit_for_review", True),
        )
        return requirement

    @transaction.atomic
    def update(self, instance, validated_data):
        draft_change = self.context.get("draft_change")
        open_change = draft_change or (
            instance.changes.filter(status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING])
            .prefetch_related("proposed_reviewers", "change_attachments")
            .first()
        )
        if open_change:
            proposed_data = proposal_data_from_change(open_change)
        else:
            proposed_data = {
                "name": instance.name,
                "priority": instance.priority,
                "module": instance.module,
                "parent": instance.parent,
                "assignee": instance.assignee,
                "reviewers": list(instance.reviewers.all()),
                "description_html": instance.description_html,
                "acceptance_criteria_html": instance.acceptance_criteria_html,
                "attachment_ids": list(instance.requirement_attachments.values_list("asset_id", flat=True)),
            }
        proposed_data.update(validated_data)
        if draft_change:
            self.change = update_requirement_draft(
                draft_change.id,
                proposed_data,
                self.context["request"].user,
            )
            if self.context.get("submit_for_review", False):
                self.change = submit_requirement_change(self.change.id, self.context["request"].user)
        else:
            self.change = create_requirement_change(
                instance,
                proposed_data,
                self.context["request"].user,
                kind=self.context.get("change_kind", RequirementChangeKind.CHANGE),
                submit_for_review=self.context.get("submit_for_review", True),
            )
        return instance


class RequirementLifecycleActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            RequirementLifecycleAction.CLOSED,
            RequirementLifecycleAction.REOPENED,
        ]
    )
    reason_code = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class RequirementLifecycleEventSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="created_by", read_only=True)

    class Meta:
        model = RequirementLifecycleEvent
        fields = [
            "id",
            "action",
            "from_status",
            "to_status",
            "reason_code",
            "note",
            "metadata",
            "change",
            "created_at",
            "created_by",
            "actor_detail",
        ]
        read_only_fields = fields


class RequirementReviewActionSerializer(serializers.Serializer):
    opinion = serializers.ChoiceField(choices=RequirementReviewOpinion.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs["reason"] = str(attrs.get("reason") or "").strip()
        if attrs["opinion"] == RequirementReviewOpinion.REJECTED and not attrs["reason"]:
            raise serializers.ValidationError({"reason": "REQUIREMENT_REJECT_REASON_REQUIRED"})
        return attrs


class RequirementVersionListSerializer(BaseSerializer):
    change_id = serializers.UUIDField(source="source_change_id", read_only=True, allow_null=True)

    class Meta:
        model = RequirementVersion
        fields = ["id", "version", "source", "change_id", "created_at", "created_by"]
        read_only_fields = fields


class RequirementVersionDetailSerializer(RequirementVersionListSerializer):
    review = serializers.SerializerMethodField()

    class Meta(RequirementVersionListSerializer.Meta):
        fields = RequirementVersionListSerializer.Meta.fields + ["snapshot", "review"]
        read_only_fields = fields

    def get_review(self, obj):
        if obj.source_change is None:
            return None
        return RequirementChangeSerializer(obj.source_change, context=self.context).data


# Backward-compatible imports for code that still uses the previous user-only names.
UserRequirementListSerializer = RequirementListSerializer
UserRequirementDetailSerializer = RequirementDetailSerializer
UserRequirementWriteSerializer = RequirementWriteSerializer
