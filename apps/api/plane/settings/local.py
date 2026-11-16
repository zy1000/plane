# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Development settings"""

import os

from .local_common import *  # noqa
from plane.utils.logging import build_logging_config

DEBUG = True
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-do-not-use-in-prod")

# Debug Toolbar settings
INSTALLED_APPS += ("debug_toolbar",)  # noqa
MIDDLEWARE += ("debug_toolbar.middleware.DebugToolbarMiddleware",)  # noqa

DEBUG_TOOLBAR_PATCH_SETTINGS = False

# Only show emails in console don't send it to smtp
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,  # noqa
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

INTERNAL_IPS = ("127.0.0.1",)

MEDIA_URL = "/uploads/"
MEDIA_ROOT = os.path.join(BASE_DIR, "uploads")  # noqa

LOG_DIR = os.path.join(BASE_DIR, "logs")  # noqa

if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

LOGGING = build_logging_config(LOG_DIR)
