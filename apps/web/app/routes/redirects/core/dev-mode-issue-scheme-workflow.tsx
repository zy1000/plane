/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/dev-mode-issue-scheme-workflow";

/**
 * 类型 / 状态 / 工作流挪进工作区类型库后的旧路径：
 * /templates/dev-modes/:devModeId/issue-scheme/workflows/:workflowId → /templates/issue-types/workflows/:workflowId
 * 带上原来的 ?type=，返回时仍回到那个类型。
 */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { workspaceSlug, workflowId } = params;
  const { search } = new URL(request.url);
  throw redirect(`/${workspaceSlug}/templates/issue-types/workflows/${workflowId}${search}`);
};

export default function DevModeIssueSchemeWorkflowRedirect() {
  return null;
}
