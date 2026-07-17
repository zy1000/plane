/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { WORKSPACE_PROJECT_CREATE_PERMISSION_KEY } from "@plane/constants";
// components
import { CreateProjectModal } from "@/components/project/create-project-modal";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";

export type TWorkspaceLevelModalsProps = {
  workspaceSlug: string;
};

export const WorkspaceLevelModals = observer(function WorkspaceLevelModals(props: TWorkspaceLevelModalsProps) {
  const { workspaceSlug } = props;
  // store hooks
  const { isCreateProjectModalOpen, toggleCreateProjectModal } = useCommandPalette();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const canCreateProjects = allowWorkspacePermissionKeys(
    [WORKSPACE_PROJECT_CREATE_PERMISSION_KEY],
    workspaceSlug.toString()
  );

  return (
    <>
      {canCreateProjects && (
        <CreateProjectModal
          isOpen={isCreateProjectModalOpen}
          onClose={() => toggleCreateProjectModal(false)}
          workspaceSlug={workspaceSlug.toString()}
        />
      )}
    </>
  );
});
