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
import {
  WORKSPACE_ROLE_CREATE_PERMISSION_KEY,
  WORKSPACE_ROLE_DELETE_PERMISSION_KEY,
  WORKSPACE_ROLE_EDIT_PERMISSION_KEY,
  WORKSPACE_ROLE_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import type { TWorkspaceRoleType } from "@plane/types";
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
import { TemplatesWorkspaceSettingsHeader } from "./header";

const ROLE_TYPE: TWorkspaceRoleType = "project_template";

const WorkspaceTemplatesPage = observer(function WorkspaceTemplatesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeScope, setActiveScope] = useState<PermissionScope>("project");

  // store hooks
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // derived permissions
  const canView = allowWorkspacePermissionKeys([WORKSPACE_ROLE_VIEW_PERMISSION_KEY], workspaceSlug);
  const canCreate = allowWorkspacePermissionKeys([WORKSPACE_ROLE_CREATE_PERMISSION_KEY], workspaceSlug);
  const canEdit = allowWorkspacePermissionKeys([WORKSPACE_ROLE_EDIT_PERMISSION_KEY], workspaceSlug);
  const canDelete = allowWorkspacePermissionKeys([WORKSPACE_ROLE_DELETE_PERMISSION_KEY], workspaceSlug);

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
  } = useWorkspaceRoles(workspaceSlug, ROLE_TYPE);

  useSWR(canView ? `WORKSPACE_ROLES_${workspaceSlug}` : null, canView ? fetchRoles : null);

  const effectiveSelectedRoleId = selectedRoleId ?? roles[0]?.id ?? null;

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
    if (effectiveSelectedRoleId) {
      void loadRolePermissions(effectiveSelectedRoleId);
    }
  }, [effectiveSelectedRoleId, loadRolePermissions]);

  // 切回浏览器标签时刷新当前角色权限
  useEffect(() => {
    if (!effectiveSelectedRoleId) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadRolePermissions(effectiveSelectedRoleId);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [effectiveSelectedRoleId, loadRolePermissions]);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 模板` : undefined;
  const selectedRole = effectiveSelectedRoleId
    ? (roles.find((r) => r.id === effectiveSelectedRoleId) ?? null)
    : null;
  const rolePermissionState = effectiveSelectedRoleId ? getRolePermissionState(effectiveSelectedRoleId) : null;

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
    <SettingsContentWrapper header={<TemplatesWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />

      <p className="mb-3 text-13 font-medium leading-4 text-tertiary">定义可复用的项目角色模板，可导入到具体项目后生效</p>

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
          isAdmin={canEdit}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          selectedRoleId={effectiveSelectedRoleId}
          onSelectRole={handleSelectRole}
          onCreate={(data) => createRole({ ...data, type: ROLE_TYPE })}
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
                  <h2 className="truncate text-13 font-medium leading-4 text-primary">{selectedRole.name}</h2>
                  {!searchQuery && activeScopeSummary.totalPermissions > 0 && (
                    <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-13 font-medium leading-4 text-accent-primary tabular-nums">
                      {activeScopeSummary.totalBound}/{activeScopeSummary.totalPermissions}
                    </span>
                  )}
                </div>
                {selectedRole.description?.trim() && (
                  <p className="truncate text-13 font-medium leading-4 text-tertiary">{selectedRole.description}</p>
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
                  className="min-w-0 flex-1 border-none bg-transparent text-13 font-medium leading-4 outline-none placeholder:text-placeholder"
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
              isLoading={Boolean(
                effectiveSelectedRoleId &&
                  !rolePermissionState?.data &&
                  (rolePermissionState?.isLoading || !rolePermissionState?.loaded)
              )}
              isAdmin={canEdit}
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

export default WorkspaceTemplatesPage;
