"""需求行读写的公共入口。

产品需求与标准库的条目落在同一张 Requirement 表上，分页、过滤、插入锚点、批量冲突
这些语义完全一致，区别只在三点：归属对象怎么解析、谁有权写、字段定义从哪来。所以把
这几个 handler 提到这里，子类只填这几个钩子。

**只读是行级的**：一条需求能不能写只看它自己在不在评审中
（Requirement.pending_change_item），不再有产品级的冻结闸门。这是「审批下沉到条目」
最直接的表现 —— A 提交了需求 A 的评审，B 照样可以改需求 B。
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
from plane.db.models import Requirement, RequirementItemStatus
from plane.utils.requirement import (
    BUILTIN_COLUMNS,
    RequirementBatchConflict,
    filter_requirement_row_ids,
    requirement_content_values,
    resync_approved_row_version,
    row_was_approved,
    source_library_identifier_map,
)


IN_REVIEW_MESSAGE = "This requirement is under review and is read-only."
DELETE_NEEDS_APPROVAL_MESSAGE = (
    "Deleting an approved requirement needs approval. Submit a delete review instead."
)


def annotate_pending(queryset):
    """把待审变更项的两个标量拉平到行上。

    不用 select_related —— 变更项上挂着两份完整行快照，join 进来会让每页多拖几百 KB。
    """
    from django.db.models import F

    return queryset.annotate(
        pending_change_type=F("pending_change_item__change_type"),
        pending_change_request_id=F("pending_change_item__change_request_id"),
        pending_change_submitted_by=F("pending_change_item__change_request__created_by"),
    )


class BaseRequirementRowViewSet(BaseViewSet):
    model = Requirement
    serializer_class = RequirementSerializer

    # --- 子类必须实现 ---------------------------------------------------

    def resolve_owner(self, *, for_update=False):
        """返回这批需求行的归属对象（审批配置或标准库）；不存在或不可见时返回 None。"""
        raise NotImplementedError

    def can_write(self, owner):
        raise NotImplementedError

    def resolve_layer(self, owner):
        """返回 RowLayer。不再有只读分支 —— 闸门下沉到了每一行。"""
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

    def _serializer_context(self, layer, owner):
        return {
            **layer.serializer_context,
            "request": self.request,
            "can_write": self.can_write(owner),
        }

    def _row_context(self, layer, owner, rows):
        """给一批行准备序列化 context：作用域前缀（来自 layer）+ 来源库前缀。

        任何要吐 RequirementSerializer 的地方都走这个方法，不要直接用
        _serializer_context —— 后者不含来源库前缀，source_display_id 会静默返回
        None（不报错，只是编号消失）。
        """
        return {
            **self._serializer_context(layer, owner),
            "source_library_identifiers": source_library_identifier_map(rows),
        }

    @staticmethod
    def _locked_response(row_ids, *, change_request_id=None):
        payload = {
            "error": IN_REVIEW_MESSAGE,
            "code": "REQUIREMENT_IN_REVIEW",
            "requirement_ids": [str(row_id) for row_id in row_ids],
        }
        if change_request_id:
            payload["pending_change_request_id"] = str(change_request_id)
        return Response(payload, status=status.HTTP_409_CONFLICT)

    @staticmethod
    def _delete_needs_approval_response(row_ids):
        return Response(
            {
                "error": DELETE_NEEDS_APPROVAL_MESSAGE,
                "code": "REQUIREMENT_DELETE_NEEDS_APPROVAL",
                "requirement_ids": [str(row_id) for row_id in row_ids],
            },
            status=status.HTTP_409_CONFLICT,
        )

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

        layer = self.resolve_layer(owner)
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

        # 按 id 直取：父项选择器要回显一个可能不在当前页、也不在搜索结果里的行，
        # 需求详情也走这条路（后端没有 retrieve 端点）。
        raw_ids = request.query_params.get("ids")
        if raw_ids:
            try:
                row_ids = drf_serializers.ListField(
                    child=drf_serializers.UUIDField()
                ).run_validation([item for item in raw_ids.split(",") if item])
            except drf_serializers.ValidationError as exc:
                return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(id__in=row_ids)

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
            queryset=annotate_pending(queryset),
            on_results=lambda results: RequirementSerializer(
                results, many=True, context=self._row_context(layer, owner, results)
            ).data,
            default_per_page=20,
            max_per_page=100,
        )

    def create(self, request, *args, **kwargs):
        """新增永不设闸门 —— 新行恒为草稿态，没有已批准内容需要保护。

        整个方法体在一个事务里，**第一件事**就是拿作用域写锁（产品是审批配置行，
        标准库是库行）：sequence_id 用 Max+1 取号，没有这把锁，两个并发的单条创建会
        拿到同一个号然后撞 req_unique_*_sequence。锁的顺序与 bulk_save /
        import_from_library 一致（owner 行 → requirements 行），所以不会与它们死锁。

        校验留在锁内是刻意的 —— 与 bulk_save 现有写法一致。挪到锁外要多跑一遍
        resolve_layer，代价更大，而且两次解析出的 owner 可能不一致。
        """
        try:
            with transaction.atomic():
                owner, error = self._owner_or_error(for_update=True)
                if error is not None:
                    return error
                layer = self.resolve_layer(owner)
                serializer = RequirementCreateSerializer(
                    data=request.data,
                    context={
                        "owner": owner,
                        "parent_queryset": layer.queryset,
                        "requirement_type_resolver": layer.requirement_type_resolver,
                        "default_requirement_type_id": layer.default_requirement_type_id,
                    },
                )
                serializer.is_valid(raise_exception=True)
                builtin = dict(serializer.validated_data["builtin"])
                # 新行一律从草稿开始，客户端传什么状态都不算数（DB 约束也这么要求）
                builtin["status"] = RequirementItemStatus.DRAFT
                row = layer.insert(
                    data=serializer.validated_data["data"],
                    builtin=builtin,
                    requirement_type_id=serializer.validated_data["requirement_type_id"],
                    actor=request.user,
                    before_id=serializer.validated_data.get("before_id"),
                    after_id=serializer.validated_data.get("after_id"),
                )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            RequirementSerializer(
                row, context=self._row_context(layer, owner, [row])
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
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
        with transaction.atomic():
            row = layer.queryset.select_for_update().filter(id=pk).first()
            if row is None:
                return Response(
                    {"error": "Requirement not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # 闸门就放在已经锁住的这一行上，零额外查询
            if row.pending_change_item_id:
                return self._locked_response(
                    [row.id],
                    change_request_id=row.pending_change_item.change_request_id,
                )

            serializer = RequirementUpdateSerializer(
                data=request.data,
                context={
                    "owner": owner,
                    "fields": specs,
                    "parent_queryset": layer.queryset,
                    "row_id": pk,
                    "current_row": row,
                },
            )
            serializer.is_valid(raise_exception=True)
            if row.version != serializer.validated_data["version"]:
                return Response(
                    {
                        "error": "The requirement was updated by another request.",
                        "code": "REQUIREMENT_VERSION_CONFLICT",
                        "current_version": row.version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            # 前快照与 was_approved 都要在改动之前抓，且用这个 select_for_update 到的实例
            before = requirement_content_values(row)
            was_approved = row_was_approved(row)
            for column, value in serializer.validated_data["builtin"].items():
                setattr(row, column, value)
            row.data = serializer.validated_data["data"]
            row.version += 1
            row.updated_by = request.user
            resync_approved_row_version(row, before=before, was_approved=was_approved)
            row.save(
                update_fields=[
                    *BUILTIN_COLUMNS,
                    "data",
                    "version",
                    "approved_row_version",
                    "updated_at",
                    "updated_by",
                ]
            )
        return Response(
            RequirementSerializer(
                row, context=self._row_context(layer, owner, [row])
            ).data,
            status=status.HTTP_200_OK,
        )

    def _check_deletable(self, rows):
        """返回 error_response 或 None。

        草稿直接删，已通过审批的要走评审 —— 从未通过审批的行没有任何已批准内容需要
        保护，为它拉一轮审批只会让人在录入阶段失去耐心。
        """
        locked = [row.id for row in rows if row.pending_change_item_id]
        if locked:
            return self._locked_response(locked)
        approved = [row.id for row in rows if row.approved_version is not None]
        if approved:
            return self._delete_needs_approval_response(approved)
        return None

    def destroy(self, request, *args, pk=None, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        row = layer.queryset.filter(id=pk).first()
        if row is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        error = self._check_deletable([row])
        if error is not None:
            return error
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_destroy(self, request, *args, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        ids_serializer = drf_serializers.ListField(
            child=drf_serializers.UUIDField(), allow_empty=False
        )
        try:
            row_ids = ids_serializer.run_validation(request.data.get("ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        rows = list(layer.queryset.filter(id__in=row_ids))
        if len(rows) != len(set(row_ids)):
            return Response(
                {"ids": "One or more requirements were not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 全有或全无：批量端点的部分成功是前端不可恢复状态的来源
        error = self._check_deletable(rows)
        if error is not None:
            return error
        layer.queryset.filter(id__in=row_ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_save(self, request, *args, **kwargs):
        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            layer = self.resolve_layer(owner)

            rows_by_id = {row.id: row for row in layer.queryset}
            serializer = RequirementBatchSaveSerializer(
                data=request.data,
                context={
                    "owner": owner,
                    "parent_queryset": layer.queryset,
                    "requirement_type_resolver": layer.requirement_type_resolver,
                    "default_requirement_type_id": layer.default_requirement_type_id,
                    # 每行按自己绑定的需求类型校验
                    "row_requirement_types": {
                        row_id: row.requirement_type_id
                        for row_id, row in rows_by_id.items()
                    },
                    # 未提交的内置列沿用行上的当前值，见 validate_requirement_builtin_values
                    "rows_by_id": rows_by_id,
                },
            )
            serializer.is_valid(raise_exception=True)

            # 锁定与「已确认不能直接删」折进现成的 conflicts 形状，前端不必学新的错误结构
            conflicts = []
            for update in serializer.validated_data["updates"]:
                row = rows_by_id.get(update["id"])
                if row is not None and row.pending_change_item_id:
                    conflicts.append({"id": str(row.id), "reason": "in_review"})
            for delete in serializer.validated_data["deletes"]:
                row = rows_by_id.get(delete["id"])
                if row is None:
                    continue
                if row.pending_change_item_id:
                    conflicts.append({"id": str(row.id), "reason": "in_review"})
                elif row.approved_version is not None:
                    conflicts.append({"id": str(row.id), "reason": "needs_approval"})
            if conflicts:
                return Response(
                    {
                        "error": "One or more requirements cannot be saved right now.",
                        "code": "REQUIREMENT_BATCH_CONFLICT",
                        "conflicts": conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            creates = []
            for payload in serializer.validated_data["creates"]:
                payload = dict(payload)
                payload["builtin"] = {
                    **payload["builtin"],
                    "status": RequirementItemStatus.DRAFT,
                }
                creates.append(payload)

            try:
                created, updated, deleted_ids = layer.save_batch(
                    creates=creates,
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

        context = self._row_context(
            layer, owner, [row for _, row in created] + list(updated)
        )
        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "requirement": RequirementSerializer(row, context=context).data,
                    }
                    for client_id, row in created
                ],
                "updated": RequirementSerializer(
                    updated, many=True, context=context
                ).data,
                "deleted_ids": [str(row_id) for row_id in deleted_ids],
            },
            status=status.HTTP_200_OK,
        )

    def import_from_library(self, request, *args, **kwargs):
        """把标准库里的条目导入成本作用域的需求行。只有新增，不设闸门。"""
        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            layer = self.resolve_layer(owner)

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

        context = {
            **self._serializer_context(layer, owner),
            # 这一批的来源库就是 library 自己，直接给前缀，省掉那次 IN 查询
            "source_library_identifiers": {str(library.id): library.identifier},
        }
        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "requirement": RequirementSerializer(row, context=context).data,
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
        return None
