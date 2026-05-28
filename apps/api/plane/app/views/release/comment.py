# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.permissions import (
    allow_fine_permission,
    PermissionKey,
)
from plane.app.serializers import ReleaseCommentSerializer
from plane.db.models import ReleaseComment


class ReleaseCommentViewSet(BaseViewSet):
    serializer_class = ReleaseCommentSerializer
    model = ReleaseComment

    filterset_fields = ["release__id", "workspace__id"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(release_id=self.kwargs.get("release_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "release", "actor")
            .distinct()
        )

    @allow_fine_permission(PermissionKey.RELEASES_COMMENT_CREATE)
    def create(self, request, slug, project_id, release_id):
        serializer = ReleaseCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                release_id=release_id,
                actor=request.user,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, release_id, pk):
        # 评论一经发布不可编辑；只允许作者本人删除自己的评论。
        release_comment = ReleaseComment.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            release_id=release_id,
            pk=pk,
        ).first()
        if release_comment is None:
            return Response(
                {"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if release_comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment author can delete this comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        release_comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
