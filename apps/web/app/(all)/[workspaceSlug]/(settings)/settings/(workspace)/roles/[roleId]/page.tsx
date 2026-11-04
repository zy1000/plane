/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "react-router";
import { PermissionGroupDetail } from "@/components/workspace/settings/permission-groups";

/** 权限组详情：工作区权限组「成员 / 权限」，项目权限组模板「权限 / 引用项目 / 已脱离」 */
export default function WorkspacePermissionGroupDetailPage() {
  const { workspaceSlug, roleId } = useParams();
  if (!workspaceSlug || !roleId) return null;
  // key：从一个组切到另一个组时整页重置草稿
  return <PermissionGroupDetail key={roleId} workspaceSlug={workspaceSlug} roleId={roleId} />;
}
