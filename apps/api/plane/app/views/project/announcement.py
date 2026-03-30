from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_project_permission, PermissionKey
from plane.app.serializers.project import ProjectAnnouncementListSerializer, ProjectAnnouncementCreateSerializer
from plane.app.views import BaseAPIView
from plane.db.models.project import ProjectAnnouncement
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class AnnouncementAPIView(BaseAPIView):
    model = ProjectAnnouncement
    queryset = ProjectAnnouncement.objects.all()
    pagination_class = CustomPaginator

    def get(self, request, slug: str, project_id: str) -> Response:
        query = self.queryset.filter(project_id=project_id)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        serializer = ProjectAnnouncementListSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=query.count())

    @allow_project_permission(PermissionKey.PROJECT_ANNOUNCEMENT_EDIT)
    def post(self, request, slug: str, project_id: str) -> Response:
        serializer = ProjectAnnouncementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        repository = serializer.save()
        serializer = ProjectAnnouncementListSerializer(instance=repository)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_project_permission(PermissionKey.PROJECT_ANNOUNCEMENT_EDIT)
    def delete(self, request, slug: str, project_id: str) -> Response:
        announcement_ids = request.data.pop('ids')
        self.queryset.filter(id__in=announcement_ids).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
