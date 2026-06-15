"""工作项 Excel 导入端点。

- `GET  import-template`：下载标准模板
- `POST validate-import`：上传文件 + 字段映射，返回每行的校验结果
- `POST bulk-import`     ：根据字段映射 + 勾选行号，事务化批量导入

旧的 `issue-import` 同步导入入口已下线（无前端调用点保留），新流程参考 import-modal。
"""

import json
from pathlib import Path

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.views import BaseViewSet
from plane.db.models import Project
from plane.utils.issue_import import (
    build_issues,
    inspect_file,
    list_field_definitions,
    parse_excel,
    validate_mapping,
    validate_rows,
)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
TEMPLATE_PATH = (
    Path(__file__).resolve().parents[3] / "utils" / "templates" / "工作项导入模板.xlsx"
)
TEMPLATE_FILENAME = "工作项导入模板.xlsx"


class IssueAPI(BaseViewSet):

    @action(detail=False, methods=["get"], url_path="import-template")
    def download_import_template(self, request, slug, project_id):
        if not TEMPLATE_PATH.exists():
            return Response(
                {"error": "模板文件不存在，请联系管理员"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            open(TEMPLATE_PATH, "rb"),
            as_attachment=True,
            filename=TEMPLATE_FILENAME,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    @action(detail=False, methods=["get"], url_path="import-fields")
    def import_fields(self, request, slug, project_id):
        """前端在字段映射阶段读取可选属性列表。"""
        return Response(
            {"fields": list_field_definitions()},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="inspect-import-file")
    def inspect_import_file(self, request, slug, project_id):
        """读取上传文件的列名，并基于模板默认列名给出推荐映射。"""
        file_obj, error = _extract_file(request)
        if error:
            return error
        try:
            data = inspect_file(file_obj)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"error": f"解析 Excel 失败：{str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="validate-import")
    def validate_import(self, request, slug, project_id):
        file_obj, error = _extract_file(request)
        if error:
            return error

        mapping, error = _extract_mapping(request)
        if error:
            return error

        project = get_object_or_404(
            Project, id=project_id, workspace__slug=slug, deleted_at__isnull=True
        )

        try:
            rows = parse_excel(file_obj)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"error": f"解析 Excel 失败：{str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {"error": "Excel 中没有有效数据行"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = validate_rows(rows, mapping, project=project, user=request.user)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk-import")
    def bulk_import(self, request, slug, project_id):
        file_obj, error = _extract_file(request)
        if error:
            return error

        mapping, error = _extract_mapping(request)
        if error:
            return error

        row_numbers, error = _extract_row_numbers(request)
        if error:
            return error

        project = get_object_or_404(
            Project, id=project_id, workspace__slug=slug, deleted_at__isnull=True
        )

        try:
            rows = parse_excel(file_obj)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"error": f"解析 Excel 失败：{str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {"error": "未选择任何有效行，请至少勾选一行进行导入"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = build_issues(
            rows,
            mapping,
            project=project,
            user=request.user,
            row_numbers=row_numbers or None,
        )
        if result["success_count"] == 0 and result.get("skipped_count", 0) == 0:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 请求解析辅助
# ---------------------------------------------------------------------------


def _extract_file(request):
    file_obj = request.FILES.get("file")
    if not file_obj:
        return None, Response(
            {"error": "未上传文件"}, status=status.HTTP_400_BAD_REQUEST
        )
    if file_obj.size and file_obj.size > MAX_FILE_SIZE:
        return None, Response(
            {"error": f"文件大小不能超过 {MAX_FILE_SIZE // 1024 // 1024} MB"},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if not file_obj.name.lower().endswith((".xlsx", ".xls")):
        return None, Response(
            {"error": "仅支持 .xlsx / .xls 文件"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return file_obj, None


def _extract_mapping(request):
    raw = request.data.get("mapping")
    if raw is None:
        return None, Response(
            {"error": "缺少字段映射"}, status=status.HTTP_400_BAD_REQUEST
        )
    if isinstance(raw, str):
        try:
            mapping = json.loads(raw)
        except json.JSONDecodeError:
            return None, Response(
                {"error": "字段映射格式错误"}, status=status.HTTP_400_BAD_REQUEST
            )
    elif isinstance(raw, dict):
        mapping = raw
    else:
        return None, Response(
            {"error": "字段映射格式错误"}, status=status.HTTP_400_BAD_REQUEST
        )
    ok, message = validate_mapping(mapping)
    if not ok:
        return None, Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
    return mapping, None


def _extract_row_numbers(request):
    raw = request.data.get("row_numbers")
    if raw is None or raw == "":
        return [], None
    if isinstance(raw, list):
        values = raw
    elif isinstance(raw, str):
        try:
            values = json.loads(raw)
        except json.JSONDecodeError:
            return None, Response(
                {"error": "row_numbers 格式错误"}, status=status.HTTP_400_BAD_REQUEST
            )
    else:
        return None, Response(
            {"error": "row_numbers 格式错误"}, status=status.HTTP_400_BAD_REQUEST
        )
    try:
        return [int(v) for v in values], None
    except (TypeError, ValueError):
        return None, Response(
            {"error": "row_numbers 必须是整数列表"}, status=status.HTTP_400_BAD_REQUEST
        )
