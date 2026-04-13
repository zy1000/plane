/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel, MODULE_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { Rocket } from "lucide-react";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ReleaseViewHeader } from "@/components/releases/release-view-header";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const ReleasesListHeader = observer(function ReleasesListHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { toggleCreateReleaseModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { loader } = useProject();
  const { t } = useTranslation();

  const canUserCreateRelease = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <div>
          <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("project_release.breadcrumb_releases_link")}
                  href={`/${workspaceSlug}/projects/${projectId}/releases`}
                  icon={<Rocket className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <ReleaseViewHeader />
        {canUserCreateRelease ? (
          <Button
            variant="primary"
            data-ph-element={MODULE_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON}
            onClick={() => {
              toggleCreateReleaseModal(true);
            }}
            size="lg"
          >
            <div className="block sm:hidden">{t("add")}</div>
            <div className="hidden sm:block">{t("project_release.add_release") ?? "添加发布"}</div>
          </Button>
        ) : (
          <></>
        )}
      </Header.RightItem>
    </Header>
  );
});
