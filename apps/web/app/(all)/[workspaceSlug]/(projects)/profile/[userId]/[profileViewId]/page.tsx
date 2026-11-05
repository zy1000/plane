/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Navigate } from "react-router";
// components
import { PageHead } from "@/components/core/page-title";
import { ProfileIssuesPage } from "@/components/profile/profile-issues";
import type { Route } from "./+types/page";

const ProfilePageHeader = {
  subscribed: "Profile - Subscribed",
  work_items: "Profile - Work Items",
  defects: "Profile - Defects",
};

// 已分配 / 已创建 / 已延期不再是页签，改成工作项等页的「与本人关系」分组；旧链接跳到工作项
const LEGACY_RELATION_VIEW_IDS = ["assigned", "created", "overdue"];

function isValidProfileViewId(viewId: string): viewId is keyof typeof ProfilePageHeader {
  return viewId in ProfilePageHeader;
}

function ProfileIssuesTypePage({ params }: Route.ComponentProps) {
  const { workspaceSlug, userId, profileViewId } = params;

  if (LEGACY_RELATION_VIEW_IDS.includes(profileViewId))
    return <Navigate to={`/${workspaceSlug}/profile/${userId}/work_items/`} replace />;

  if (!isValidProfileViewId(profileViewId)) return null;

  const header = ProfilePageHeader[profileViewId];

  return (
    <>
      <PageHead title={header} />
      <ProfileIssuesPage type={profileViewId} />
    </>
  );
}

export default ProfileIssuesTypePage;
