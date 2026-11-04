/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";

type Props = {
  canAdd?: boolean;
  onAdd?: () => void;
};

export const MembersProjectSettingsHeader = observer(function MembersProjectSettingsHeader(props: Props) {
  const { canAdd = false, onAdd } = props;
  // translation
  const { t } = useTranslation();
  // derived values
  const settingsDetails = PROJECT_SETTINGS.members;
  const Icon = PROJECT_SETTINGS_ICONS.members;

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t(settingsDetails.i18n_label)}
                  icon={<Icon className="size-4 text-tertiary" />}
                />
              }
            />
          </Breadcrumbs>
        </div>
      }
      rightItem={
        onAdd ? (
          <Button variant="primary" size="lg" disabled={!canAdd} onClick={onAdd}>
            添加成员
          </Button>
        ) : undefined
      }
    />
  );
});
