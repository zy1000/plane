/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
// i18n
import { PROJECT_TRACKER_ELEMENTS, WORKSPACE_PROJECT_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Button } from "@plane/propel/button";
import { ProjectIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";
// plane web constants
// components
import HeaderFilters from "./filters";
import { ProjectSearch } from "./search-projects";

export const ProjectsBaseHeader = observer(function ProjectsBaseHeader() {
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const { allowWorkspacePermissionKeys } = useUserPermissions();

  const pathname = usePathname();
  // auth
  const isAuthorizedUser = allowWorkspacePermissionKeys([WORKSPACE_PROJECT_CREATE_PERMISSION_KEY]);
  const isArchived = pathname.includes("/archives");

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("workspace_projects.label", { count: 2 })}
                icon={<ProjectIcon className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {isArchived && <Breadcrumbs.Item component={<BreadcrumbLink label="Archived" />} />}
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <ProjectSearch />
        <div className="hidden md:flex">
          <HeaderFilters />
        </div>
        {!isArchived && (
          <Tooltip
            disabled={isAuthorizedUser}
            tooltipContent={!isAuthorizedUser ? t("workspace_projects.error.permission") : null}
            position="bottom"
          >
            <span className="inline-flex" tabIndex={isAuthorizedUser ? undefined : 0}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  toggleCreateProjectModal(true);
                }}
                disabled={!isAuthorizedUser}
                data-ph-element={PROJECT_TRACKER_ELEMENTS.CREATE_HEADER_BUTTON}
                className="items-center gap-1"
              >
                <span className="hidden sm:inline-block">{t("workspace_projects.create.label")}</span>
                <span className="inline-block sm:hidden">{t("workspace_projects.label", { count: 1 })}</span>
              </Button>
            </span>
          </Tooltip>
        )}
      </Header.RightItem>
    </Header>
  );
});
