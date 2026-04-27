/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TAvatarUser = {
  is_bot?: boolean | null;
};

export const SYSTEM_USER_AVATAR_FALLBACK_COLOR = "#006399";

export const getUserAvatarFallbackBackgroundColor = (user?: TAvatarUser | null) =>
  user?.is_bot ? SYSTEM_USER_AVATAR_FALLBACK_COLOR : undefined;
