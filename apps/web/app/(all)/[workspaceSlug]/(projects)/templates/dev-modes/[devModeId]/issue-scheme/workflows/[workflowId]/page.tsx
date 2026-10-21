/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DevModeIssueSchemeWorkflowPanel } from "@/components/template-management/dev-modes";

/** 「工作项配置」下某条工作流的流转配置。权限与数据都由 layout 处理。 */
export default function TemplateDevModeIssueSchemeWorkflowPage() {
  return <DevModeIssueSchemeWorkflowPanel />;
}
