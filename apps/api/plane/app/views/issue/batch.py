import json

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.issue import IssueBatchUpdateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.app.views import BaseAPIView
from plane.db.models import (
    Issue,
    IssueTransitionRecord,
    TransitionRecordStatus,
    UserRecentVisit,
)
from plane.utils.host import base_host
from plane.utils.workflow.transition import (
    cancel_issue_pending_transitions,
    capture_issue_content_snapshot,
    check_update_state_permission,
    reset_pending_transition_votes_if_content_changed,
)


class IssueBatchUpdate(BaseAPIView):
    model = Issue
    queryset = Issue.objects.all()

    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        properties = request.data.get("properties", {})

        state_id = properties.get("state_id")

        queryset = self.queryset.filter(project_id=project_id, id__in=issue_ids)
        blocked = []
        updated_issue_ids = []
        to_state = None

        if state_id:
            from plane.db.models import State as StateModel

            try:
                to_state = StateModel.objects.get(pk=state_id, project_id=project_id)
            except StateModel.DoesNotExist:
                to_state = None

        for query in queryset:
            # 工作流审批检查（批量更新中仅对实际变更状态的 issue 生效）
            if state_id and str(state_id) != str(query.state_id):
                if to_state:
                    allowed, error_msg, transition_record = check_update_state_permission(
                        issue=query,
                        to_state=to_state,
                        user=request.user,
                        project_id=project_id,
                    )
                    if not allowed:
                        blocked.append({
                            "issue_id": str(query.id),
                            "error": error_msg,
                            "transition_record_id": str(transition_record.id) if transition_record else None,
                        })
                        continue

            serializer = IssueBatchUpdateSerializer(instance=query, data=properties, partial=True)
            if serializer.is_valid():
                if state_id and str(state_id) != str(query.state_id):
                    cancel_issue_pending_transitions(
                        issue=query,
                        cancelled_by=request.user,
                        project_id=str(project_id),
                    )
                # 评审期间内容变更检测：仅在存在 PENDING 审批时捕获快照
                approval_before_snapshot = None
                if IssueTransitionRecord.objects.filter(
                    issue=query, status=TransitionRecordStatus.PENDING
                ).exists():
                    approval_before_snapshot = capture_issue_content_snapshot(issue=query)

                serializer.save()

                if approval_before_snapshot is not None:
                    query.refresh_from_db()
                    reset_pending_transition_votes_if_content_changed(
                        issue=query,
                        before_snapshot=approval_before_snapshot,
                        actor=request.user,
                        project_id=str(project_id),
                    )
                updated_issue_ids.append(str(query.id))

        if blocked:
            return Response(
                {
                    "workflow_blocked": True,
                    "blocked_issues": blocked,
                    "updated_issue_ids": updated_issue_ids,
                },
                status=status.HTTP_207_MULTI_STATUS,
            )
        return Response({"updated_issue_ids": updated_issue_ids}, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        for pk in issue_ids:
            issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
            issue.delete()
            # delete the issue from recent visits
            UserRecentVisit.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_name="issue",
            ).delete(soft=False)
            issue_activity.delay(
                type="issue.activity.deleted",
                requested_data=json.dumps({"issue_id": str(pk)}),
                actor_id=str(request.user.id),
                issue_id=str(pk),
                project_id=str(project_id),
                current_instance={},
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
                subscriber=False,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
