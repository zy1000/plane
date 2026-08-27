"""需求条目的 Excel 导入 / 导出端点。

三个 handler 全部挂在 `BaseRequirementRowViewSet` 上，产品需求与标准库条目因此一次性
都有 —— 与 `bulk_save` 同一个落点。两侧的差异只有三处，都由下面的三个钩子吸收：
内置列怎么裁（`excel_is_library`）、可以出现哪些需求类型（`excel_import_type_ids`）、
下载文件叫什么（`excel_filename_stem`）。

**落库不另起一套写路径**：解析结果最终还是灌进 `RequirementBatchSaveSerializer` +
`layer.save_batch`，必填校验、成员合法性、父项成环、乐观锁、编号分配、sort_order 插入
全部沿用现成的。导入只负责「把 Excel 变成那个载荷」。
"""

import json

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementBatchCreateSerializer,
    RequirementBatchSaveSerializer,
    RequirementBatchUpdateSerializer,
)
from plane.db.models import RequirementType
from plane.utils.requirement import (
    RequirementBatchConflict,
    field_specs_for_requirement_types,
    remap_imported_parents,
)
from plane.utils.requirement_module import (
    make_module_path_ensurer,
    module_path_index,
    module_scope_filter,
    set_requirement_module,
)
from plane.utils.requirement_project import set_requirement_status
from plane.utils import requirement_excel as xl


XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _extract_row_keys(request):
    """勾选要导入的行。multipart 里它是一个 JSON 字符串。None = 全选。"""
    raw = request.data.get("row_keys")
    if raw in (None, ""):
        return None, None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None, Response(
                {"error": "row_keys 格式错误。"}, status=status.HTTP_400_BAD_REQUEST
            )
    if not isinstance(raw, list):
        return None, Response(
            {"error": "row_keys 必须是数组。"}, status=status.HTTP_400_BAD_REQUEST
        )
    return {str(item) for item in raw}, None


def _humanize_required(messages):
    """`validate_requirement_data` 抛的必填错误不带字段名（它调 leaf 校验时没包 field_key），
    摊平后就是一句光秃秃的 `This field is required.`。表里有的列在解析阶段已经用列名报过
    了，走到这里的一定是**表里没有**的字段（附件 / 图片，或被删掉的列）—— 说清楚。"""
    return [
        (
            "有必填字段在表里没有对应的列（附件、图片，或已删除的列），"
            "请在页面上补齐后再导入。"
            if message.strip() == "This field is required."
            else message
        )
        for message in messages
    ]


class RequirementExcelMixin:
    """需求行的 Excel 出入口。由 BaseRequirementRowViewSet 混入。"""

    #: 标准库那一支置 True：内置列只出 4 列，且没有交付状态
    excel_is_library = False

    # --- 子类可覆盖的钩子 -------------------------------------------------

    def excel_filename_stem(self, owner, layer):
        return layer.serializer_context.get("scope_identifier") or "需求"

    def excel_import_type_ids(self, owner, layer):
        """导入时允许出现的需求类型。

        与导出不同，这里**不能**只取「已被引用的类型」：空产品一条需求都没有，那样会
        得到零个工作表，刚下载的模板反而导不进来。产品可以容纳工作区里的任何类型。
        """
        return list(
            RequirementType.objects.filter(
                workspace_id=owner.workspace_id, is_active=True
            )
            .order_by("sort_order", "created_at", "id")
            .values_list("id", flat=True)
        )

    # --- 共用 -------------------------------------------------------------

    def _excel_sheet_specs(self, owner, layer, *, requested_ids=None, for_import=False):
        fields_by_type = dict(layer.fields_by_requirement_type)
        if for_import:
            type_ids = [str(item) for item in self.excel_import_type_ids(owner, layer)]
        elif requested_ids:
            type_ids = [str(item) for item in requested_ids]
        else:
            type_ids = [str(item) for item in layer.requirement_type_ids]

        # layer 里没带到的类型才去查字段。标准库那一支的类型恒在 layer 里，所以它拿到的
        # 永远是 get_library_field_specs 筛过的那份，不会被这里的全量查询覆盖掉
        missing = [item for item in type_ids if item not in fields_by_type]
        if missing:
            _, extra = field_specs_for_requirement_types(missing)
            fields_by_type.update(extra)

        ordered = (
            RequirementType.objects.filter(
                id__in=type_ids, workspace_id=owner.workspace_id
            )
            .order_by("sort_order", "created_at", "id")
            .values_list("id", "name", "builtin_field_layout")
        )
        rows = [(str(item), name, layout) for item, name, layout in ordered]
        return xl.build_sheet_specs(
            requirement_types=[(item_id, name) for item_id, name, _ in rows],
            fields_by_type=fields_by_type,
            is_library=self.excel_is_library,
            builtin_layout_by_type={item_id: layout for item_id, _, layout in rows},
        )

    def _excel_module_index(self, owner):
        """作用域内的模块名称路径索引；导出渲染模块列与导入反查模块共用。"""
        return module_path_index(module_scope_filter(owner))

    def _excel_export_context(self, owner, layer):
        # 父项列要拼父需求的编号，父项可能不在筛选结果里，所以取整个作用域；
        # 库作用域编号是行上手填的 code，一次 values_list 连它一起取
        rows = list(layer.queryset.values_list("id", "sequence_id", "code"))
        module_path_by_id, _ = self._excel_module_index(owner)
        return xl.ExportContext(
            scope_identifier=layer.serializer_context.get("scope_identifier") or "",
            user_display={
                str(user_id): (display_name or email or "")
                for user_id, display_name, email in xl.workspace_member_rows(
                    owner.workspace_id
                )
            },
            sequence_by_id={
                str(row_id): sequence_id for row_id, sequence_id, _ in rows
            },
            is_library=self.excel_is_library,
            code_by_id={str(row_id): code or "" for row_id, _, code in rows},
            module_path_by_id={
                module_id: xl.format_module_path(path)
                for module_id, path in module_path_by_id.items()
            },
        )

    # --- 导出 -------------------------------------------------------------

    def export_excel(self, request, *args, **kwargs):
        owner, error = self._owner_or_error(require_write=False)
        if error is not None:
            return error
        layer = self.resolve_layer(owner)

        is_template = request.query_params.get("template") in ("1", "true")
        requested_ids = [
            item
            for item in (request.query_params.get("requirement_type_id") or "").split(",")
            if item
        ]
        try:
            sheet_specs = self._excel_sheet_specs(
                owner, layer, requested_ids=requested_ids
            )
        except (ValueError, ValidationError):
            return Response(
                {"error": "需求类型参数不合法。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not sheet_specs:
            return Response(
                {
                    "error": (
                        "这里还没有任何需求类型。请先手动录入一条需求，"
                        "或在下载模板时指定需求类型。"
                    ),
                    "code": "REQUIREMENT_EXCEL_NO_TYPE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows_by_type = {}
        if not is_template:
            query, error = self._row_query(request, owner, layer)
            if error is not None:
                return error
            queryset = query.apply(layer.queryset, layer)
            # 上限用 +1 探一下，避免为了计数多打一次 COUNT
            rows = list(queryset[: xl.MAX_ROWS + 1])
            if len(rows) > xl.MAX_ROWS:
                return Response(
                    {
                        "error": (
                            f"单次导出最多 {xl.MAX_ROWS} 条需求，请先用筛选缩小范围。"
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            for row in rows:
                rows_by_type.setdefault(str(row.requirement_type_id), []).append(row)

        buffer = xl.write_workbook(
            sheet_specs,
            rows_by_type,
            self._excel_export_context(owner, layer),
            template=is_template,
        )
        stem = self.excel_filename_stem(owner, layer)
        filename = (
            f"{stem}-需求导入模板.xlsx"
            if is_template
            else f"{stem}-需求-{timezone.localtime().strftime('%Y%m%d%H%M%S')}.xlsx"
        )
        response = FileResponse(buffer, content_type=XLSX_CONTENT_TYPE)
        return xl.attach_download_filename(response, filename)

    # --- 导入 -------------------------------------------------------------

    def _prepare_excel_import(self, request, owner, layer, *, deep_validate):
        """上传文件 -> 逐行结果。校验预览与真正导入共用这一个入口。

        `deep_validate` 只在预览时开：它把每一行单独过一遍写序列化器，把「必填字段没填」
        这类只有写路径才知道的问题也算进预览结果里 —— 否则会出现「预览全绿、点导入报错」。
        真正导入时不重复跑，改由批量序列化器统一校验，错误再按下标映射回行。
        """
        file_obj = request.FILES.get("file")
        message = xl.validate_upload(file_obj)
        if message:
            return None, Response(
                {"error": message}, status=status.HTTP_400_BAD_REQUEST
            )

        sheet_specs = self._excel_sheet_specs(owner, layer, for_import=True)
        if not sheet_specs:
            return None, Response(
                {
                    "error": "工作区里还没有启用的需求类型。",
                    "code": "REQUIREMENT_EXCEL_NO_TYPE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            groups, ignored_sheets, ignored_headers = xl.parse_workbook(
                file_obj, sheet_specs
            )
        except xl.RequirementExcelError as exc:
            return None, Response(
                {"error": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # annotate_pending 是必需的：跳过原因要区分「评审中」与「删除待审批」
        from plane.app.views.requirement.row_base import annotate_pending

        existing_rows = list(annotate_pending(layer.queryset))
        resolver = xl.RequirementImportResolver(
            scope_identifier=layer.serializer_context.get("scope_identifier"),
            existing_rows=existing_rows,
            members=xl.workspace_member_rows(owner.workspace_id),
            is_library=self.excel_is_library,
            module_index=self._excel_module_index(owner),
        )
        results = xl.resolve_groups(groups, resolver)

        if deep_validate:
            self._deep_validate(results, owner, layer, existing_rows, sheet_specs)

        return (results, ignored_sheets, ignored_headers), None

    def _batch_context(self, owner, layer, rows_by_id):
        return {
            "owner": owner,
            "parent_queryset": layer.queryset,
            "requirement_type_resolver": layer.requirement_type_resolver,
            "default_requirement_type_id": layer.default_requirement_type_id,
            "row_requirement_types": {
                row_id: row.requirement_type_id for row_id, row in rows_by_id.items()
            },
            "rows_by_id": rows_by_id,
        }

    def _deep_validate(self, results, owner, layer, existing_rows, sheet_specs):
        """逐行过一遍写序列化器，把它的报错并进这一行的 errors。"""
        rows_by_id = {row.id: row for row in existing_rows}
        context = self._batch_context(owner, layer, rows_by_id)
        specs_by_type = {spec.requirement_type_id: spec for spec in sheet_specs}

        for result in results:
            # 不写内容的行（unchanged / 只改状态）不过序列化器：它会拿现有 data 整体校验，
            # 而现有行上「后来才改成必填」的空字段并不是这次导入要写的东西
            if not result.writes_content:
                continue
            if result.action == "create":
                create_data = {
                    "client_id": result.client_id,
                    "data": result.data,
                    "builtin": result.builtin,
                    "requirement_type_id": result.requirement_type_id,
                }
                # 库作用域：编号必填 + 与库内已有条目查重都由写序列化器给出，
                # 预览期与导入期因此不可能报得不一致
                if result.code is not None:
                    create_data["code"] = result.code
                serializer = RequirementBatchCreateSerializer(
                    data=create_data,
                    context=context,
                )
            else:
                serializer = RequirementBatchUpdateSerializer(
                    data={
                        "id": result.requirement_id,
                        "data": result.data,
                        "builtin": result.builtin,
                        "version": result.version,
                    },
                    context=context,
                )
            if not serializer.is_valid():
                result.errors.extend(
                    _humanize_required(
                        xl.flatten_serializer_errors(
                            serializer.errors,
                            specs_by_type.get(result.requirement_type_id),
                        )
                    )
                )

    def validate_excel_import(self, request, *args, **kwargs):
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        prepared, error = self._prepare_excel_import(
            request, owner, layer, deep_validate=True
        )
        if error is not None:
            return error
        results, ignored_sheets, ignored_headers = prepared
        return Response(
            xl.summarize(
                results,
                ignored_sheets=ignored_sheets,
                ignored_headers=ignored_headers,
            ),
            status=status.HTTP_200_OK,
        )

    def import_excel(self, request, *args, **kwargs):
        row_keys, error = _extract_row_keys(request)
        if error is not None:
            return error

        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            layer = self.resolve_layer(owner)

            prepared, error = self._prepare_excel_import(
                request, owner, layer, deep_validate=False
            )
            if error is not None:
                return error
            results, ignored_sheets, ignored_headers = prepared

            chosen, creates, updates, parent_by_client_id = xl.build_batch_payload(
                results, selected_keys=row_keys
            )
            if not chosen:
                transaction.set_rollback(True)
                return Response(
                    {
                        "error": "没有可导入的行，请先修正校验中标红的问题。",
                        **xl.summarize(
                            results,
                            ignored_sheets=ignored_sheets,
                            ignored_headers=ignored_headers,
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 模块先于内容落库：新增行的 module_id 要过创建序列化器的存在性校验，
            # 所以不存在的模块必须在这里（owner 行锁内）逐级建好。只为选中且通过的行建
            ensure_module = make_module_path_ensurer(
                scope_filter=module_scope_filter(owner),
                workspace_id=owner.workspace_id,
                actor=request.user,
            )
            module_id_by_path = {
                path: str(ensure_module(path).id)
                for path in xl.collect_module_paths(chosen)
            }
            xl.assign_create_modules(creates, chosen, module_id_by_path)

            reopen_first, close_after = xl.split_status_changes(chosen)
            for result in reopen_first:
                set_requirement_status(
                    result.requirement_id,
                    status=result.status_value,
                    actor=request.user,
                )

            created, updated = [], []
            if creates or updates:
                # 重开之后重新读一遍：闸门判定与内置列回填都要以最新的行为准
                rows_by_id = {row.id: row for row in layer.queryset}
                serializer = RequirementBatchSaveSerializer(
                    data={"creates": creates, "updates": updates},
                    context=self._batch_context(owner, layer, rows_by_id),
                )
                if not serializer.is_valid():
                    # atomic 块里直接 return 是会提交的 —— 上面的「重开」写入必须显式回滚
                    transaction.set_rollback(True)
                    return self._excel_batch_error(serializer, chosen, results)

            try:
                if creates or updates:
                    created, updated, _ = layer.save_batch(
                        creates=serializer.validated_data["creates"],
                        updates=serializer.validated_data["updates"],
                        deletes=[],
                        actor=request.user,
                    )
            except RequirementBatchConflict as exc:
                # 拿到行锁之后才发现有人先改了（或删了）。与 bulk_save 同一个错误形状，
                # 前端不必为导入学一套新的冲突结构
                transaction.set_rollback(True)
                return Response(
                    {
                        "error": "有需求在导入过程中被其他人改动了，请重新校验后再试。",
                        "code": "REQUIREMENT_BATCH_CONFLICT",
                        "conflicts": exc.conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # 父项指向同批**新增**的行时，落库前拿不到 id，只能等到这里回填。载荷形状
            # 与 import_library_items 完全一致，所以直接复用它那支 util。
            # 更新行也一并传进去：它的父项同样可能指向本批新增的行。
            updated_by_id = {str(row.id): row for row in updated}
            # client_id 统一成字符串：save_batch 回传的是序列化器转换后的 UUID 对象，
            # 而 parent_by_client_id 两侧都是字符串，不归一就永远查不到、父项静默丢失
            saved_rows = [(str(client_id), row) for client_id, row in created] + [
                (result.client_id, updated_by_id[result.requirement_id])
                for result in chosen
                if result.action == "update" and result.requirement_id in updated_by_id
            ]
            remap_imported_parents(
                model=self.model,
                created_rows=saved_rows,
                parent_by_client_id=parent_by_client_id,
            )

            # 更新行的模块改动：模块轴与内容正交，走批量移动同一个旁路写入口。放在
            # creates/updates 分支之外 —— 一份只挪模块、不改内容的文件也得生效
            for module_id, requirement_ids in xl.module_update_groups(
                chosen, module_id_by_path
            ).items():
                set_requirement_module(
                    layer.queryset,
                    requirement_ids,
                    module_id=module_id,
                    actor=request.user,
                )

            for result in close_after:
                set_requirement_status(
                    result.requirement_id,
                    status=result.status_value,
                    actor=request.user,
                )

        payload = xl.summarize(
            results, ignored_sheets=ignored_sheets, ignored_headers=ignored_headers
        )
        payload.update(
            {
                "success_count": len(chosen),
                "created_count": len(created),
                # 含只改状态的行：对用户来说那也是「更新了那条需求」
                "updated_count": sum(1 for r in chosen if r.action == "update"),
                "created_ids": [str(row.id) for _, row in created],
                # 新增可能引入这个作用域此前没引用过的需求类型，前端据此决定要不要重取配置
                "requirement_type_ids": sorted(
                    {result.requirement_type_id for result in chosen}
                ),
            }
        )
        return Response(payload, status=status.HTTP_200_OK)

    @staticmethod
    def _excel_batch_error(serializer, chosen, results):
        """批量序列化器的报错按下标映射回具体行。

        走到这里说明预览之后数据又变了（或者用户跳过了预览直接导），不该只吐一坨
        DRF 的嵌套结构让人对着行号猜。
        """
        errors = serializer.errors or {}
        # 下标必须与 build_batch_payload 生成的载荷一一对应：只改状态的行不在 updates 里
        creates = [result for result in chosen if result.action == "create"]
        updates = [
            result for result in chosen if result.action == "update" and result.writes_content
        ]
        for key, bucket in (("creates", creates), ("updates", updates)):
            entries = errors.get(key) or []
            if not isinstance(entries, list):
                continue
            for index, item_errors in enumerate(entries):
                if not item_errors or index >= len(bucket):
                    continue
                bucket[index].errors.extend(
                    xl.flatten_serializer_errors(item_errors)
                )
        general = {
            key: value
            for key, value in errors.items()
            if key not in ("creates", "updates")
        }
        payload = xl.summarize(results)
        payload["error"] = "导入未能完成，请修正下列问题后重试。"
        if general:
            payload["detail"] = xl.flatten_serializer_errors(general)
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)
