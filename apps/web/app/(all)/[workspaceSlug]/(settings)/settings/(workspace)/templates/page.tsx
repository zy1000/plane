/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PermissionGroupsRoot } from "@/components/workspace/settings/permission-groups";
import type { Route } from "./+types/page";

/** 旧地址：模板已并进「权限组」列表（组上的「模板」开关），这里直接打开列表 */
const WorkspaceTemplatesPage = observer(function WorkspaceTemplatesPage({ params }: Route.ComponentProps) {
  return <PermissionGroupsRoot workspaceSlug={params.workspaceSlug} />;
});

export default WorkspaceTemplatesPage;
