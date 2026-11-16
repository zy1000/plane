# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import logging
import time
import uuid

# Django imports
from django.http import HttpRequest
from django.utils import timezone

# Third party imports
from rest_framework.request import Request

# Module imports
from plane.utils.ip_address import get_client_ip
from plane.utils.exception_logger import log_exception
from plane.utils.logging import request_id_var
from plane.bgtasks.logger_task import process_logs

api_logger = logging.getLogger("plane.api.request")


class RequestLoggerMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def _should_log_route(self, request: Request | HttpRequest) -> bool:
        """
        Determines whether a route should be logged based on the request and status code.
        """
        # Don't log health checks
        if request.path == "/" and request.method == "GET":
            return False
        # CORS 预检请求不带业务信息
        if request.method == "OPTIONS":
            return False
        return True

    @staticmethod
    def _error_reason(response) -> str:
        """4xx / 5xx 时返回给前端的错误原因，截断后写进请求行。"""
        data = getattr(response, "data", None)
        if data is None and not response.streaming and response.get("Content-Type", "").startswith("application/json"):
            try:
                data = json.loads(response.content)
            except ValueError:
                data = None
        if isinstance(data, dict):
            data = data.get("error") or data.get("detail") or data
        if not data:
            return ""
        if not isinstance(data, str):
            data = json.dumps(data, ensure_ascii=False, default=str)
        return data.replace("\n", " ")[:300]

    def __call__(self, request):
        # 本次请求的 ID：处理期间打的每条日志都带它，同时放进响应头方便前端报错时反查
        request_id = uuid.uuid4().hex[:8]
        token = request_id_var.set(request_id)
        start_time = time.time()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id

            if not self._should_log_route(request=request):
                return response

            status_code = response.status_code
            email = getattr(getattr(request, "user", None), "email", None)
            message = (
                f"{request.method} {request.get_full_path()} {status_code} "
                f"{int((time.time() - start_time) * 1000)}ms ip={get_client_ip(request)} user={email or '-'}"
            )
            level = logging.INFO
            if status_code >= 400:
                level = logging.ERROR if status_code >= 500 else logging.WARNING
                reason = self._error_reason(response)
                if reason:
                    message += f' error="{reason}"'
            api_logger.log(level, message)

            return response
        finally:
            request_id_var.reset(token)


class APITokenLogMiddleware:
    """
    Middleware to log External API requests to MongoDB or PostgreSQL.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_body = request.body
        response = self.get_response(request)
        self.process_request(request, response, request_body)
        return response

    def _safe_decode_body(self, content):
        """
        Safely decodes request/response body content, handling binary data.
        Returns None if content is None, or a string representation of the content.
        """
        # If the content is None, return None
        if content is None:
            return None

        # If the content is an empty bytes object, return None
        if content == b"":
            return None

        # Check if content is binary by looking for common binary file signatures
        if content.startswith(b"\x89PNG") or content.startswith(b"\xff\xd8\xff") or content.startswith(b"%PDF"):
            return "[Binary Content]"

        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return "[Could not decode content]"

    def process_request(self, request, response, request_body):
        api_key_header = "X-Api-Key"
        api_key = request.headers.get(api_key_header)

        # If the API key is not present, return
        if not api_key:
            return

        try:
            log_data = {
                "token_identifier": api_key,
                "path": request.path,
                "method": request.method,
                "query_params": request.META.get("QUERY_STRING", ""),
                "headers": str(request.headers),
                "body": self._safe_decode_body(request_body) if request_body else None,
                "response_body": self._safe_decode_body(response.content) if response.content else None,
                "response_code": response.status_code,
                "ip_address": get_client_ip(request=request),
                "user_agent": request.META.get("HTTP_USER_AGENT", None),
            }
            user_id = (
                str(request.user.id)
                if getattr(request, "user") and getattr(request.user, "is_authenticated", False)
                else None
            )
            # Additional fields for MongoDB
            mongo_log = {
                **log_data,
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
                "created_by": user_id,
                "updated_by": user_id,
            }

            process_logs.delay(log_data=log_data, mongo_log=mongo_log)

        except Exception as e:
            log_exception(e)

        return None
