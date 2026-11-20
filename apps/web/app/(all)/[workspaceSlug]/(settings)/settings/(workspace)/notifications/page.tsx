/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { NotificationsSettingsRoot } from "@/components/workspace/settings/notifications";
import type { Route } from "./+types/page";

/** 工作区设置 › 通知：邮件通知规则 + 发送记录 */
const WorkspaceNotificationsSettingsPage = observer(function WorkspaceNotificationsSettingsPage({
  params,
}: Route.ComponentProps) {
  return <NotificationsSettingsRoot workspaceSlug={params.workspaceSlug} />;
});

export default WorkspaceNotificationsSettingsPage;
