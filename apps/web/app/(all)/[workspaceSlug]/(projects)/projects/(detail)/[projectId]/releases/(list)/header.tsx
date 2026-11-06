/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { MODULE_TRACKER_ELEMENTS, PROJECT_RELEASES_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Header } from "@plane/ui";
import { ReleaseViewHeader } from "@/components/releases/release-view-header";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";

export const ReleasesListHeader = observer(function ReleasesListHeader() {
  const { workspaceSlug, projectId } = useParams();
  const { toggleCreateReleaseModal } = useCommandPalette();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { t } = useTranslation();

  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const projectIdValue = projectId?.toString() ?? "";
  const canUserCreateRelease =
    !!workspaceSlugValue &&
    !!projectIdValue &&
    allowProjectPermissionKeys([PROJECT_RELEASES_CREATE_PERMISSION_KEY], workspaceSlugValue, projectIdValue);

  return (
    <Header>
      {/* 子菜单名已在顶部标签栏高亮，列表页不再重复面包屑 */}
      <Header.RightItem className="ml-auto">
        <ReleaseViewHeader />
        <Button
          variant="primary"
          data-ph-element={MODULE_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON}
          disabled={!canUserCreateRelease}
          onClick={() => {
            if (!canUserCreateRelease) return;
            toggleCreateReleaseModal(true);
          }}
          size="lg"
        >
          <div className="block sm:hidden">{t("add")}</div>
          <div className="hidden sm:block">{t("project_release.add_release") ?? "添加发布"}</div>
        </Button>
      </Header.RightItem>
    </Header>
  );
});
