from rest_framework import serializers

from plane.db.models import Milestone, Issue, StateGroup
from plane.app.serializers.project import ProjectLiteSerializer


class MilestoneListSerializer(serializers.ModelSerializer):
    completion_rate = serializers.SerializerMethodField()
    state_color = serializers.SerializerMethodField()

    def to_representation(self, instance):
        instance.update_state()
        return super().to_representation(instance)

    def get_state_color(self, obj: Milestone):
        return obj.STATE_COLOR_MAP.get(obj.state, 'gray')

    def get_completion_rate(self, obj: Milestone):
        all_count = obj.issues.count()
        if all_count == 0:
            return '0%'
        return f"{int(obj.issues.filter(state__group=StateGroup.COMPLETED).count() / all_count * 100)}%"

    class Meta:
        model = Milestone
        fields = ['id', 'name', 'description', 'start_date', 'end_date', 'completion_rate', 'state', 'state_color']


class MilestoneCreateUpdateSerializer(serializers.ModelSerializer):
    issues = serializers.PrimaryKeyRelatedField(queryset=Issue.objects.all(), many=True, required=False)

    def create(self, validated_data):
        issues = validated_data.pop('issues', [])
        instance = super().create(validated_data)
        if issues:
            instance.issues.set(issues)
        return instance

    def update(self, instance, validated_data):
        issues = validated_data.pop('issues', None)
        instance = super().update(instance, validated_data)
        if issues is not None:
            instance.issues.set(issues)
        return instance

    class Meta:
        model = Milestone
        fields = ['name', 'description', 'start_date', 'end_date', 'issues', 'project', 'state']


class MilestoneIssueListSerializer(serializers.ModelSerializer):
    project_detail = ProjectLiteSerializer(source="project", read_only=True)
    cycle_id = serializers.SerializerMethodField()
    module_ids = serializers.SerializerMethodField()
    label_ids = serializers.SerializerMethodField()
    assignee_ids = serializers.SerializerMethodField()
    sub_issues_count = serializers.IntegerField(read_only=True, required=False, default=0)
    attachment_count = serializers.IntegerField(read_only=True, required=False, default=0)
    link_count = serializers.IntegerField(read_only=True, required=False, default=0)

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
            "project_detail",
            "parent_id",
            "cycle_id",
            "module_ids",
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
        ]
        read_only_fields = fields

    def get_cycle_id(self, obj: Issue):
        if not hasattr(obj, "issue_cycle"):
            return None
        for rel in obj.issue_cycle.all():
            if getattr(rel, "deleted_at", None) is None:
                return rel.cycle_id
        return None

    def get_module_ids(self, obj: Issue):
        if not hasattr(obj, "issue_module"):
            return []
        return [rel.module_id for rel in obj.issue_module.all() if getattr(rel, "deleted_at", None) is None]

    def get_label_ids(self, obj: Issue):
        if not hasattr(obj, "label_issue"):
            return []
        return [rel.label_id for rel in obj.label_issue.all() if getattr(rel, "deleted_at", None) is None]

    def get_assignee_ids(self, obj: Issue):
        if not hasattr(obj, "issue_assignee"):
            return []
        return [rel.assignee_id for rel in obj.issue_assignee.all() if getattr(rel, "deleted_at", None) is None]
