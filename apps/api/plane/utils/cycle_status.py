# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared constants for cycle status side effects.

Cycle status no longer auto-refreshes based on wall-clock time. The status is
updated only by explicit user actions.
"""

# Module imports
from plane.db.models import Cycle


# Only these states trigger email broadcasts.
CYCLE_STATUS_EMAIL_WHITELIST = {
    Cycle.Status.IN_PROGRESS,
    Cycle.Status.TESTING,
    Cycle.Status.RETURNED,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}
