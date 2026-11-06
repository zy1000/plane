/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Navigate } from "react-router";
import type { Route } from "./+types/page";

/**
 * 旧页签的兜底：工作项 / 缺陷 / 需求 / 活动 / 已分配 / 已创建 / 已延期 / 已订阅 都不再是页签，
 * 存量链接一律落到「待处理」；缺陷 / 需求带上类型参数直接定位到那一类。
 */
const LEGACY_TYPE_PARAM: Record<string, string | undefined> = {
  work_items: "work_item",
  defects: "defect",
  requirements: "requirement",
};

function ProfileLegacyViewRedirect({ params }: Route.ComponentProps) {
  const { workspaceSlug, userId, profileViewId } = params;
  const type = LEGACY_TYPE_PARAM[profileViewId];
  const target = `/${workspaceSlug}/profile/${userId}/pending/${type ? `?type=${type}` : ""}`;
  return <Navigate to={target} replace />;
}

export default ProfileLegacyViewRedirect;
