/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { RequirementTypesList } from "@/components/workspace/settings/requirement-types/requirement-types-list";
// hooks
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { RequirementTypesWorkspaceSettingsHeader } from "./header";

const WorkspaceRequirementTypesPage = observer(function WorkspaceRequirementTypesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 后端只要求登录，模板管理入口今天也允许任何成员维护 —— 这里保持同一口径
  const canView = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);

  const {
    requirementTypes,
    isLoading,
    isMutating,
    error,
    fetchRequirementTypes,
    createRequirementType,
    updateRequirementType,
    deleteRequirementType,
  } = useRequirementTypes(workspaceSlug);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<RequirementTypesWorkspaceSettingsHeader />}>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - 需求类型` : undefined} />
      <RequirementTypesList
        workspaceSlug={workspaceSlug}
        canEdit={canView}
        requirementTypes={requirementTypes}
        isLoading={isLoading}
        isMutating={isMutating}
        error={error}
        fetchRequirementTypes={fetchRequirementTypes}
        createRequirementType={createRequirementType}
        updateRequirementType={updateRequirementType}
        deleteRequirementType={deleteRequirementType}
      />
    </SettingsContentWrapper>
  );
});

export default WorkspaceRequirementTypesPage;
