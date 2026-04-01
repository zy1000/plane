/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Search, X } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import {
  getPermissionScopeSummary,
  PermissionsPanel,
  type PermissionScope,
} from "@/components/workspace/settings/roles/permissions-panel";
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

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeScope, setActiveScope] = useState<PermissionScope>("workspace");

  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // derived permissions
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.WORKSPACE
  );

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
  } = useWorkspaceRoles(workspaceSlug, "workspace");

  useSWR(canView ? `WORKSPACE_ROLES_${workspaceSlug}` : null, canView ? fetchRoles : null);

  // auto-select first role
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
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

  // 切回浏览器标签时刷新当前角色权限
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

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 权限` : undefined;
  const selectedRole = selectedRoleId ? (roles.find((r) => r.id === selectedRoleId) ?? null) : null;
  const rolePermissionState = selectedRoleId ? getRolePermissionState(selectedRoleId) : null;
  const activeScopeSummary = useMemo(
    () =>
      getPermissionScopeSummary(
        rolePermissionState?.data?.permissions ?? [],
        rolePermissionState?.data?.permission_keys ?? [],
        activeScope
      ),
    [rolePermissionState?.data?.permissions, rolePermissionState?.data?.permission_keys, activeScope]
  );

  const handleSelectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    setSearchQuery("");
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

      <p className="mb-3 text-body-xs-regular text-tertiary">管理工作区级别的权限，控制成员、设置、项目创建等能力</p>

      <section
        className={cn(
          "flex h-[calc(100svh-12rem)] min-h-[520px] w-full overflow-hidden rounded-lg border border-subtle bg-surface-1",
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
          onCreate={(data) => createRole({ ...data, type: "workspace" })}
          onUpdate={async (roleId, data) => {
            await updateRole(roleId, data);
          }}
          onDelete={handleDeleteRole}
        />

        {/* Right: Permissions panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedRole && (
            <div className="flex shrink-0 items-center gap-4 border-b border-subtle bg-surface-1 px-6 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-body-md-semibold text-primary">{selectedRole.name}</h2>
                  {!searchQuery && activeScopeSummary.totalPermissions > 0 && (
                    <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs font-medium text-accent-primary tabular-nums">
                      {activeScopeSummary.totalBound}/{activeScopeSummary.totalPermissions}
                    </span>
                  )}
                </div>
                {selectedRole.description?.trim() && (
                  <p className="truncate text-body-xs-regular text-tertiary">{selectedRole.description}</p>
                )}
              </div>
              <div
                className={cn(
                  "flex w-52 shrink-0 items-center gap-1.5 rounded-md border py-1.5 pl-2.5 pr-1.5 transition-colors duration-150",
                  searchQuery
                    ? "border-accent-primary/40 bg-accent-primary/4"
                    : "border-subtle bg-surface-2 focus-within:border-accent-primary/40 focus-within:bg-surface-1"
                )}
              >
                <Search
                  className={cn(
                    "size-3.5 shrink-0",
                    searchQuery ? "text-accent-primary" : "text-placeholder"
                  )}
                />
                <input
                  type="text"
                  className="min-w-0 flex-1 border-none bg-transparent text-body-xs-regular outline-none placeholder:text-placeholder"
                  placeholder="搜索权限..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="flex size-4 cursor-pointer items-center justify-center rounded text-placeholder transition-colors hover:bg-layer-1-hover hover:text-primary"
                    aria-label="清除搜索"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <PermissionsPanel
              role={selectedRole}
              permissions={rolePermissionState?.data?.permissions ?? []}
              permissionKeys={rolePermissionState?.data?.permission_keys ?? []}
              isLoading={Boolean(rolePermissionState?.isLoading)}
              isAdmin={isAdmin}
              searchQuery={searchQuery}
              onTogglePermission={togglePermission}
              activeScope={activeScope}
              onActiveScopeChange={setActiveScope}
            />
          </div>
        </div>
      </section>
    </SettingsContentWrapper>
  );
});

export default WorkspaceRolesPage;
