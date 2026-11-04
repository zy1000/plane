/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";

type Props = {
  /** 列表页：右上角「新建权限组」 */
  canCreate?: boolean;
  onCreate?: () => void;
  /** 详情页：面包屑末级（组名）与右上角操作 */
  currentLabel?: string;
  rightItem?: ReactNode;
};

export const RolesProjectSettingsHeader = observer(function RolesProjectSettingsHeader(props: Props) {
  const { canCreate = false, onCreate, currentLabel, rightItem } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const settingsDetails = PROJECT_SETTINGS.roles;
  const Icon = PROJECT_SETTINGS_ICONS.roles;

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t(settingsDetails.i18n_label)}
                  href={currentLabel ? `/${workspaceSlug}/settings/projects/${projectId}/permission-groups/` : undefined}
                  icon={<Icon className="size-4 text-tertiary" />}
                  isLast={!currentLabel}
                />
              }
            />
            {currentLabel && (
              <Breadcrumbs.Item component={<BreadcrumbLink label={currentLabel} isLast />} isLast />
            )}
          </Breadcrumbs>
        </div>
      }
      rightItem={
        rightItem ??
        (onCreate ? (
          <Button variant="primary" size="lg" disabled={!canCreate} onClick={onCreate}>
            新建权限组
          </Button>
        ) : undefined)
      }
    />
  );
});
