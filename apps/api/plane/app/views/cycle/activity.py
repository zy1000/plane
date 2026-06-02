"""迭代活动（动态）列表接口。"""

from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import CycleActivitySerializer
from plane.db.models import Cycle, CycleActivity

from .. import BaseAPIView


class CycleActivityEndpoint(BaseAPIView):
    """GET workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/activities/"""

    use_read_replica = True

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        if not Cycle.all_objects.filter(
            pk=cycle_id,
            project_id=project_id,
            workspace__slug=slug,
        ).exists():
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        filters = {}
        if request.GET.get("created_at__gt"):
            filters["created_at__gt"] = request.GET.get("created_at__gt")

        activities = (
            CycleActivity.objects.filter(
                cycle_id=cycle_id,
                workspace__slug=slug,
                project_id=project_id,
            )
            .filter(**filters)
            .select_related("actor", "workspace", "project", "cycle", "cycle_comment")
            .order_by("created_at")
        )
        serializer = CycleActivitySerializer(activities, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
