"""发布活动（动态）列表接口。"""

from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import ReleaseActivitySerializer
from plane.db.models import Release, ReleaseActivity

from .. import BaseAPIView


class ReleaseActivityEndpoint(BaseAPIView):
    """GET workspaces/<slug>/projects/<project_id>/releases/<release_id>/activities/

    返回某发布下的活动记录，按 `created_at` 升序排列。支持 `?created_at__gt=` 增量拉取，
    与 IssueActivityEndpoint 保持一致。
    """

    use_read_replica = True

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        if not Release.all_objects.filter(
            pk=release_id, project_id=project_id, workspace__slug=slug
        ).exists():
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        filters = {}
        if request.GET.get("created_at__gt"):
            filters["created_at__gt"] = request.GET.get("created_at__gt")

        activities = (
            ReleaseActivity.objects.filter(
                release_id=release_id,
                workspace__slug=slug,
                project_id=project_id,
            )
            .filter(**filters)
            .select_related("actor", "workspace", "project", "release", "release_comment")
            .order_by("created_at")
        )
        serializer = ReleaseActivitySerializer(activities, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
