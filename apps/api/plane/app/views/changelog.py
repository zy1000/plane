from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers import ChangeLogReadRequestSerializer, ChangeLogSerializer
from plane.app.views.base import BaseAPIView
from plane.license.models import ChangeLog, ChangeLogRead, Instance, InstanceAdmin
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class ChangeLogListCreateEndpoint(BaseAPIView):
    queryset = ChangeLog.objects.all()
    pagination_class = CustomPaginator

    def _is_instance_admin(self, request):
        instance = Instance.objects.first()
        if not instance:
            return False
        return InstanceAdmin.objects.filter(instance=instance, user=request.user).exists()

    def get(self, request):
        queryset = self.queryset.filter(is_active=True)
        search = request.GET.get("search")
        update_type = request.GET.get("update_type")
        include_inactive = request.GET.get("include_inactive") == "true"

        if include_inactive and self._is_instance_admin(request):
            queryset = self.queryset.all()

        if update_type:
            queryset = queryset.filter(update_type=update_type)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(summary__icontains=search)
                | Q(description__icontains=search)
                | Q(content__icontains=search)
                | Q(version__icontains=search)
            )

        queryset = queryset.order_by("-is_pinned", "-release_date", "-created_at")
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(queryset, request)
        serializer = ChangeLogSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=queryset.count())

    def post(self, request):
        if not self._is_instance_admin(request):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ChangeLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changelog = serializer.save()
        return Response(ChangeLogSerializer(changelog).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        if not self._is_instance_admin(request):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        ids = request.data.get("ids", [])
        if not ids:
            return Response({"error": "ids are required"}, status=status.HTTP_400_BAD_REQUEST)

        self.queryset.filter(id__in=ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangeLogLatestEndpoint(BaseAPIView):
    queryset = ChangeLog.objects.all()

    def get(self, request):
        queryset = self.queryset.filter(is_active=True).filter(
            Q(release_date__isnull=True) | Q(release_date__lte=timezone.now())
        )
        changelog = queryset.order_by("-is_pinned", "-release_date", "-created_at").first()
        if not changelog:
            return Response(status=status.HTTP_204_NO_CONTENT)

        serialized_data = ChangeLogSerializer(changelog).data
        serialized_data["is_read"] = ChangeLogRead.objects.filter(changelog=changelog, user=request.user).exists()
        return Response(serialized_data, status=status.HTTP_200_OK)


class ChangeLogReadEndpoint(BaseAPIView):
    queryset = ChangeLog.objects.all()

    def post(self, request):
        serializer = ChangeLogReadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        changelog = self.queryset.filter(id=serializer.validated_data["changelog_id"]).first()
        if not changelog:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)

        ChangeLogRead.objects.get_or_create(changelog=changelog, user=request.user)
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class ChangeLogDetailEndpoint(BaseAPIView):
    queryset = ChangeLog.objects.all()

    def _is_instance_admin(self, request):
        instance = Instance.objects.first()
        if not instance:
            return False
        return InstanceAdmin.objects.filter(instance=instance, user=request.user).exists()

    def get(self, request, pk):
        changelog = self.queryset.filter(id=pk, is_active=True).first()
        if not changelog:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ChangeLogSerializer(changelog).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        if not self._is_instance_admin(request):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        changelog = self.queryset.filter(id=pk).first()
        if not changelog:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ChangeLogSerializer(changelog, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changelog = serializer.save()
        return Response(ChangeLogSerializer(changelog).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        if not self._is_instance_admin(request):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        changelog = self.queryset.filter(id=pk).first()
        if not changelog:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)

        changelog.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
