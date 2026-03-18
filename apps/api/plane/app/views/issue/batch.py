import json

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.issue import IssueBatchUpdateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.app.views import BaseAPIView
from plane.db.models import Issue, UserRecentVisit
from plane.utils.host import base_host


class IssueBatchUpdate(BaseAPIView):
    model = Issue
    queryset = Issue.objects.all()

    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        properties = request.data.get("properties", {})

        state_id = properties.get("state_id")

        queryset = self.queryset.filter(project_id=project_id, id__in=issue_ids)
        blocked = []

        for query in queryset:
            # 工作流审批检查（批量更新中仅对实际变更状态的 issue 生效）
            if state_id and str(state_id) != str(query.state_id):
                from plane.db.models import State as StateModel
                from plane.utils.workflow.transition import check_update_state_permission
                try:
                    to_state = StateModel.objects.get(pk=state_id, project_id=project_id)
                    allowed, error_msg, transition_record = check_update_state_permission(
                        issue=query,
                        to_state=to_state,
                        user=request.user,
                    )
                    if not allowed:
                        blocked.append({
                            "issue_id": str(query.id),
                            "error": error_msg,
                            "transition_record_id": str(transition_record.id) if transition_record else None,
                        })
                        continue
                except StateModel.DoesNotExist:
                    pass

            serializer = IssueBatchUpdateSerializer(instance=query, data=properties, partial=True)
            if serializer.is_valid():
                serializer.save()

        if blocked:
            return Response(
                {"workflow_blocked": True, "blocked_issues": blocked},
                status=status.HTTP_207_MULTI_STATUS,
            )
        return Response(status=status.HTTP_200_OK)

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
