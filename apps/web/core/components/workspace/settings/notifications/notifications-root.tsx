/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { PERMISSION_KEYS } from "@plane/constants";
import { Breadcrumbs } from "@plane/ui";
import { cn } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { PermissionGroupIdentity } from "@/components/workspace/settings/permission-groups/ui";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { NotifyService } from "@/services/notify.service";
import type { TNotifyRule, TNotifyRuleMode } from "@/types/notify";
import { NotifyMailLogTab } from "./mail-log-tab";
import { NotifyRulesTab } from "./rules-tab";

const notifyService = new NotifyService();
const VIEW_KEYS = [PERMISSION_KEYS.WORKSPACE_SETTINGS_EDIT];

type TTab = "rules" | "mails";

/**
 * 工作区设置 › 通知：两个页签 ——「通知规则」配置什么事件发给哪些角色、即时还是每日摘要；
 * 「发送记录」（`?tab=mails`）查每一封邮件发没发出去。规则数据在这里取，页签角标要用其中的失败数。
 */
export const NotificationsSettingsRoot = observer(function NotificationsSettingsRoot({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const canView = allowWorkspacePermissionKeys(VIEW_KEYS, workspaceSlug);
  const activeTab: TTab = searchParams.get("tab") === "mails" ? "mails" : "rules";

  const { data, mutate } = useSWR(
    canView ? ["NOTIFY_RULES", workspaceSlug] : null,
    () => notifyService.rules(workspaceSlug),
    { shouldRetryOnError: false }
  );

  if (workspaceUserInfo[workspaceSlug] && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  const handleSaveRule = async (rule: TNotifyRule, roles: Record<string, TNotifyRuleMode>) => {
    const saved = await notifyService.updateRule(workspaceSlug, rule.event, roles);
    await mutate(
      (current) =>
        current && { ...current, rules: current.rules.map((item) => (item.event === saved.event ? saved : item)) },
      { revalidate: false }
    );
  };

  // 末尾的斜杠不能省：设置侧栏按「href + /」判断当前项，少了它切页签后左侧就不高亮了
  const basePath = `/${workspaceSlug}/settings/notifications/`;
  const tabs: { key: TTab; label: string; badge?: number }[] = [
    { key: "rules", label: "通知规则" },
    { key: "mails", label: "发送记录", badge: data?.failed_mail_count },
  ];

  const Icon = WORKSPACE_SETTINGS_ICONS.notifications;
  const header = (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item component={<BreadcrumbLink label="通知" icon={<Icon className="size-4 text-tertiary" />} />} />
        </Breadcrumbs>
      }
    />
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title="通知" />
      <div className="flex flex-col gap-5">
        <PermissionGroupIdentity name="通知" />

        <div className="-mt-1 flex gap-7 border-b border-subtle" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 py-2.5 text-14 whitespace-nowrap",
                activeTab === tab.key
                  ? "border-accent-strong font-medium text-primary"
                  : "border-transparent text-tertiary hover:text-primary"
              )}
              onClick={() => router.push(tab.key === "mails" ? `${basePath}?tab=mails` : basePath)}
            >
              {tab.label}
              {!!tab.badge && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-subtle px-1.5 text-12 font-semibold text-danger-primary tabular-nums">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "mails" ? (
          // 重发之后失败数会变，让页签角标跟着刷新
          <NotifyMailLogTab workspaceSlug={workspaceSlug} onChanged={() => void mutate()} />
        ) : (
          <NotifyRulesTab data={data} onSave={handleSaveRule} />
        )}
      </div>
    </SettingsContentWrapper>
  );
});
