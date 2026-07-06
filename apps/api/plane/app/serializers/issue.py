# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from django.db import IntegrityError

# Third Party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from .user import UserLiteSerializer
from .state import StateLiteSerializer
from .project import ProjectLiteSerializer
from .workspace import WorkspaceLiteSerializer
from plane.db.models import (
    User,
    Issue,
    IssueActivity,
    IssueComment,
    ProjectUserProperty,
    IssueAssignee,
    IssueSubscriber,
    IssueLabel,
    Label,
    CycleIssue,
    Cycle,
    Module,
    ModuleIssue,
    Release,
    ReleaseIssue,
    IssueLink,
    FileAsset,
    IssueReaction,
    CommentReaction,
    IssueVote,
    IssueRelation,
    State,
    IssueVersion,
    IssueDescriptionVersion,
    ProjectMember,
    EstimatePoint, IssueType,
)
from plane.utils.content_validator import (
    validate_html_content,
    validate_binary_data,
)
from plane.utils.extra_field_value import (
    save_extra_field_values,
    serialize_extra_field_values,
    validate_extra_field_values,
)
from .issue_type import (
    IssueTypeExtraFieldSerializer,
    TypeExtraFieldValueWriteSerializer,
)


def _is_allowed_to_add_parent(parent_issue, sub_issue):
    p = parent_issue.type.name
    if isinstance(sub_issue, Issue):
        c = sub_issue.type.name
    elif isinstance(sub_issue, IssueType):
        c = sub_issue.name
    else:
        c = sub_issue
    if c == "史诗":
        return False
    if c == "用户故事":
        return p == "特性"
    if c == "特性":
        return p == "史诗"
    if c == '任务':
        return p == "用户故事" or p == "任务"
    if isinstance(sub_issue, Issue):
        sub_is_defect = getattr(sub_issue.type, 'category', None) and sub_issue.type.category.name == "缺陷"
    elif isinstance(sub_issue, IssueType):
        sub_is_defect = getattr(sub_issue, 'category', None) and sub_issue.category.name == "缺陷"
    else:
        sub_is_defect = '缺陷' in c
    if sub_is_defect:
        parent_is_defect = getattr(parent_issue.type, 'category', None) and parent_issue.type.category.name == "缺陷"
        return p == "任务" or parent_is_defect or p == '用户故事'
    return False


class IssueFlatSerializer(BaseSerializer):
    ## Contain only flat fields

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "description_json",
            "description_html",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "sort_order",
            "is_draft",
        ]


class IssueProjectLiteSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(source="project", read_only=True)

    class Meta:
        model = Issue
        fields = ["id", "project_detail", "name", "sequence_id"]
        read_only_fields = fields


##TODO: Find a better way to write this serializer
## Find a better approach to save manytomany?
class IssueCreateSerializer(BaseSerializer):
    # ids
    state_id = serializers.PrimaryKeyRelatedField(
        source="state", queryset=State.all_state_objects.all(), required=False, allow_null=True
    )
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=Issue.objects.all(), required=False, allow_null=True
    )
    type_id = serializers.PrimaryKeyRelatedField(
        source="type", queryset=IssueType.objects.all(), required=False, allow_null=True
    )
    label_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    assignee_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )
    extra_field_values = serializers.ListField(
        child=TypeExtraFieldValueWriteSerializer(),
        write_only=True,
        required=False,
    )
    project_id = serializers.UUIDField(source="project.id", read_only=True)
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = Issue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        assignee_ids = self.initial_data.get("assignee_ids")
        data["assignee_ids"] = assignee_ids if assignee_ids else []
        label_ids = self.initial_data.get("label_ids")
        data["label_ids"] = label_ids if label_ids else []
        data["extra_field_values"] = serialize_extra_field_values(instance)
        return data

    def validate(self, attrs):
        allow_triage = self.context.get("allow_triage_state", False)
        state_manager = State.triage_objects if allow_triage else State.objects

        if (
                attrs.get("start_date", None) is not None
                and attrs.get("target_date", None) is not None
                and attrs.get("start_date", None) > attrs.get("target_date", None)
        ):
            raise serializers.ValidationError("Start date cannot exceed target date")

        # Validate description content for security
        if "description_html" in attrs and attrs["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(attrs["description_html"])
            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})
            # Update the attrs with sanitized HTML if available
            if sanitized_html is not None:
                attrs["description_html"] = sanitized_html

        if "description_binary" in attrs and attrs["description_binary"]:
            is_valid, error_msg = validate_binary_data(attrs["description_binary"])
            if not is_valid:
                raise serializers.ValidationError({"description_binary": "Invalid binary data"})

        # Validate assignees are from project
        if "assignee_ids" in attrs:
            if attrs["assignee_ids"]:
                attrs["assignee_ids"] = list(
                    ProjectMember.objects.filter(
                        project_id=self.context["project_id"],
                        role__gte=15,
                        is_active=True,
                        member_id__in=attrs["assignee_ids"],
                    ).values_list("member_id", flat=True)
                )
            else:
                attrs["assignee_ids"] = []

            # 更新场景：若原工作项已存在负责人，不允许将负责人清空
            if (
                    self.instance is not None
                    and not attrs["assignee_ids"]
                    and IssueAssignee.objects.filter(
                issue=self.instance, deleted_at__isnull=True
            ).exists()
            ):
                raise serializers.ValidationError(
                    {"assignee_ids": "工作项负责人不能为空"}
                )

        # Validate labels are from project
        if attrs.get("label_ids"):
            label_ids = [label.id for label in attrs["label_ids"]]
            attrs["label_ids"] = list(
                Label.objects.filter(
                    project_id=self.context.get("project_id"),
                    id__in=label_ids,
                ).values_list("id", flat=True)
            )

        # Check state is from the project only else raise validation error
        if (
                attrs.get("state")
                and not state_manager.filter(
            project_id=self.context.get("project_id"),
            pk=attrs.get("state").id,
        ).exists()
        ):
            raise serializers.ValidationError("State is not valid please pass a valid state_id")

        # Check state belongs to the issue's type when the state is type-scoped
        if attrs.get("type") and str(attrs["type"].project_id) != str(self.context.get("project_id")):
            raise serializers.ValidationError("Issue type is not valid please pass a valid type_id")

        if attrs.get("state"):
            state = attrs["state"]
            issue_type = attrs.get("type") or (self.instance.type if self.instance else None)
            if state.issue_type_id is not None and issue_type is not None:
                if str(state.issue_type_id) != str(issue_type.id):
                    raise serializers.ValidationError("State does not belong to the issue type")

        # Check parent issue is from workspace as it can be cross workspace
        if (
                attrs.get("parent")
                and not Issue.objects.filter(
            project_id=self.context.get("project_id"),
            pk=attrs.get("parent").id,
        ).exists()
        ):
            raise serializers.ValidationError("Parent is not valid issue_id please pass a valid issue_id")

        if (
                attrs.get("estimate_point")
                and not EstimatePoint.objects.filter(
            project_id=self.context.get("project_id"),
            pk=attrs.get("estimate_point").id,
        ).exists()
        ):
            raise serializers.ValidationError("Estimate point is not valid please pass a valid estimate_point_id")

        if parent := attrs.get('parent'):
            sub_issue = self.instance.type if self.instance else attrs.get('type')
            if not _is_allowed_to_add_parent(parent_issue=parent, sub_issue=sub_issue):
                raise serializers.ValidationError(f"{parent.type.name}不能作为{sub_issue}的父工作项")

        # 校验工作项类型自定义字段值
        if "extra_field_values" in attrs or self.instance is None:
            raw_values = attrs.get("extra_field_values") or []
            issue_type = attrs.get("type") or (self.instance.type if self.instance else None)
            project_id = self.context.get("project_id") or (
                str(self.instance.project_id) if self.instance else None
            )
            issue_type_id = str(issue_type.id) if issue_type else None
            items, errors = validate_extra_field_values(
                raw_values=raw_values,
                project_id=str(project_id) if project_id else None,
                issue_type_id=issue_type_id,
                require_all=self.instance is None or not getattr(self, "partial", False),
            )
            if errors:
                raise serializers.ValidationError({"extra_field_values": errors})
            attrs["extra_field_values"] = items

        return attrs

    def create(self, validated_data):
        assignees = validated_data.pop("assignee_ids", None)
        labels = validated_data.pop("label_ids", None)
        extra_field_items = validated_data.pop("extra_field_values", None)

        project_id = self.context["project_id"]
        workspace_id = self.context["workspace_id"]
        default_assignee_id = self.context["default_assignee_id"]
        # 动态字段

        # Create Issue
        issue = Issue.objects.create(**validated_data, project_id=project_id)
        save_extra_field_values(
            issue=issue,
            items=extra_field_items or [],
            project_id=project_id,
            workspace_id=workspace_id,
            actor_id=issue.created_by_id,
        )

        # Issue Audit Users
        created_by_id = issue.created_by_id
        updated_by_id = issue.updated_by_id

        if assignees is not None and len(assignees):
            try:
                IssueAssignee.objects.bulk_create(
                    [
                        IssueAssignee(
                            assignee_id=assignee_id,
                            issue=issue,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for assignee_id in assignees
                    ],
                    batch_size=10,
                )
            except IntegrityError:
                pass
        else:
            # Then assign it to default assignee, if it is a valid assignee
            if (
                    default_assignee_id is not None
                    and ProjectMember.objects.filter(
                member_id=default_assignee_id,
                project_id=project_id,
                role__gte=15,
                is_active=True,
            ).exists()
            ):
                try:
                    IssueAssignee.objects.create(
                        assignee_id=default_assignee_id,
                        issue=issue,
                        project_id=project_id,
                        workspace_id=workspace_id,
                        created_by_id=created_by_id,
                        updated_by_id=updated_by_id,
                    )
                except IntegrityError:
                    pass

        if labels is not None and len(labels):
            try:
                IssueLabel.objects.bulk_create(
                    [
                        IssueLabel(
                            label_id=label_id,
                            issue=issue,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for label_id in labels
                    ],
                    batch_size=10,
                )
            except IntegrityError:
                pass

        return issue

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignee_ids", None)
        labels = validated_data.pop("label_ids", None)
        extra_field_items = validated_data.pop("extra_field_values", None)

        # Related models
        project_id = instance.project_id
        workspace_id = instance.workspace_id
        created_by_id = instance.created_by_id
        updated_by_id = instance.updated_by_id

        if extra_field_items is not None:
            save_extra_field_values(
                issue=instance,
                items=extra_field_items,
                project_id=project_id,
                workspace_id=workspace_id,
                actor_id=updated_by_id or created_by_id,
            )
        if assignees is not None:
            IssueAssignee.objects.filter(issue=instance).delete()
            try:
                IssueAssignee.objects.bulk_create(
                    [
                        IssueAssignee(
                            assignee_id=assignee_id,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for assignee_id in assignees
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        if labels is not None:
            IssueLabel.objects.filter(issue=instance).delete()
            try:
                IssueLabel.objects.bulk_create(
                    [
                        IssueLabel(
                            label_id=label_id,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for label_id in labels
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        # Time updation occues even when other related models are updated
        instance.updated_at = timezone.now()
        return super().update(instance, validated_data)


class IssueActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    issue_detail = IssueFlatSerializer(read_only=True, source="issue")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")
    source_data = serializers.SerializerMethodField()

    def get_source_data(self, obj):
        if hasattr(obj, "issue") and hasattr(obj.issue, "source_data") and obj.issue.source_data:
            return {
                "source": obj.issue.source_data[0].source,
                "source_email": obj.issue.source_data[0].source_email,
                "extra": obj.issue.source_data[0].extra,
            }
        return None

    class Meta:
        model = IssueActivity
        fields = "__all__"


class ProjectUserPropertySerializer(BaseSerializer):
    class Meta:
        model = ProjectUserProperty
        fields = "__all__"
        read_only_fields = ["user", "workspace", "project"]


class LabelSerializer(BaseSerializer):
    class Meta:
        model = Label
        fields = [
            "parent",
            "name",
            "color",
            "id",
            "project_id",
            "workspace_id",
            "sort_order",
        ]
        read_only_fields = ["workspace", "project"]

    def validate_name(self, value):
        project_id = self.context.get("project_id")

        label = Label.objects.filter(project_id=project_id, name__iexact=value)

        if self.instance:
            label = label.exclude(id=self.instance.pk)

        if label.exists():
            raise serializers.ValidationError(detail="LABEL_NAME_ALREADY_EXISTS")

        return value


class LabelLiteSerializer(BaseSerializer):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]


class IssueLabelSerializer(BaseSerializer):
    class Meta:
        model = IssueLabel
        fields = "__all__"
        read_only_fields = ["workspace", "project"]


class IssueRelationSerializer(BaseSerializer):
    id = serializers.UUIDField(source="related_issue.id", read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(source="related_issue.project_id", read_only=True)
    sequence_id = serializers.IntegerField(source="related_issue.sequence_id", read_only=True)
    name = serializers.CharField(source="related_issue.name", read_only=True)
    relation_type = serializers.CharField(read_only=True)
    state_id = serializers.UUIDField(source="related_issue.state.id", read_only=True)
    priority = serializers.CharField(source="related_issue.priority", read_only=True)
    assignee_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )

    class Meta:
        model = IssueRelation
        fields = [
            "id",
            "project_id",
            "sequence_id",
            "relation_type",
            "name",
            "state_id",
            "priority",
            "assignee_ids",
            "created_by",
            "created_at",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
        ]


class RelatedIssueSerializer(BaseSerializer):
    id = serializers.UUIDField(source="issue.id", read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(source="issue.project_id", read_only=True)
    sequence_id = serializers.IntegerField(source="issue.sequence_id", read_only=True)
    name = serializers.CharField(source="issue.name", read_only=True)
    relation_type = serializers.CharField(read_only=True)
    state_id = serializers.UUIDField(source="issue.state.id", read_only=True)
    priority = serializers.CharField(source="issue.priority", read_only=True)
    assignee_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )

    class Meta:
        model = IssueRelation
        fields = [
            "id",
            "project_id",
            "sequence_id",
            "relation_type",
            "name",
            "state_id",
            "priority",
            "assignee_ids",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
        ]
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
        ]


class IssueAssigneeSerializer(BaseSerializer):
    assignee_details = UserLiteSerializer(read_only=True, source="assignee")

    class Meta:
        model = IssueAssignee
        fields = "__all__"


class CycleBaseSerializer(BaseSerializer):
    class Meta:
        model = Cycle
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueCycleDetailSerializer(BaseSerializer):
    cycle_detail = CycleBaseSerializer(read_only=True, source="cycle")

    class Meta:
        model = CycleIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class ModuleBaseSerializer(BaseSerializer):
    class Meta:
        model = Module
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueModuleDetailSerializer(BaseSerializer):
    module_detail = ModuleBaseSerializer(read_only=True, source="module")

    class Meta:
        model = ModuleIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueLinkSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    class Meta:
        model = IssueLink
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "issue",
        ]

    def to_internal_value(self, data):
        # Modify the URL before validation by appending http:// if missing
        url = data.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            data["url"] = "http://" + url

        return super().to_internal_value(data)

    def validate_url(self, value):
        # Use Django's built-in URLValidator for validation
        url_validator = URLValidator()
        try:
            url_validator(value)
        except ValidationError:
            raise serializers.ValidationError({"error": "Invalid URL format."})

        return value

    # Validation if url already exists
    def create(self, validated_data):
        if IssueLink.objects.filter(url=validated_data.get("url"), issue_id=validated_data.get("issue_id")).exists():
            raise serializers.ValidationError({"error": "URL already exists for this Issue"})
        return IssueLink.objects.create(**validated_data)

    def update(self, instance, validated_data):
        if (
                IssueLink.objects.filter(url=validated_data.get("url"), issue_id=instance.issue_id)
                        .exclude(pk=instance.id)
                        .exists()
        ):
            raise serializers.ValidationError({"error": "URL already exists for this Issue"})

        return super().update(instance, validated_data)


class IssueLinkLiteSerializer(BaseSerializer):
    class Meta:
        model = IssueLink
        fields = [
            "id",
            "issue_id",
            "title",
            "url",
            "metadata",
            "created_by_id",
            "created_at",
        ]
        read_only_fields = fields


class IssueAttachmentSerializer(BaseSerializer):
    asset_url = serializers.CharField(read_only=True)

    class Meta:
        model = FileAsset
        fields = "__all__"
        read_only_fields = [
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "issue",
        ]


class IssueAttachmentLiteSerializer(DynamicBaseSerializer):
    class Meta:
        model = FileAsset
        fields = [
            "id",
            "filename",
            "attributes",
            # "issue_id",
            "created_by",
            "updated_at",
            "updated_by",
            "asset_url",
        ]
        read_only_fields = fields


class IssueReactionSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = IssueReaction
        fields = "__all__"
        read_only_fields = ["workspace", "project", "issue", "actor", "deleted_at"]


class IssueReactionLiteSerializer(DynamicBaseSerializer):
    display_name = serializers.CharField(source="actor.display_name", read_only=True)

    class Meta:
        model = IssueReaction
        fields = ["id", "actor", "issue", "reaction", "display_name"]


class CommentReactionSerializer(BaseSerializer):
    display_name = serializers.CharField(source="actor.display_name", read_only=True)

    class Meta:
        model = CommentReaction
        fields = [
            "id",
            "actor",
            "comment",
            "reaction",
            "display_name",
            "deleted_at",
            "workspace",
            "project",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "project", "comment", "actor", "deleted_at", "created_by", "updated_by"]


class IssueVoteSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = IssueVote
        fields = ["issue", "vote", "workspace", "project", "actor", "actor_detail"]
        read_only_fields = fields


class IssueCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    issue_detail = IssueFlatSerializer(read_only=True, source="issue")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")
    comment_reactions = CommentReactionSerializer(read_only=True, many=True)
    is_member = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueComment
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueStateFlatSerializer(BaseSerializer):
    state_detail = StateLiteSerializer(read_only=True, source="state")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")

    class Meta:
        model = Issue
        fields = ["id", "sequence_id", "name", "state_detail", "project_detail"]


# Issue Serializer with state details
class IssueStateSerializer(DynamicBaseSerializer):
    label_details = LabelLiteSerializer(read_only=True, source="labels", many=True)
    state_detail = StateLiteSerializer(read_only=True, source="state")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    assignee_details = UserLiteSerializer(read_only=True, source="assignees", many=True)
    sub_issues_count = serializers.IntegerField(read_only=True)
    attachment_count = serializers.IntegerField(read_only=True)
    link_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Issue
        fields = "__all__"


class IssueIntakeSerializer(DynamicBaseSerializer):
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "priority",
            "sequence_id",
            "project_id",
            "created_at",
            "label_ids",
            "created_by",
        ]
        read_only_fields = fields


class IssueSerializer(DynamicBaseSerializer):
    # ids
    cycle_id = serializers.PrimaryKeyRelatedField(read_only=True)
    module_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    release_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    # Many to many
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    assignee_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    # Count items
    sub_issues_count = serializers.IntegerField(read_only=True)
    attachment_count = serializers.IntegerField(read_only=True)
    link_count = serializers.IntegerField(read_only=True)
    type_name = serializers.CharField(read_only=True, source="type.name", allow_null=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "state_id",
            "sort_order",
            "completed_at",
            "estimate_point",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "project_id",
            "parent_id",
            "cycle_id",
            "module_ids",
            "release_ids",
            "label_ids",
            "assignee_ids",
            "sub_issues_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "attachment_count",
            "link_count",
            "is_draft",
            "archived_at",
            "type_id",
            "type_name",
        ]
        read_only_fields = fields

    def validate(self, data):
        if (
                data.get("state_id")
                and not State.objects.filter(project_id=self.context.get("project_id"),
                                             pk=data.get("state_id")).exists()
        ):
            raise serializers.ValidationError("State is not valid please pass a valid state_id")
        return data


class IssueListDetailSerializer(serializers.Serializer):
    def __init__(self, *args, **kwargs):
        # Extract expand parameter and store it as instance variable
        self.expand = kwargs.pop("expand", []) or []
        # Extract fields parameter and store it as instance variable
        self.fields = kwargs.pop("fields", []) or []
        super().__init__(*args, **kwargs)

    def get_module_ids(self, obj):
        return [module.module_id for module in obj.issue_module.all()]

    def get_release_ids(self, obj):
        if not hasattr(obj, "issue_release"):
            return []
        return [rel.release_id for rel in obj.issue_release.all() if getattr(rel, "deleted_at", None) is None]

    def get_label_ids(self, obj):
        return [label.label_id for label in obj.label_issue.all()]

    def get_assignee_ids(self, obj):
        return [assignee.assignee_id for assignee in obj.issue_assignee.all()]

    def to_representation(self, instance):
        data = {
            # Basic fields
            "id": instance.id,
            "name": instance.name,
            "state_id": instance.state_id,
            "sort_order": instance.sort_order,
            "completed_at": instance.completed_at,
            "estimate_point": instance.estimate_point_id,
            "priority": instance.priority,
            "start_date": instance.start_date,
            "target_date": instance.target_date,
            "sequence_id": instance.sequence_id,
            "project_id": instance.project_id,
            "parent_id": instance.parent_id,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
            "created_by": instance.created_by_id,
            "updated_by": instance.updated_by_id,
            "is_draft": instance.is_draft,
            "archived_at": instance.archived_at,
            # Computed fields
            "cycle_id": instance.cycle_id,
            "type_id": instance.type_id,
            "type_name": instance.type.name if instance.type else None,
            "module_ids": self.get_module_ids(instance),
            "release_ids": self.get_release_ids(instance),
            "label_ids": self.get_label_ids(instance),
            "assignee_ids": self.get_assignee_ids(instance),
            "sub_issues_count": instance.sub_issues_count,
            "attachment_count": instance.attachment_count,
            "link_count": instance.link_count,
        }

        # Handle expanded fields only when requested - using direct field access
        if self.expand:
            if "issue_relation" in self.expand:
                relations = []
                for relation in instance.issue_relation.all():
                    related_issue = relation.related_issue
                    # If the related issue is deleted, skip it
                    if not related_issue:
                        continue
                    # Add the related issue to the relations list
                    relations.append(
                        {
                            "id": related_issue.id,
                            "project_id": related_issue.project_id,
                            "sequence_id": related_issue.sequence_id,
                            "name": related_issue.name,
                            "relation_type": relation.relation_type,
                            "state_id": related_issue.state_id,
                            "priority": related_issue.priority,
                            "created_by": related_issue.created_by_id,
                            "created_at": related_issue.created_at,
                            "updated_at": related_issue.updated_at,
                            "updated_by": related_issue.updated_by_id,
                        }
                    )
                data["issue_relation"] = relations

            if "issue_related" in self.expand:
                related = []
                for relation in instance.issue_related.all():
                    issue = relation.issue
                    # If the related issue is deleted, skip it
                    if not issue:
                        continue
                    # Add the related issue to the related list
                    related.append(
                        {
                            "id": issue.id,
                            "project_id": issue.project_id,
                            "sequence_id": issue.sequence_id,
                            "name": issue.name,
                            "relation_type": relation.relation_type,
                            "state_id": issue.state_id,
                            "priority": issue.priority,
                            "created_by": issue.created_by_id,
                            "created_at": issue.created_at,
                            "updated_at": issue.updated_at,
                            "updated_by": issue.updated_by_id,
                        }
                    )
                data["issue_related"] = related

        return data


class IssueLiteSerializer(DynamicBaseSerializer):
    class Meta:
        model = Issue
        fields = ["id", "sequence_id", "project_id"]
        read_only_fields = fields


class IssueDetailSerializer(IssueSerializer):
    description_html = serializers.CharField()
    is_subscribed = serializers.BooleanField(read_only=True)
    is_intake = serializers.BooleanField(read_only=True)
    extra_field_values = serializers.SerializerMethodField()
    type_extra_fields = serializers.SerializerMethodField()

    def get_extra_field_values(self, obj):
        return serialize_extra_field_values(obj)

    def get_type_extra_fields(self, obj):
        if not obj.type_id:
            return []
        active_fields = [
            f for f in obj.type.extra_fields.all()
            if f.is_active and f.deleted_at is None
        ]
        active_fields.sort(key=lambda f: (f.sort_order or 0, f.created_at))
        return IssueTypeExtraFieldSerializer(active_fields, many=True).data

    class Meta(IssueSerializer.Meta):
        fields = IssueSerializer.Meta.fields + [
            "description_html",
            "is_subscribed",
            "is_intake",
            "extra_field_values",
            "type_extra_fields",
        ]
        read_only_fields = fields


class IssuePublicSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    state_detail = StateLiteSerializer(read_only=True, source="state")
    reactions = IssueReactionSerializer(read_only=True, many=True, source="issue_reactions")
    votes = IssueVoteSerializer(read_only=True, many=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "description_html",
            "sequence_id",
            "state",
            "state_detail",
            "project",
            "project_detail",
            "workspace",
            "priority",
            "target_date",
            "reactions",
            "votes",
        ]
        read_only_fields = fields


class IssueSubscriberSerializer(BaseSerializer):
    class Meta:
        model = IssueSubscriber
        fields = "__all__"
        read_only_fields = ["workspace", "project", "issue"]


class IssueVersionDetailSerializer(BaseSerializer):
    class Meta:
        model = IssueVersion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "parent",
            "state",
            "estimate_point",
            "name",
            "priority",
            "start_date",
            "target_date",
            "assignees",
            "sequence_id",
            "labels",
            "sort_order",
            "completed_at",
            "archived_at",
            "is_draft",
            "external_source",
            "external_id",
            "type",
            "cycle",
            "modules",
            "meta",
            "name",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "project", "issue"]


class IssueDescriptionVersionDetailSerializer(BaseSerializer):
    class Meta:
        model = IssueDescriptionVersion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "description_binary",
            "description_html",
            "description_stripped",
            "description_json",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "project", "issue"]


class IssueWithTypeSerializer(BaseSerializer):
    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "type",
            "priority",
            "assignees",
            "sequence_id",
            "state",
        ]
        depth = 1


class IssueAllSerializer(BaseSerializer):
    class Meta:
        model = Issue
        fields = '__all__'


class IssueBatchUpdateSerializer(BaseSerializer):
    state_id = serializers.PrimaryKeyRelatedField(
        source="state",
        queryset=State.all_state_objects.all(),
        required=False,
        allow_null=True,
    )
    assignee_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )
    label_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    cycle_id = serializers.PrimaryKeyRelatedField(
        queryset=Cycle.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    module_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Module.objects.all()),
        write_only=True,
        required=False,
    )
    release_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Release.objects.all()),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Issue
        fields = [
            "id",
            "state_id",
            "priority",
            "start_date",
            "target_date",
            "assignee_ids",
            "label_ids",
            "cycle_id",
            "module_ids",
            "release_ids",
        ]

    def validate(self, attrs):
        state = attrs.get("state")
        if state is not None and self.instance is not None:
            if str(state.project_id) != str(self.instance.project_id):
                raise serializers.ValidationError(
                    {"state_id": "目标状态不存在或不属于当前项目"}
                )
            if state.issue_type_id and str(state.issue_type_id) != str(self.instance.type_id):
                raise serializers.ValidationError(
                    {"state_id": "目标状态不适用于该工作项类型"}
                )

        # 更新场景：若原工作项已存在负责人，不允许将负责人清空
        if (
                "assignee_ids" in attrs
                and not attrs["assignee_ids"]
                and self.instance is not None
                and IssueAssignee.objects.filter(
            issue=self.instance, deleted_at__isnull=True
        ).exists()
        ):
            raise serializers.ValidationError(
                {"assignee_ids": "工作项负责人不能为空"}
            )
        return attrs

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignee_ids", None)
        labels = validated_data.pop("label_ids", None)
        cycle = validated_data.pop("cycle_id", None)
        modules = validated_data.pop("module_ids", None)
        releases = validated_data.pop("release_ids", None)

        project_id = instance.project_id
        workspace_id = instance.workspace_id
        created_by_id = instance.created_by_id
        updated_by_id = instance.updated_by_id

        if assignees is not None:
            IssueAssignee.objects.filter(issue=instance).delete()
            try:
                IssueAssignee.objects.bulk_create(
                    [
                        IssueAssignee(
                            assignee=assignee,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for assignee in assignees
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        if labels is not None:
            IssueLabel.objects.filter(issue=instance).delete()
            try:
                IssueLabel.objects.bulk_create(
                    [
                        IssueLabel(
                            label=label,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for label in labels
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        if cycle is not None:
            CycleIssue.objects.filter(issue=instance).delete()
            try:
                CycleIssue.objects.create(
                    cycle=cycle,
                    issue=instance,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    created_by_id=created_by_id,
                    updated_by_id=updated_by_id,
                )
            except IntegrityError:
                pass

        if modules is not None:
            ModuleIssue.objects.filter(issue=instance).delete()
            try:
                ModuleIssue.objects.bulk_create(
                    [
                        ModuleIssue(
                            module=module,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for module in modules
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        if releases is not None:
            ReleaseIssue.objects.filter(issue=instance).delete()
            try:
                ReleaseIssue.objects.bulk_create(
                    [
                        ReleaseIssue(
                            release=release,
                            issue=instance,
                            project_id=project_id,
                            workspace_id=workspace_id,
                            created_by_id=created_by_id,
                            updated_by_id=updated_by_id,
                        )
                        for release in releases
                    ],
                    batch_size=10,
                    ignore_conflicts=True,
                )
            except IntegrityError:
                pass

        instance.updated_at = timezone.now()
        return super().update(instance, validated_data)
