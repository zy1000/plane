/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { PermissionsPanel } from "@/components/workspace/settings/roles/permissions-panel";
import { RolesSidebar } from "@/components/workspace/settings/roles/roles-sidebar";
// hooks
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { RolesWorkspaceSettingsHeader } from "./header";

const WorkspaceRolesPage = observer(function WorkspaceRolesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  // selected role state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // derived permissions
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.WORKSPACE
  );

  // workspace roles hook
  const {
    roles,
    isLoading,
    getRolePermissionState,
    loadRolePermissions,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    togglePermission,
  } = useWorkspaceRoles(workspaceSlug);

  // fetch roles on mount
  useSWR(canView ? `WORKSPACE_ROLES_${workspaceSlug}` : null, canView ? fetchRoles : null);

  // auto-select first role when roles load
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
    // if the selected role was deleted, select the first remaining role
    if (selectedRoleId && !roles.find((r) => r.id === selectedRoleId)) {
      setSelectedRoleId(roles.length > 0 ? roles[0].id : null);
    }
  }, [roles, selectedRoleId]);

  // load role permissions when selection changes
  useEffect(() => {
    if (selectedRoleId) {
      void loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId, loadRolePermissions]);

  // 切回浏览器标签时刷新当前角色权限，避免他人已修改而本地仍为旧缓存
  useEffect(() => {
    if (!selectedRoleId) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadRolePermissions(selectedRoleId);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selectedRoleId, loadRolePermissions]);

  // page title
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 角色` : undefined;

  // selected role & permission state
  const selectedRole = selectedRoleId ? (roles.find((r) => r.id === selectedRoleId) ?? null) : null;
  const rolePermissionState = selectedRoleId ? getRolePermissionState(selectedRoleId) : null;

  const handleSelectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleDeleteRole = async (roleId: string) => {
    await deleteRole(roleId);
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<RolesWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />

      <section
        className={cn(
          "flex h-[calc(100svh-8rem)] min-h-[560px] w-full overflow-hidden rounded-lg border border-subtle bg-surface-1",
          {
            "opacity-60 pointer-events-none": !canView,
          }
        )}
      >
        {/* Left: Roles list sidebar */}
        <RolesSidebar
          roles={roles}
          totalRoleCount={roles.length}
          isLoading={isLoading}
          isAdmin={isAdmin}
          selectedRoleId={selectedRoleId}
          onSelectRole={handleSelectRole}
          onCreate={createRole}
          onUpdate={async (roleId, data) => {
            await updateRole(roleId, data);
          }}
          onDelete={handleDeleteRole}
        />

        {/* Right: Permissions panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Selected role info header */}
          {selectedRole && (
            <div className="flex shrink-0 items-start gap-3 border-b border-subtle bg-surface-1 px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-body-md-semibold text-primary">{selectedRole.name}</h2>
                {selectedRole.description?.trim() && (
                  <p className="truncate text-body-xs-regular text-tertiary">{selectedRole.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Permissions panel */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <PermissionsPanel
              role={selectedRole}
              permissions={rolePermissionState?.data?.permissions ?? []}
              permissionKeys={rolePermissionState?.data?.permission_keys ?? []}
              isLoading={Boolean(rolePermissionState?.isLoading)}
              isAdmin={isAdmin}
              onTogglePermission={togglePermission}
            />
          </div>
        </div>
      </section>
    </SettingsContentWrapper>
  );
});

export default WorkspaceRolesPage;
