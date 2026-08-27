/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { replaceUnderscoreIfSnakeCase } from "@plane/utils";
import type { TNotificationContentMap } from "@/components/workspace-notifications/sidebar/notification-card/content";

// Additional notification content map for CE (empty - EE extends this)
export const ADDITIONAL_NOTIFICATION_CONTENT_MAP: TNotificationContentMap = {
  workflow_approval_request: ({ newValue, oldValue }) => ({
    action: "发起了状态变更审批申请",
    value: oldValue && newValue ? `${oldValue} → ${newValue}` : null,
    showConnector: false,
  }),
  // 需求审批。newValue 是「首条需求标题 等 N 条」，由后端拼好
  requirement_approval_request: ({ newValue }) => ({
    action: "提交了需求变更评审",
    value: newValue || null,
    showConnector: true,
  }),
  requirement_approval_approved: ({ newValue }) => ({
    action: "通过了需求变更",
    value: newValue || null,
    showConnector: true,
  }),
  requirement_approval_rejected: ({ newValue }) => ({
    action: "驳回了需求变更",
    value: newValue || null,
    showConnector: true,
  }),
  requirement_approval_withdrawn: ({ newValue }) => ({
    action: "撤回了需求变更",
    value: newValue || null,
    showConnector: true,
  }),
};

// Fallback action renderer for fields not in the map
export const renderAdditionalAction = (notificationField: string, verb: string | undefined) => {
  const baseAction = !["comment", "archived_at"].includes(notificationField) ? verb : "";
  return `${baseAction} ${replaceUnderscoreIfSnakeCase(notificationField)}`;
};

// Fallback value renderer for fields not in the map
export const renderAdditionalValue = (
  _notificationField: string | undefined,
  newValue: string | undefined,
  _oldValue: string | undefined
) => newValue;

export const shouldShowConnector = (notificationField: string | undefined) =>
  !["comment", "archived_at", "None", "assignees", "labels", "start_date", "target_date", "parent"].includes(
    notificationField || ""
  );

export const shouldRender = (notificationField: string | undefined, verb: string | undefined) => verb !== "deleted";
