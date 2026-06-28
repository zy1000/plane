/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { ProfilePriorityDistribution } from "@/components/profile/overview/priority-distribution";
import { ProfileStats } from "@/components/profile/overview/stats";
import { ProfileWorkbenchHero } from "@/components/profile/overview/workbench-hero";
import { ProfileWorkProgress } from "@/components/profile/overview/work-progress";
// constants
import { USER_PROFILE_DATA } from "@/constants/fetch-keys";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { UserService } from "@/services/user.service";
import type { Route } from "./+types/page";
const userService = new UserService();

function ProfileOverviewPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, userId } = params;

  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { data: userProfile } = useSWR(USER_PROFILE_DATA(workspaceSlug, userId), () =>
    userService.getUserProfileData(workspaceSlug, userId)
  );

  const currentHour = new Date().getHours();
  const greetingKey =
    currentHour < 12
      ? "profile.stats.greeting.morning"
      : currentHour < 18
        ? "profile.stats.greeting.afternoon"
        : "profile.stats.greeting.evening";
  const isCurrentUserProfile = currentUser?.id === userId;
  const greeting = isCurrentUserProfile
    ? t(greetingKey, { name: currentUser?.display_name ?? "" })
    : t("profile.stats.greeting.member");
  const dashboardTitle = isCurrentUserProfile
    ? t("profile.stats.dashboard_title_self")
    : t("profile.stats.dashboard_title_member");

  return (
    <>
      <PageHead title={t("profile.page_label")} />
      <ContentWrapper className="space-y-8">
        <ProfileWorkbenchHero
          greeting={greeting}
          title={dashboardTitle}
          description={t("profile.stats.dashboard_description")}
          userProfile={userProfile}
        />
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-7">
            <ProfileWorkProgress userProfile={userProfile} />
            <ProfileStats userProfile={userProfile} />
          </div>
          <ProfilePriorityDistribution userProfile={userProfile} />
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(ProfileOverviewPage);
