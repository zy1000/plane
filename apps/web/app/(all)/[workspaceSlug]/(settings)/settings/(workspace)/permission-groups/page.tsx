/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PermissionGroupsRoot } from "@/components/workspace/settings/permission-groups";
import type { Route } from "./+types/page";

/** 工作区设置 › 权限组：单列表，模板是组上的开关 */
const WorkspacePermissionGroupsPage = observer(function WorkspacePermissionGroupsPage({ params }: Route.ComponentProps) {
  return <PermissionGroupsRoot workspaceSlug={params.workspaceSlug} />;
});

export default WorkspacePermissionGroupsPage;
