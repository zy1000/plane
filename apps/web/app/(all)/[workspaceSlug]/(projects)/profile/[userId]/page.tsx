/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { ProfilePriorityDistribution } from "@/components/profile/overview/priority-distribution";
import { ProfileSummaryProgress } from "@/components/profile/overview/summary-progress";
import { ProfileSummarySignals } from "@/components/profile/overview/summary-signals";
import { ProfileStats } from "@/components/profile/overview/stats";
// constants
import { USER_PROFILE_DATA } from "@/constants/fetch-keys";
// services
import { UserService } from "@/services/user.service";
import type { Route } from "./+types/page";
const userService = new UserService();

export default function ProfileOverviewPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, userId } = params;

  const { t } = useTranslation();
  const { data: userProfile } = useSWR(USER_PROFILE_DATA(workspaceSlug, userId), () =>
    userService.getUserProfileData(workspaceSlug, userId)
  );

  return (
    <>
      <PageHead title={t("profile.page_label")} />
      <ContentWrapper className="space-y-7">
        <ProfileStats userProfile={userProfile} />
        <div className="grid grid-cols-1 items-stretch gap-7 xl:grid-cols-2">
          <ProfileSummaryProgress userProfile={userProfile} />
          <ProfilePriorityDistribution userProfile={userProfile} />
        </div>
        <ProfileSummarySignals userProfile={userProfile} />
      </ContentWrapper>
    </>
  );
}
