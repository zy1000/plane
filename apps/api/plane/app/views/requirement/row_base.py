"""需求行读写的公共入口。

产品需求与标准库的条目落在同一张 Requirement 表上，分页、过滤、插入锚点、批量
冲突这些语义完全一致，区别只在三点：归属对象怎么解析、谁有权写、字段定义从哪来。
所以把 6 个 handler 提到这里，子类只填这几个钩子。
"""

import json

from django.db import transaction
from rest_framework import status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementBatchSaveSerializer,
    RequirementCreateSerializer,
    RequirementFilterSerializer,
    RequirementImportSerializer,
    RequirementSerializer,
    RequirementUpdateSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Requirement
from plane.utils.requirement import (
    RequirementBatchConflict,
    builtin_ids_from_specs,
    filter_requirement_row_ids,
    split_builtin_values,
)


class BaseRequirementRowViewSet(BaseViewSet):
    model = Requirement
    serializer_class = RequirementSerializer

    # --- 子类必须实现 ---------------------------------------------------

    def resolve_owner(self, *, for_update=False):
        """返回这批需求行的归属对象（基线或标准库）；不存在或不可见时返回 None。"""
        raise NotImplementedError

    def can_write(self, owner):
        raise NotImplementedError

    def resolve_layer(self, owner, *, for_write):
        """返回 (RowLayer, error_response)；error_response 非 None 时直接返回它。"""
        raise NotImplementedError

    # --- 公共流程 -------------------------------------------------------

    NOT_FOUND = "Requirement not found."
    FORBIDDEN = "You do not have permission to maintain these requirements."

    def _owner_or_error(self, *, for_update=False, require_write=True):
        """返回 (owner, error_response)。"""
        owner = self.resolve_owner(for_update=for_update)
        if owner is None:
            return None, Response(
                {"error": self.NOT_FOUND},
                status=status.HTTP_404_NOT_FOUND,
            )
        if require_write and not self.can_write(owner):
            return None, Response(
                {"error": self.FORBIDDEN},
                status=status.HTTP_403_FORBIDDEN,
            )
        return owner, None

    def list(self, request, *args, **kwargs):
        owner, error = self._owner_or_error(require_write=False)
        if error is not None:
            return error

        raw_filters = request.query_params.get("filters", "[]")
        try:
            filter_payload = json.loads(raw_filters)
        except (TypeError, ValueError, json.JSONDecodeError):
            return Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(filter_payload, list):
            return Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        layer, error = self.resolve_layer(owner, for_write=False)
        if error is not None:
            return error
        filter_serializer = RequirementFilterSerializer(
            data=filter_payload,
            many=True,
            context={"owner": owner, "fields": layer.fields},
        )
        filter_serializer.is_valid(raise_exception=True)
        normalized_filters = [
            {
                "field_id": str(item["field_id"]),
                "operator": item["operator"],
                **({"value": item.get("value")} if "value" in item else {}),
            }
            for item in filter_serializer.validated_data
        ]

        queryset = layer.queryset
        # 按需求类型切视图必须在服务端过滤 —— 条目是游标分页的，前端拿到的只是一页
        requirement_type_id = request.query_params.get("requirement_type_id")
        if requirement_type_id:
            queryset = queryset.filter(requirement_type_id=requirement_type_id)

        search = request.query_params.get("search", "")
        if search.strip() or normalized_filters:
            matching_ids = filter_requirement_row_ids(
                fields=layer.fields,
                rows=queryset,
                search=search,
                filters=normalized_filters,
                fields_by_requirement_type=layer.fields_by_requirement_type,
            )
            queryset = queryset.filter(id__in=matching_ids)
        return self.paginate(
            request=request,
            queryset=queryset,
            # 变更标记只对当前这一页算，成本不随总行数增长
            on_results=lambda results: layer.serializer_class(
                layer.annotate_change_kind(results),
                many=True,
                context=layer.serializer_context,
            ).data,
            default_per_page=20,
            max_per_page=100,
        )

    def create(self, request, *args, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        serializer = RequirementCreateSerializer(
            data=request.data,
            context={
                "owner": owner,
                "requirement_type_resolver": layer.requirement_type_resolver,
                "default_requirement_type_id": layer.default_requirement_type_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                row = layer.insert(
                    data=serializer.validated_data["data"],
                    requirement_type_id=serializer.validated_data["requirement_type_id"],
                    actor=request.user,
                    before_id=serializer.validated_data.get("before_id"),
                    after_id=serializer.validated_data.get("after_id"),
                )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            layer.serializer_class(
                layer.annotate_change_kind([row])[0],
                context=layer.serializer_context,
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        # 先取这一行绑定的需求类型 —— data 要按它自己的字段校验，而不是全部类型的并集
        row_requirement_type_id = (
            layer.queryset.filter(id=pk).values_list("requirement_type_id", flat=True).first()
        )
        if row_requirement_type_id is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        specs = layer.requirement_type_resolver.specs(row_requirement_type_id)
        serializer = RequirementUpdateSerializer(
            data=request.data,
            context={"owner": owner, "fields": specs},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            row = layer.queryset.select_for_update().filter(id=pk).first()
            if row is None:
                return Response(
                    {"error": "Requirement not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if row.version != serializer.validated_data["version"]:
                return Response(
                    {
                        "error": "The requirement was updated by another request.",
                        "code": "REQUIREMENT_VERSION_CONFLICT",
                        "current_version": row.version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            columns, custom_data = split_builtin_values(
                serializer.validated_data["data"], builtin_ids_from_specs(specs)
            )
            row.title = columns["title"]
            row.description_html = columns["description_html"]
            row.data = custom_data
            row.version += 1
            row.updated_by = request.user
            row.save(
                update_fields=[
                    "title",
                    "description_html",
                    "data",
                    "version",
                    "updated_at",
                    "updated_by",
                ]
            )
        return Response(
            layer.serializer_class(
                layer.annotate_change_kind([row])[0],
                context=layer.serializer_context,
            ).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        row = layer.queryset.filter(id=pk).first()
        if row is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        row.delete(soft=not layer.hard_delete)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_destroy(self, request, *args, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        ids_serializer = drf_serializers.ListField(
            child=drf_serializers.UUIDField(), allow_empty=False
        )
        try:
            row_ids = ids_serializer.run_validation(request.data.get("ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        queryset = layer.queryset.filter(id__in=row_ids)
        if queryset.count() != len(set(row_ids)):
            return Response(
                {"ids": "One or more requirements were not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset.delete(soft=not layer.hard_delete)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_save(self, request, *args, **kwargs):
        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            layer, error = self.resolve_layer(owner, for_write=True)
            if error is not None:
                return error

            serializer = RequirementBatchSaveSerializer(
                data=request.data,
                context={
                    "owner": owner,
                    "requirement_type_resolver": layer.requirement_type_resolver,
                    "default_requirement_type_id": layer.default_requirement_type_id,
                    # 每行按自己绑定的需求类型校验
                    "row_requirement_types": dict(
                        layer.queryset.values_list("id", "requirement_type_id")
                    ),
                },
            )
            serializer.is_valid(raise_exception=True)
            if layer.expected_updated_at != serializer.validated_data[
                "expected_updated_at"
            ]:
                return Response(
                    {
                        "error": "The requirements changed before the batch was saved.",
                        "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                        "current_updated_at": layer.expected_updated_at,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            try:
                created, updated, deleted_ids = layer.save_batch(
                    creates=serializer.validated_data["creates"],
                    updates=serializer.validated_data["updates"],
                    deletes=serializer.validated_data["deletes"],
                    actor=request.user,
                )
            except RequirementBatchConflict as exc:
                return Response(
                    {
                        "error": "One or more requirements changed before the batch was saved.",
                        "code": "REQUIREMENT_BATCH_CONFLICT",
                        "conflicts": exc.conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        layer.annotate_change_kind([row for _, row in created] + list(updated))
        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "requirement": layer.serializer_class(
                            row, context=layer.serializer_context
                        ).data,
                    }
                    for client_id, row in created
                ],
                "updated": layer.serializer_class(
                    updated, many=True, context=layer.serializer_context
                ).data,
                "deleted_ids": [str(row_id) for row_id in deleted_ids],
            },
            status=status.HTTP_200_OK,
        )

    def import_from_library(self, request, *args, **kwargs):
        """把标准库里的条目导入成本作用域的需求行。

        走的是和其它写入完全一样的分派：需要时自动开工作副本，排序与锁复用
        save_batch 那一套，所以这里不需要任何特殊处理。
        """
        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            layer, error = self.resolve_layer(owner, for_write=True)
            if error is not None:
                return error

            serializer = RequirementImportSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            library = self.resolve_library(serializer.validated_data["library_id"])
            if library is None:
                return Response(
                    {"error": "Requirement library not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            try:
                created, _, _ = layer.import_items(
                    library=library,
                    item_ids=serializer.validated_data["item_ids"],
                    actor=request.user,
                    before_id=serializer.validated_data.get("before_id"),
                    after_id=serializer.validated_data.get("after_id"),
                )
            except ValueError as exc:
                return Response(
                    {"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST
                )

        layer.annotate_change_kind([row for _, row in created])
        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "requirement": layer.serializer_class(
                            row, context=layer.serializer_context
                        ).data,
                    }
                    for client_id, row in created
                ],
                "updated": [],
                "deleted_ids": [],
                # 引用的需求类型集合可能变大了，前端据此决定要不要重取 configuration
                "requirement_type_id": str(library.requirement_type_id),
            },
            status=status.HTTP_201_CREATED,
        )

    def resolve_library(self, library_id):
        """导入源标准库；只有产品需求的入口支持导入。"""
        raise NotImplementedError
