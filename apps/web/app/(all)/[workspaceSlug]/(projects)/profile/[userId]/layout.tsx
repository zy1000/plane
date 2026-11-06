/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
import useSWR from "swr";
// components
import { PROFILE_VIEWER_TAB, PROFILE_ADMINS_TAB, WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProfileSidebar } from "@/components/profile/sidebar";
// constants
import { USER_PROFILE_PROJECT_SEGREGATION } from "@/constants/fetch-keys";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useUserWorkSummary } from "@/hooks/use-user-work";
import useSize from "@/hooks/use-window-size";
// local components
import { UserService } from "@/services/user.service";
import type { Route } from "./+types/layout";
import { UserProfileHeader } from "./header";

const userService = new UserService();

// 只有本人或有查看成员权限的人能看的子页：待处理 / 已处理 / 我发起的，以及会跳到待处理的旧地址
const AUTHORIZED_SEGMENTS = [
  "pending",
  "processed",
  "initiated",
  "assigned",
  "created",
  "subscribed",
  "overdue",
  "work_items",
  "defects",
  "requirements",
  "activity",
];

function UseProfileLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, userId } = params;
  const pathname = usePathname();
  // store hooks
  const { data: currentUser } = useUser();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { t } = useTranslation();
  // derived values
  const isAuthorized =
    currentUser?.id === userId ||
    allowWorkspacePermissionKeys([WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY], workspaceSlug);

  const windowSize = useSize();
  const isSmallerScreen = windowSize[0] >= 768;

  const { data: userProjectsData } = useSWR(USER_PROFILE_PROJECT_SEGREGATION(workspaceSlug, userId), () =>
    userService.getUserProfileProjectsSegregation(workspaceSlug, userId)
  );
  // 页签条数：待处理（按视图设置启用的来源）/ 我发起的；看不了别人工作的人不请求（接口同样会拒）
  const { summary } = useUserWorkSummary(workspaceSlug, userId, isAuthorized);
  const tabCounts = summary
    ? { pending: summary.pending.enabled_total, initiated: summary.initiated.total }
    : undefined;
  // derived values
  const profileBasePath = `/${workspaceSlug}/profile/${userId}`;
  const isSummaryTab = pathname === `${profileBasePath}/` || pathname === profileBasePath;
  const isAuthorizedPath = AUTHORIZED_SEGMENTS.some((segment) => pathname.includes(`/${segment}`));

  const tabsList = isAuthorized ? [...PROFILE_VIEWER_TAB, ...PROFILE_ADMINS_TAB] : PROFILE_VIEWER_TAB;
  const currentTab = tabsList.find((tab) => pathname === `/${workspaceSlug}/profile/${userId}${tab.selected}`);

  return (
    <>
      <div
        className={
          isSummaryTab
            ? "flex h-full w-full flex-col overflow-hidden md:flex-row"
            : "flex h-full w-full flex-col overflow-hidden"
        }
      >
        <div className="flex h-full w-full flex-col overflow-hidden">
          <AppHeader
            header={
              <UserProfileHeader
                type={currentTab?.i18n_label}
                userProjectsData={userProjectsData}
                tabCounts={tabCounts}
                showProfileSidebarToggle={isSummaryTab}
              />
            }
          />
          <ContentWrapper>
            <div className="flex h-full w-full flex-row md:flex-col md:overflow-hidden">
              <div className="flex w-full flex-col md:h-full md:overflow-hidden">
                {isAuthorized || !isAuthorizedPath ? (
                  <div className={`h-full w-full overflow-hidden`}>
                    <Outlet />
                  </div>
                ) : (
                  <div className="grid h-full w-full place-items-center text-secondary">
                    {t("you_do_not_have_the_permission_to_access_this_page")}
                  </div>
                )}
              </div>
              {isSummaryTab && !isSmallerScreen && <ProfileSidebar userProjectsData={userProjectsData} />}
            </div>
          </ContentWrapper>
        </div>
        {isSummaryTab && isSmallerScreen && <ProfileSidebar userProjectsData={userProjectsData} />}
      </div>
    </>
  );
}

export default observer(UseProfileLayout);
