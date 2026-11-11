/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { JobRolesRoot } from "@/components/workspace/settings/job-roles";
import type { Route } from "./+types/page";

/** 工作区设置 › 角色（数据字典 job_role 的值）：审批人、评审负责人按角色找人 */
const WorkspaceJobRolesPage = observer(function WorkspaceJobRolesPage({ params }: Route.ComponentProps) {
  return <JobRolesRoot workspaceSlug={params.workspaceSlug} />;
});

export default WorkspaceJobRolesPage;
