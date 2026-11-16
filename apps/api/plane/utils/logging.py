# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""日志公共件：请求 ID 上下文、文本格式、按天日志文件，以及 local / production 共用的 LOGGING。"""

import contextvars
import datetime
import logging
import os
import re
import textwrap
import zoneinfo

from celery import current_task as _celery_current_task

# 日志里的时间和按天切文件都用北京时间（Django 把进程时区设成了 UTC）
LOG_TZ = zoneinfo.ZoneInfo("Asia/Shanghai")

# 当前请求的 ID，由 RequestLoggerMiddleware 写入
request_id_var = contextvars.ContextVar("plane_request_id", default=None)

_LEVEL_NAMES = {"WARNING": "WARN", "CRITICAL": "FATAL"}
# LogRecord 自带的属性；不在这里面的就是调用方通过 extra= 传进来的
_RECORD_ATTRS = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName"}


def current_task():
    """正在执行的 Celery 任务；不在任务里时返回 None。"""
    task = _celery_current_task
    if task and task.request.id:
        return task
    return None


def _context_tag():
    request_id = request_id_var.get()
    if request_id:
        return request_id
    task = current_task()
    if task:
        return f"task:{task.request.id[:8]}"
    return "-"


class PlaneFormatter(logging.Formatter):
    """``2026-11-14 14:12:34.916 INFO  [a3f9c2e1] plane.api.request  内容``，堆栈缩进跟在后面。"""

    def format(self, record):
        moment = datetime.datetime.fromtimestamp(record.created, LOG_TZ)
        line = "%s.%03d %-5s [%s] %s  %s" % (
            moment.strftime("%Y-%m-%d %H:%M:%S"),
            moment.microsecond // 1000,
            _LEVEL_NAMES.get(record.levelname, record.levelname),
            _context_tag(),
            record.name,
            record.getMessage(),
        )
        extras = " ".join(f"{key}={value}" for key, value in record.__dict__.items() if key not in _RECORD_ATTRS)
        if extras:
            line += "  " + extras
        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            line += "\n" + textwrap.indent(record.exc_text, "    ")
        if record.stack_info:
            line += "\n" + textwrap.indent(self.formatStack(record.stack_info), "    ")
        return line


class HasTraceback(logging.Filter):
    """只放行带异常堆栈的记录。"""

    def filter(self, record):
        return bool(record.exc_info)


class DailyFileHandler(logging.FileHandler):
    """按天写 ``{prefix}-YYYY-MM-DD.log``，保留最近 backup_days 天。

    日期直接写在文件名里、不做重命名，所以 gunicorn / celery 的多个进程同时写同一个文件是安全的。
    """

    def __init__(self, directory, prefix, backup_days=30):
        self.directory = directory
        self.prefix = prefix
        self.backup_days = backup_days
        self.day = self._today()
        super().__init__(self._path(self.day), encoding="utf-8", delay=True)
        self._purge()

    @staticmethod
    def _today():
        return datetime.datetime.now(LOG_TZ).date()

    def _path(self, day):
        return os.path.join(self.directory, f"{self.prefix}-{day.isoformat()}.log")

    def _purge(self):
        pattern = re.compile(rf"^{re.escape(self.prefix)}-(\d{{4}}-\d{{2}}-\d{{2}})\.log$")
        cutoff = (self.day - datetime.timedelta(days=self.backup_days)).isoformat()
        for name in os.listdir(self.directory):
            matched = pattern.match(name)
            if matched and matched.group(1) < cutoff:
                try:
                    os.remove(os.path.join(self.directory, name))
                except OSError:
                    pass  # 别的进程已经删掉了

    def emit(self, record):
        try:
            today = self._today()
            if today != self.day:
                if self.stream:
                    self.stream.close()
                    self.stream = None
                self.day = today
                self.baseFilename = self._path(today)
                self._purge()
        except Exception:
            self.handleError(record)
        super().emit(record)


def build_logging_config(log_dir):
    """local / production 共用的 LOGGING：控制台 + 全量文件 + 只收 WARN 及以上的问题文件。"""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"plane": {"()": "plane.utils.logging.PlaneFormatter"}},
        "filters": {"has_traceback": {"()": "plane.utils.logging.HasTraceback"}},
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "plane"},
            "file": {
                "class": "plane.utils.logging.DailyFileHandler",
                "directory": log_dir,
                "prefix": "plane",
                "formatter": "plane",
            },
            "error_file": {
                "class": "plane.utils.logging.DailyFileHandler",
                "directory": log_dir,
                "prefix": "plane-error",
                "formatter": "plane",
                "level": "WARNING",
            },
            "null": {"class": "logging.NullHandler"},
        },
        # 第三方库只收 WARN 及以上
        "root": {"level": "WARNING", "handlers": ["console", "file", "error_file"]},
        "loggers": {
            "plane": {"level": "INFO"},
            "celery": {"level": "INFO"},
            # 去掉 Django 默认挂的 console / mail_admins，统一走 root
            "django": {"level": "INFO"},
            # 4xx / 5xx 的请求行由 RequestLoggerMiddleware 记，这里只留没被视图接住的异常堆栈
            "django.request": {"level": "ERROR", "filters": ["has_traceback"]},
            # 访问日志统一由 RequestLoggerMiddleware 输出
            "django.server": {"handlers": ["null"], "propagate": False},
            "uvicorn.access": {"handlers": ["null"], "propagate": False},
        },
    }
