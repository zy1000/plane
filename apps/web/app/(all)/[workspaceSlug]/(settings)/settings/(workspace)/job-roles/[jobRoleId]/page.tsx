/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "react-router";
import { JobRoleDetail } from "@/components/workspace/settings/job-roles";

/** 角色详情：工作区成员 / 项目成员 / 工作流引用 */
export default function WorkspaceJobRoleDetailPage() {
  const { workspaceSlug, jobRoleId } = useParams();
  if (!workspaceSlug || !jobRoleId) return null;
  // key：从一个角色切到另一个角色时整页重置
  return <JobRoleDetail key={jobRoleId} workspaceSlug={workspaceSlug} roleId={jobRoleId} />;
}
