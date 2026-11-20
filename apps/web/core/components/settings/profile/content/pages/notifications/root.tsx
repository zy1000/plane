/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// hooks
import { useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { MyNotifySubscriptions } from "./my-subscriptions";
import { NotifyPreferenceSettings } from "./preference-settings";

const NOTIFICATIONS_PATH = "/settings/profile/notifications";

/**
 * 个人设置 › 通知。默认是接收方式；`?view=subscriptions` 是「我的订阅」子页
 * （邮件页脚的「管理订阅」也指到这里）。个人设置的地址里没有工作区，订阅按最近使用的工作区取。
 */
export const NotificationsProfileSettings = observer(function NotificationsProfileSettings() {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { data: userSettings } = useUserSettings();
  const workspaceSlug =
    userSettings?.workspace?.last_workspace_slug || userSettings?.workspace?.fallback_workspace_slug || undefined;

  if (workspaceSlug && searchParams.get("view") === "subscriptions")
    return <MyNotifySubscriptions workspaceSlug={workspaceSlug} onBack={() => router.push(NOTIFICATIONS_PATH)} />;

  return (
    <NotifyPreferenceSettings
      workspaceSlug={workspaceSlug}
      onManageSubscriptions={() => router.push(`${NOTIFICATIONS_PATH}?view=subscriptions`)}
    />
  );
});
