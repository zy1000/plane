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

        queryset = self.queryset.filter(project_id=project_id, id__in=issue_ids)
        for query in queryset:
            serializer = IssueBatchUpdateSerializer(instance=query, data=properties, partial=True)
            if serializer.is_valid():
                updated_instances = serializer.save()
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
