/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// ui
import { PROJECT_VIEW_TRACKER_ELEMENTS, PROJECT_VIEWS_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Header } from "@plane/ui";
// components
import { ViewListHeader } from "@/components/views/view-list-header";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";

export const ProjectViewsHeader = observer(function ProjectViewsHeader() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  // store hooks
  const { toggleCreateViewModal } = useCommandPalette();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const canCreateView = allowProjectPermissionKeys(
    [PROJECT_VIEWS_CREATE_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  return (
    <>
      <Header>
        {/* 子菜单名已在顶部标签栏高亮，列表页不再重复面包屑 */}
        <Header.RightItem className="ml-auto">
          <ViewListHeader />
          <div>
            <Button
              data-ph-element={PROJECT_VIEW_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON}
              variant="primary"
              size="lg"
              onClick={() => {
                if (canCreateView) toggleCreateViewModal(true);
              }}
              disabled={!canCreateView}
            >
              {t("project_views.add_view")}
            </Button>
          </div>
        </Header.RightItem>
      </Header>
    </>
  );
});
