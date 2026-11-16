# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
import sys

# Third party imports
from crum import get_current_request

# Module imports
from plane.utils.logging import current_task

logger = logging.getLogger("plane.exception")


def _where():
    """异常发生在哪：请求（方法 路径 用户）或后台任务名。"""
    request = get_current_request()
    if request is not None:
        email = getattr(getattr(request, "user", None), "email", None)
        return f"{request.method} {request.get_full_path()}  user={email or '-'}"
    task = current_task()
    if task:
        return f"task={task.name.rsplit('.', 1)[-1]}"
    return ""


def log_exception(e, warning=False, status=None):
    """记录异常和堆栈。status 是这次异常最终返回给前端的状态码（视图基类传入）。"""
    level = logging.WARNING if warning else logging.ERROR

    # 个别调用方传的是一句话而不是异常对象
    if not isinstance(e, BaseException):
        logger.log(level, str(e), exc_info=sys.exc_info()[0] is not None)
        return

    title = type(e).__qualname__
    if status:
        title += f" → {status}"
    try:
        where = _where()
    except Exception:
        # 取用户可能要查库，记日志不能因此再抛错
        where = ""
    logger.log(level, "%s  %s", title, where, exc_info=(type(e), e, e.__traceback__))
