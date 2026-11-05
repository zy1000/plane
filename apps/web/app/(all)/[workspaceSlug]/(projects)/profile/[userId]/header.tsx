/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PanelRight } from "lucide-react";
import { PROFILE_VIEWER_TAB, PROFILE_ADMINS_TAB, WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { YourWorkIcon, ChevronDownIcon } from "@plane/propel/icons";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import type { IUserProfileProjectSegregation } from "@plane/types";
import { Header, CustomMenu } from "@plane/ui";
import { Button } from "@plane/propel/button";
import Link from "next/link";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type TUserProfileHeader = {
  userProjectsData: IUserProfileProjectSegregation | undefined;
  type?: string | undefined;
  /** 页签上的条数（工作项 / 缺陷 / 需求），按页签 key 取 */
  tabCounts?: Partial<Record<string, number>>;
  /** 摘要页显示侧栏时，移动端展示展开/收起按钮 */
  showProfileSidebarToggle?: boolean;
};

export const UserProfileHeader = observer(function UserProfileHeader(props: TUserProfileHeader) {
  const { userProjectsData, type = undefined, tabCounts, showProfileSidebarToggle } = props;
  // router
  const { workspaceSlug, userId } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  // store hooks
  const { toggleProfileSidebar, profileSidebarCollapsed } = useAppTheme();
  const { data: currentUser } = useUser();
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const { t } = useTranslation();
  // derived values
  const isAuthorized =
    currentUser?.id === userId ||
    allowWorkspacePermissionKeys([WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY], workspaceSlug.toString());

  if (!workspaceUserInfo) return null;

  const tabsList = isAuthorized ? [...PROFILE_VIEWER_TAB, ...PROFILE_ADMINS_TAB] : PROFILE_VIEWER_TAB;

  const userName = `${userProjectsData?.user_data?.first_name} ${userProjectsData?.user_data?.last_name}`;

  const isCurrentUser = currentUser?.id === userId;

  const breadcrumbLabel = isCurrentUser ? t("profile.page_label") : `${userName} ${t("profile.work")}`;

  const profileBasePath = `/${workspaceSlug}/profile/${userId}`;
  const isSummaryPath = pathname === `${profileBasePath}/` || pathname === profileBasePath;
  const showSidebarToggle =
    showProfileSidebarToggle !== undefined ? showProfileSidebarToggle : isSummaryPath;

  return (
    <Header>
      {/* 标题 + 页签合成一行（照项目页头）；页签上带条数 */}
      <Header.LeftItem className="h-full max-w-none flex-nowrap gap-3">
        <div className="flex shrink-0 items-center gap-2 text-14 font-semibold text-primary">
          <YourWorkIcon className="size-4 text-tertiary" />
          <span className="truncate">{breadcrumbLabel}</span>
        </div>
        <div className="hidden h-5 w-1 shrink-0 border-l border-subtle md:block" />
        <TabNavigationList className="hidden h-full md:flex">
          {tabsList.map((tab) => {
            const isActive = pathname === `${profileBasePath}${tab.selected}`;
            const count = tabCounts?.[tab.key];
            return (
              <div key={tab.route} className="relative flex h-full items-center">
                {isActive && (
                  <span className="absolute -bottom-px left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-(--text-color-icon-primary)" />
                )}
                <Link href={`${profileBasePath}/${tab.route}`}>
                  <TabNavigationItem isActive={isActive}>
                    <span>{t(tab.i18n_label)}</span>
                    {count !== undefined && <span className="text-12 font-normal text-tertiary tabular-nums">{count}</span>}
                  </TabNavigationItem>
                </Link>
              </div>
            );
          })}
        </TabNavigationList>
      </Header.LeftItem>
      <Header.RightItem>
        <div className="flex gap-4 md:hidden">
          <CustomMenu
            maxHeight={"md"}
            className="flex flex-grow justify-center text-13 text-secondary"
            placement="bottom-start"
            customButton={
              <div className="flex items-center gap-2 rounded-md border border-subtle px-2 py-1.5">
                <span className="flex flex-grow justify-center text-13 text-secondary">{type}</span>
                <ChevronDownIcon className="h-4 w-4 text-placeholder" />
              </div>
            }
            customButtonClassName="flex flex-grow justify-center text-secondary text-13"
            closeOnSelect
          >
            <></>
            {tabsList.map((tab) => (
              <CustomMenu.MenuItem
                className="flex items-center gap-2"
                key={tab.route}
                onClick={() => router.push(`/${workspaceSlug}/profile/${userId}/${tab.route}`)}
              >
                <span className="w-full text-tertiary">{t(tab.i18n_label)}</span>
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
          {showSidebarToggle && (
            <div className="shrink-0 md:hidden">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  toggleProfileSidebar();
                }}
                appendIcon={
                  <PanelRight className={!profileSidebarCollapsed ? "text-accent-primary" : "text-secondary"} />
                }
              ></Button>
            </div>
          )}
        </div>
      </Header.RightItem>
    </Header>
  );
});
