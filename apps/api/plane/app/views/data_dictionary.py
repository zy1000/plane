from django.db import transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import serializers as drf_serializers
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
    bulk_create_items,
    classify_labels,
    dictionary_item_usage,
    ensure_system_dictionaries,
    is_dictionary_in_use,
    is_item_in_use,
)

# 一次批量新增最多接收的行数（前端粘贴多行）
BULK_LABELS_MAX = 1000


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

    def usage(self, request, slug, pk):
        """设置页「引用」列：每个值被多少活跃产品 / 项目引用，以及是否会挡住删除。"""
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        dictionary = self._get_dictionary(pk)
        if dictionary is None:
            return _not_found("Data dictionary not found.")
        return Response(dictionary_item_usage(dictionary), status=status.HTTP_200_OK)


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

    def bulk_create(self, request, slug, dictionary_id):
        """多行粘贴批量新增：归一化后只写不存在的值；重名走 skipped 而不是报错。"""
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        field = drf_serializers.ListField(
            child=drf_serializers.CharField(allow_blank=True, trim_whitespace=False, max_length=10000),
            allow_empty=False,
            max_length=BULK_LABELS_MAX,
        )
        raw_labels = request.data.get("labels")
        if isinstance(raw_labels, list):
            # DRF 的 CharField 直接拒绝 NUL 字符；粘贴进来的脏字节先剥掉，别让一行废掉整批
            raw_labels = [value.replace("\x00", "") if isinstance(value, str) else value for value in raw_labels]
        try:
            raw_labels = field.run_validation(raw_labels)
        except drf_serializers.ValidationError as exc:
            return Response({"labels": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        labels, skipped = classify_labels(raw_labels)
        with transaction.atomic():
            # 行锁把并发的批量 / 单条新增串行化，created 才能按差集精确计数；of=self 只锁字典行不锁 workspace
            dictionary = (
                DataDictionary.objects.select_for_update(of=("self",))
                .filter(workspace__slug=slug, pk=dictionary_id)
                .first()
            )
            if dictionary is None:
                return _not_found("Data dictionary not found.")
            created, existing = bulk_create_items(dictionary, labels, actor=request.user)
        skipped.extend({"label": label, "reason": "existing"} for label in existing)
        blank = sum(1 for entry in skipped if entry["reason"] == "blank")
        too_long = sum(1 for entry in skipped if entry["reason"] == "too_long")
        return Response(
            {
                "created": DataDictionaryItemSerializer(created, many=True).data,
                "skipped": skipped,
                "summary": {
                    "requested": len(raw_labels),
                    "created": len(created),
                    "skipped_existing": len(existing),
                    "skipped_blank": blank,
                    "skipped_too_long": too_long,
                },
            },
            status=status.HTTP_201_CREATED,
        )

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
