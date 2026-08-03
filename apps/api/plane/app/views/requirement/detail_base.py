"""明细行读写的公共入口。

产品需求的明细行与标准库的条目落在同一张 RequirementDetail 表上，分页、过滤、
插入锚点、批量冲突这些语义完全一致，区别只在三点：归属对象怎么解析、谁有权写、
字段定义从哪来。所以把 6 个 handler 提到这里，子类只填这几个钩子。
"""

import json

from django.db import transaction
from rest_framework import status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementDetailBatchSaveSerializer,
    RequirementDetailCreateSerializer,
    RequirementDetailFilterSerializer,
    RequirementDetailSerializer,
    RequirementDetailUpdateSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import RequirementDetail
from plane.utils.requirement import (
    RequirementDetailBatchConflict,
    filter_requirement_detail_ids,
)


class BaseRequirementDetailViewSet(BaseViewSet):
    model = RequirementDetail
    serializer_class = RequirementDetailSerializer

    # --- 子类必须实现 ---------------------------------------------------

    def resolve_owner(self, *, for_update=False):
        """返回这批明细的归属对象（需求或标准库）；不存在或不可见时返回 None。"""
        raise NotImplementedError

    def can_write(self, owner):
        raise NotImplementedError

    def resolve_layer(self, owner, *, for_write):
        """返回 (DetailLayer, error_response)；error_response 非 None 时直接返回它。"""
        raise NotImplementedError

    def expected_updated_at(self, owner):
        """bulk_save 的乐观锁基准 —— 字段定义变化时这个值必须跟着变。"""
        raise NotImplementedError

    # --- 公共流程 -------------------------------------------------------

    NOT_FOUND = "Requirement not found."
    FORBIDDEN = "You do not have permission to maintain this requirement."

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
        filter_serializer = RequirementDetailFilterSerializer(
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
        search = request.query_params.get("search", "")
        if search.strip() or normalized_filters:
            matching_ids = filter_requirement_detail_ids(
                fields=layer.fields,
                details=queryset,
                search=search,
                filters=normalized_filters,
            )
            queryset = queryset.filter(id__in=matching_ids)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: layer.serializer_class(
                results,
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
        serializer = RequirementDetailCreateSerializer(
            data=request.data,
            context={"owner": owner, "fields": layer.fields},
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                detail = layer.insert(
                    data=serializer.validated_data["data"],
                    actor=request.user,
                    before_id=serializer.validated_data.get("before_id"),
                    after_id=serializer.validated_data.get("after_id"),
                )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            layer.serializer_class(detail, context=layer.serializer_context).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        serializer = RequirementDetailUpdateSerializer(
            data=request.data,
            context={"owner": owner, "fields": layer.fields},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            detail = layer.queryset.select_for_update().filter(id=pk).first()
            if detail is None:
                return Response(
                    {"error": "Requirement detail not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if detail.version != serializer.validated_data["version"]:
                return Response(
                    {
                        "error": "The detail was updated by another request.",
                        "code": "REQUIREMENT_DETAIL_VERSION_CONFLICT",
                        "current_version": detail.version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            detail.data = serializer.validated_data["data"]
            detail.version += 1
            detail.updated_by = request.user
            detail.save(update_fields=["data", "version", "updated_at", "updated_by"])
        return Response(
            layer.serializer_class(detail, context=layer.serializer_context).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer, error = self.resolve_layer(owner, for_write=True)
        if error is not None:
            return error
        detail = layer.queryset.filter(id=pk).first()
        if detail is None:
            return Response(
                {"error": "Requirement detail not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        detail.delete(soft=not layer.hard_delete)
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
            detail_ids = ids_serializer.run_validation(request.data.get("ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        queryset = layer.queryset.filter(id__in=detail_ids)
        if queryset.count() != len(set(detail_ids)):
            return Response(
                {"ids": "One or more details were not found."},
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

            serializer = RequirementDetailBatchSaveSerializer(
                data=request.data,
                context={"owner": owner, "fields": layer.fields},
            )
            serializer.is_valid(raise_exception=True)
            if self.expected_updated_at(owner) != serializer.validated_data[
                "expected_updated_at"
            ]:
                return Response(
                    {
                        "error": "The requirement changed before the batch was saved.",
                        "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                        "current_updated_at": self.expected_updated_at(owner),
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
            except RequirementDetailBatchConflict as exc:
                return Response(
                    {
                        "error": "One or more requirement details changed before the batch was saved.",
                        "code": "REQUIREMENT_DETAIL_BATCH_CONFLICT",
                        "conflicts": exc.conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "detail": layer.serializer_class(
                            detail, context=layer.serializer_context
                        ).data,
                    }
                    for client_id, detail in created
                ],
                "updated": layer.serializer_class(
                    updated, many=True, context=layer.serializer_context
                ).data,
                "deleted_ids": [str(detail_id) for detail_id in deleted_ids],
            },
            status=status.HTTP_200_OK,
        )
