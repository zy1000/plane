/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane types
import { WORKSPACE_SETTINGS } from "@plane/constants";
// components
import { useTranslation } from "@plane/i18n";
import type { TWorkspaceSettingsTabs } from "@plane/types";
import type { TPowerKContext } from "@/components/power-k/core/types";
import { PowerKSettingsMenu } from "@/components/power-k/menus/settings";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  context: TPowerKContext;
  handleSelect: (href: string) => void;
};

export const PowerKOpenWorkspaceSettingsMenu = observer(function PowerKOpenWorkspaceSettingsMenu(props: Props) {
  const { context, handleSelect } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { allowWorkspacePermissionKeys, workspaceInfoBySlug } = useUserPermissions();
  // derived values
  const settingsList = Object.values(WORKSPACE_SETTINGS).filter((setting) => {
    const workspaceSlug = context.params.workspaceSlug?.toString();
    if (!workspaceSlug || !workspaceInfoBySlug(workspaceSlug)) return false;
    const permissionKeys = "permissionKeys" in setting ? setting.permissionKeys : undefined;
    const requiresMembership = "requiresMembership" in setting ? setting.requiresMembership : false;
    return permissionKeys?.length
      ? allowWorkspacePermissionKeys(permissionKeys, workspaceSlug)
      : requiresMembership;
  });
  const settingsListWithIcons = settingsList.map((setting) => ({
    ...setting,
    label: t(setting.i18n_label),
    icon: WORKSPACE_SETTINGS_ICONS[setting.key as TWorkspaceSettingsTabs],
  }));

  return <PowerKSettingsMenu settings={settingsListWithIcons} onSelect={(setting) => handleSelect(setting.href)} />;
});
