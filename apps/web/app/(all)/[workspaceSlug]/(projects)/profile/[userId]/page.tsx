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
import { ProfileAssignedWorkLists } from "@/components/profile/overview/assigned-work-lists";
import { ProfileFocusMetrics } from "@/components/profile/overview/focus-metrics";
import { ProfileProjectContribution } from "@/components/profile/overview/project-contribution";
import { ProfileSummarySignals } from "@/components/profile/overview/summary-signals";
import { ProfileWorkloadOverview } from "@/components/profile/overview/workload-overview";
// constants
import { USER_PROFILE_DATA, USER_PROFILE_PROJECT_SEGREGATION } from "@/constants/fetch-keys";
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
  const { data: userProjectsData } = useSWR(USER_PROFILE_PROJECT_SEGREGATION(workspaceSlug, userId), () =>
    userService.getUserProfileProjectsSegregation(workspaceSlug, userId)
  );

  return (
    <>
      <PageHead title={t("profile.page_label")} />
      <ContentWrapper className="space-y-7">
        <ProfileSummarySignals userProfile={userProfile} />
        <ProfileFocusMetrics userProfile={userProfile} />
        <ProfileAssignedWorkLists userProfile={userProfile} />
        <ProfileWorkloadOverview userProfile={userProfile} />
        <ProfileProjectContribution userProjectsData={userProjectsData} />
      </ContentWrapper>
    </>
  );
}
