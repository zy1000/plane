/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { PROJECT_RELEASES_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { useUserPermissions } from "@/hooks/store/user";
import { ReleaseDetailContent } from "@/components/releases/release-detail-content";
import type { Route } from "./+types/page";

function ReleaseOverviewPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, releaseId } = params;
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  const canViewReleases = allowProjectPermissionKeys(
    [PROJECT_RELEASES_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canViewReleases) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title="Release Overview" />
      {releaseId ? <ReleaseDetailContent releaseId={releaseId.toString()} isOpen /> : null}
    </>
  );
}

export default observer(ReleaseOverviewPage);
