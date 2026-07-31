from django.db.models import Count
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement_library import RequirementLibrarySerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import RequirementLibrary, Workspace


class RequirementLibraryViewSet(BaseViewSet):
    """需求标准库：工作区级资源，权限与需求模板一致（工作区成员即可维护）。"""

    model = RequirementLibrary
    serializer_class = RequirementLibrarySerializer
    search_fields = ["name"]
    filterset_fields = {
        "template_id": ["exact"],
        "is_active": ["exact"],
    }

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related("workspace", "template", "created_by", "updated_by")
            .annotate(
                requirement_count=Count("requirements", distinct=True),
                field_count=Count("template__fields", distinct=True),
            )
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_library(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, pk):
        library = self._get_library(pk)
        if library is None:
            return Response(
                {"error": "Requirement library not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(library).data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        workspace = self.get_serializer_context().get("workspace")
        if workspace is None:
            return Response(
                {"error": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        library = serializer.save(workspace=workspace)
        return Response(
            self.get_serializer(library).data,
            status=status.HTTP_201_CREATED,
        )

    def _update(self, request, pk, partial):
        library = self._get_library(pk)
        if library is None:
            return Response(
                {"error": "Requirement library not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(
            library,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        library = serializer.save()
        return Response(self.get_serializer(library).data, status=status.HTTP_200_OK)

    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    def destroy(self, request, slug, pk):
        library = self._get_library(pk)
        if library is None:
            return Response(
                {"error": "Requirement library not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 删库会级联软删库内所有标准需求，先要求清空以免误操作
        if library.requirements.exists():
            return Response(
                {
                    "error": "Remove the standard requirements in this library first.",
                    "code": "REQUIREMENT_LIBRARY_NOT_EMPTY",
                },
                status=status.HTTP_409_CONFLICT,
            )
        library.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
