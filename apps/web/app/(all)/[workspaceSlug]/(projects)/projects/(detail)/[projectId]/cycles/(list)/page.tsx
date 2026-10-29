/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
// plane imports
import { useTheme } from "next-themes";
import { EUserPermissionsLevel, CYCLE_TRACKER_ELEMENTS, PROJECT_SPRINTS_VIEW_PERMISSION_KEY, PROJECT_SPRINTS_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EUserProjectRoles } from "@plane/types";
// assets
import darkEmptyState from "@/app/assets/empty-state/disabled-feature/cycles-dark.webp?url";
import lightEmptyState from "@/app/assets/empty-state/disabled-feature/cycles-light.webp?url";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { CyclesView } from "@/components/cycles/cycles-view";
import { useCycleListFiltering } from "@/components/cycles/filters/use-cycle-list-filter";
import { CycleCreateUpdateModal } from "@/components/cycles/modal";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { buildProjectSettingsPath, getPathWithSearch } from "@/components/settings/project/navigation";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectCyclesPage({ params }: Route.ComponentProps) {
  // states
  const [createModal, setCreateModal] = useState(false);
  // store hooks
  const { currentProjectCycleIds, getFilteredCycleIds, loader } = useCycle();
  const { getProjectById, currentProjectDetails } = useProject();
  // router
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceSlug, projectId } = params;
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // 富筛选：建实例 + 注册属性配置（页头的漏斗按钮与这里拿的是同一份实例）
  const filter = useCycleListFiltering(workspaceSlug, projectId);
  const { allowPermissions, allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  // derived values
  const resolvedEmptyState = resolvedTheme === "light" ? lightEmptyState : darkEmptyState;
  const totalCycles = currentProjectCycleIds?.length ?? 0;
  const filteredCycles = getFilteredCycleIds(projectId, false)?.length ?? 0;
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - ${t("common.cycles", { count: 2 })}` : undefined;
  const hasAdminLevelPermission = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const canCreateSprint = allowProjectPermissionKeys([PROJECT_SPRINTS_CREATE_PERMISSION_KEY], workspaceSlug, projectId);
  const currentPath = getPathWithSearch(pathname, searchParams);

  const canViewSprints = allowProjectPermissionKeys(
    [PROJECT_SPRINTS_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canViewSprints) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  // No access to cycle
  if (currentProjectDetails?.cycle_view === false)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("disabled_project.empty_state.cycle.title")}
          description={t("disabled_project.empty_state.cycle.description")}
          assetPath={resolvedEmptyState}
          primaryButton={{
            text: t("disabled_project.empty_state.cycle.primary_button.text"),
            onClick: () => {
              router.push(
                buildProjectSettingsPath({
                  workspaceSlug,
                  projectId,
                  settingsPath: "/features",
                  currentPath,
                })
              );
            },
            disabled: !hasAdminLevelPermission,
          }}
        />
      </div>
    );

  if (loader) return <CycleModuleListLayoutLoader />;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        <CycleCreateUpdateModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isOpen={createModal}
          handleClose={() => setCreateModal(false)}
        />
        {totalCycles === 0 ? (
          <div className="h-full place-items-center">
            <EmptyStateDetailed
              assetKey="cycle"
              title={t("project_empty_state.cycles.title")}
              description={t("project_empty_state.cycles.description")}
              actions={[
                {
                  label: t("project_empty_state.cycles.cta_primary"),
                  onClick: () => setCreateModal(true),
                  variant: "primary",
                  disabled: !canCreateSprint,
                  "data-ph-element": CYCLE_TRACKER_ELEMENTS.EMPTY_STATE_ADD_BUTTON,
                },
              ]}
            />
          </div>
        ) : (
          <>
            <FiltersRow
              filter={filter}
              summary={t("project_cycles.filters.summary", { filtered: filteredCycles, total: totalCycles })}
            />
            <CyclesView workspaceSlug={workspaceSlug} projectId={projectId} />
          </>
        )}
      </div>
    </>
  );
}

export default observer(ProjectCyclesPage);
