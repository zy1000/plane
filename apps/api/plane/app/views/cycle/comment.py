import json

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from .. import BaseViewSet
from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.app.serializers import CycleCommentSerializer
from plane.bgtasks.cycle_activities_task import cycle_activity as cycle_activity_task
from plane.db.models import CycleComment


class CycleCommentViewSet(BaseViewSet):
    serializer_class = CycleCommentSerializer
    model = CycleComment

    filterset_fields = ["cycle__id", "workspace__id"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(cycle_id=self.kwargs.get("cycle_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "cycle", "actor")
            .distinct()
        )

    @allow_fine_permission(PermissionKey.SPRINTS_COMMENT_CREATE)
    def create(self, request, slug, project_id, cycle_id):
        serializer = CycleCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                cycle_id=cycle_id,
                actor=request.user,
            )
            comment_payload = {
                "id": str(serializer.data.get("id")),
                "comment_html": serializer.data.get("comment_html"),
            }
            cycle_activity_task.delay(
                type="cycle_comment.activity.created",
                requested_data=json.dumps(comment_payload),
                current_instance=None,
                cycle_id=str(cycle_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, cycle_id, pk):
        cycle_comment = CycleComment.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            cycle_id=cycle_id,
            pk=pk,
        ).first()
        if cycle_comment is None:
            return Response(
                {"error": "Comment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if cycle_comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment author can delete this comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment_snapshot = json.dumps(
            {
                "id": str(cycle_comment.id),
                "comment_html": cycle_comment.comment_html,
            }
        )
        cycle_comment.delete()
        cycle_activity_task.delay(
            type="cycle_comment.activity.deleted",
            requested_data=None,
            current_instance=comment_snapshot,
            cycle_id=str(cycle_id),
            actor_id=str(request.user.id),
            project_id=str(project_id),
            epoch=int(timezone.now().timestamp()),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
