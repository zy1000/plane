from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.data_dictionary import (
    DataDictionaryItemSerializer,
    DataDictionarySerializer,
)
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.type import is_workspace_member
from plane.db.models import DataDictionary, DataDictionaryItem, Workspace
from plane.utils.data_dictionary import (
    ensure_system_dictionaries,
    is_dictionary_in_use,
    is_item_in_use,
)


def _forbidden():
    return Response(
        {"error": "You do not have permission to maintain data dictionaries."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _not_found(message):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def _conflict(message, code):
    return Response({"error": message, "code": code}, status=status.HTTP_409_CONFLICT)


class DataDictionaryViewSet(BaseViewSet):
    """数据字典：工作区级，读写都要求活跃工作区成员（与需求类型同口径）。"""

    model = DataDictionary
    serializer_class = DataDictionarySerializer
    search_fields = ["key", "name"]
    filterset_fields = {"is_system": ["exact"]}

    def get_queryset(self):
        # items 走模型 ordering（sort_order），前端直接按返回顺序渲染
        return (
            DataDictionary.objects.filter(workspace__slug=self.workspace_slug)
            .select_related("workspace")
            .prefetch_related("items")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(slug=self.workspace_slug).first()
        return context

    def _get_workspace(self):
        return Workspace.objects.filter(slug=self.workspace_slug).first()

    def _get_dictionary(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def list(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        workspace = self._get_workspace()
        if workspace is None:
            return _not_found("Workspace not found.")
        # 覆盖新建工作区：不做 signal，读一次就把缺的系统字典补上
        ensure_system_dictionaries(workspace)
        serializer = self.get_serializer(
            self.filter_queryset(self.get_queryset()), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        dictionary = self._get_dictionary(pk)
        if dictionary is None:
            return _not_found("Data dictionary not found.")
        return Response(self.get_serializer(dictionary).data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        workspace = self._get_workspace()
        if workspace is None:
            return _not_found("Workspace not found.")
        # 先补齐系统字典，保留 key 才会走 KEY_ALREADY_EXISTS，而不是先建出一个同 key 的自定义字典
        ensure_system_dictionaries(workspace)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dictionary = serializer.save(workspace=workspace, is_system=False)
        return Response(
            self.get_serializer(dictionary).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, slug, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        dictionary = self._get_dictionary(pk)
        if dictionary is None:
            return _not_found("Data dictionary not found.")
        serializer = self.get_serializer(dictionary, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        dictionary = self._get_dictionary(pk)
        if dictionary is None:
            return _not_found("Data dictionary not found.")
        if dictionary.is_system:
            return _conflict(
                "System dictionaries cannot be deleted.",
                "DATA_DICTIONARY_SYSTEM_PROTECTED",
            )
        if is_dictionary_in_use(dictionary):
            return _conflict(
                "This dictionary has values still in use.",
                "DATA_DICTIONARY_ITEM_IN_USE",
            )
        try:
            # 硬删（模型 delete 已强制 soft=False），级联硬删 items；Product FK 的 RESTRICT 兜并发
            dictionary.delete()
        except (ProtectedError, RestrictedError):
            return _conflict(
                "This dictionary has values still in use.",
                "DATA_DICTIONARY_ITEM_IN_USE",
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DataDictionaryItemViewSet(BaseViewSet):
    model = DataDictionaryItem
    serializer_class = DataDictionaryItemSerializer

    def _get_dictionary(self):
        return DataDictionary.objects.filter(
            workspace__slug=self.workspace_slug, pk=self.kwargs.get("dictionary_id")
        ).first()

    def get_queryset(self):
        return DataDictionaryItem.objects.filter(
            workspace__slug=self.workspace_slug,
            dictionary_id=self.kwargs.get("dictionary_id"),
        ).select_related("dictionary")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["dictionary"] = self._get_dictionary()
        return context

    def create(self, request, slug, dictionary_id):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        dictionary = self._get_dictionary()
        if dictionary is None:
            return _not_found("Data dictionary not found.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(dictionary=dictionary, workspace=dictionary.workspace)
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, dictionary_id, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        item = self.get_queryset().filter(pk=pk).first()
        if item is None:
            return _not_found("Data dictionary item not found.")
        serializer = self.get_serializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, dictionary_id, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        item = self.get_queryset().filter(pk=pk).first()
        if item is None:
            return _not_found("Data dictionary item not found.")
        if is_item_in_use(item):
            return _conflict(
                "This dictionary value is still in use.",
                "DATA_DICTIONARY_ITEM_IN_USE",
            )
        try:
            # 必须硬删：软删会被 deletion_task 当 CASCADE，把引用它的产品一起软删掉
            item.delete()
        except (ProtectedError, RestrictedError):
            return _conflict(
                "This dictionary value is still in use.",
                "DATA_DICTIONARY_ITEM_IN_USE",
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
