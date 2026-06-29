# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import CaseReviewRecord, CaseReviewThrough
from plane.utils.profile_metrics import PROFILE_METRIC_KEYS


class WorkspaceUserMetricQuerySerializer(serializers.Serializer):
    project_id = serializers.UUIDField(required=False)
    plan_id = serializers.UUIDField(required=False)
    review_id = serializers.UUIDField(required=False)
    page = serializers.IntegerField(default=1, min_value=1)
    page_size = serializers.IntegerField(default=20, min_value=1, max_value=100)

    def validate(self, attrs):
        metric = self.context["metric"]
        if metric not in PROFILE_METRIC_KEYS:
            raise serializers.ValidationError({"metric": "Unsupported profile metric."})
        if attrs.get("plan_id") and metric != "pending_execution_cases":
            raise serializers.ValidationError({"plan_id": "This filter is not supported for the selected metric."})
        if attrs.get("review_id") and metric != "pending_review_cases":
            raise serializers.ValidationError({"review_id": "This filter is not supported for the selected metric."})
        if attrs.get("plan_id") and attrs.get("review_id"):
            raise serializers.ValidationError("plan_id and review_id cannot be used together.")
        return attrs


def _project_data(project):
    return {
        "id": project.id,
        "name": project.name,
        "identifier": project.identifier,
    }


def _user_data(user):
    if not user:
        return None
    return {
        "id": user.id,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
    }


class WorkspaceUserMetricItemSerializer(serializers.Serializer):
    def to_representation(self, instance):
        metric = self.context["metric"]

        if metric in {
            "today_pending_issues",
            "week_pending_issues",
            "overdue_issues",
            "unscheduled_pending_issues",
            "pending_approval_issues",
            "assigned_issues",
            "created_issues",
            "subscribed_issues",
        }:
            target_state = None
            if metric == "pending_approval_issues" and getattr(instance, "approval_to_state_id", None):
                target_state = {
                    "id": instance.approval_to_state_id,
                    "name": instance.approval_to_state_name,
                    "color": instance.approval_to_state_color,
                }
            return {
                "entity_type": "work_item",
                "id": instance.id,
                "title": instance.name,
                "sequence_id": instance.sequence_id,
                "project": _project_data(instance.project),
                "state": {
                    "id": instance.state_id,
                    "name": instance.state.name,
                    "group": instance.state.group,
                    "color": instance.state.color,
                }
                if instance.state_id
                else None,
                "priority": instance.priority,
                "target_date": instance.target_date,
                "approval_to_state": target_state,
            }

        if metric == "responsible_cycles":
            return {
                "entity_type": "cycle",
                "id": instance.id,
                "title": instance.name,
                "project": _project_data(instance.project),
                "status": instance.status,
                "owner": _user_data(instance.owned_by),
                "start_date": instance.start_date,
                "end_date": instance.end_date,
            }

        if metric == "responsible_releases":
            return {
                "entity_type": "release",
                "id": instance.id,
                "title": instance.name,
                "project": _project_data(instance.project),
                "status": instance.status,
                "owner": _user_data(instance.lead),
                "start_date": instance.start_date,
                "end_date": instance.target_date,
            }

        if metric == "pending_execution_cases":
            return {
                "entity_type": "execution_case",
                "id": instance.id,
                "case_id": instance.case_id,
                "code": instance.case.code,
                "title": instance.case.name,
                "project": _project_data(instance.plan.project),
                "plan": {"id": instance.plan_id, "name": instance.plan.name},
                "priority": instance.case.get_priority_display(),
                "assignee": _user_data(instance.assignee),
                "result": instance.result,
            }

        personal_review_status = getattr(instance, "personal_review_status", None)
        return {
            "entity_type": "review_case",
            "id": instance.id,
            "case_id": instance.case_id,
            "code": instance.case.code,
            "title": instance.case.name,
            "project": _project_data(instance.review.project),
            "review": {"id": instance.review_id, "name": instance.review.name},
            "priority": instance.case.get_priority_display(),
            "personal_review_status": personal_review_status or CaseReviewThrough.Result.NOT_START,
            "is_re_review": personal_review_status == CaseReviewRecord.Result.RE_REVIEW,
        }
