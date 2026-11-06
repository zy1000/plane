/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { MODULE_TRACKER_ELEMENTS, PROJECT_MODULES_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Button } from "@plane/propel/button";
import { Header } from "@plane/ui";
// components
import { ModuleViewHeader } from "@/components/modules";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";

export const ModulesListHeader = observer(function ModulesListHeader() {
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { toggleCreateModuleModal } = useCommandPalette();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const { t } = useTranslation();

  // auth
  const canCreateModule = allowProjectPermissionKeys(
    [PROJECT_MODULES_CREATE_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );
  const isCreateModuleDisabled = !canCreateModule;

  return (
    <Header>
      {/* 子菜单名已在顶部标签栏高亮，列表页不再重复面包屑 */}
      <Header.RightItem className="ml-auto">
        <ModuleViewHeader />
        <Button
          variant="primary"
          data-ph-element={MODULE_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON}
          disabled={isCreateModuleDisabled}
          onClick={() => {
            toggleCreateModuleModal(true);
          }}
          size="lg"
        >
          <div className="block sm:hidden">{t("add")}</div>
          <div className="hidden sm:block">{t("project_module.add_module")}</div>
        </Button>
      </Header.RightItem>
    </Header>
  );
});
