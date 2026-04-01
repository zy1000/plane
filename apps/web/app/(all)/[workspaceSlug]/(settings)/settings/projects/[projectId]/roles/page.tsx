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
import { PROJECT_SETTINGS } from "@plane/constants";
import type { IWorkspaceRole } from "@plane/types";
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
import { ImportTemplateModal } from "@/components/project/settings/roles/import-template-modal";
// hooks
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { RolesProjectSettingsHeader } from "./header";

const ProjectRolesPage = observer(function ProjectRolesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeScope, setActiveScope] = useState<PermissionScope>("workspace");

  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const { currentProjectDetails } = useProject();

  const isAdmin = allowProjectPermissionKeys(
    ["project.role.create", "project.role.edit", "project.role.delete"],
    workspaceSlug,
    projectId
  );
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.roles.permissionKeys ?? [], workspaceSlug, projectId);

  // 项目角色
  const {
    roles,
    isLoading,
    getRolePermissionState,
    loadRolePermissions,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    importFromTemplate,
    togglePermission,
  } = useProjectRoles(workspaceSlug, projectId);

  // 工作区项目角色模板（只取 project_template 类型）
  const {
    roles: templates,
    isLoading: isTemplatesLoading,
    fetchRoles: fetchTemplates,
  } = useWorkspaceRoles(workspaceSlug, "project_template");

  useSWR(canView ? `PROJECT_ROLES_${workspaceSlug}_${projectId}` : null, canView ? fetchRoles : null);
  useSWR(
    showImportModal ? `WORKSPACE_TEMPLATES_${workspaceSlug}` : null,
    showImportModal ? fetchTemplates : null
  );

  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
    if (selectedRoleId && !roles.find((r) => r.id === selectedRoleId)) {
      setSelectedRoleId(roles.length > 0 ? roles[0].id : null);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (selectedRoleId) {
      void loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId, loadRolePermissions]);

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

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - 权限` : undefined;
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

  const handleImport = async (workspaceRoleId: string) => {
    const newRole = await importFromTemplate(workspaceRoleId);
    setSelectedRoleId(newRole.id);
  };

  const handleDeleteRole = async (roleId: string) => {
    await deleteRole(roleId);
  };

  // RolesSidebar 的 onUpdate 接口签名 —— 转换为 IWorkspaceRole 类型（复用组件）
  const handleUpdate = async (roleId: string, data: { name: string; description: string }) => {
    await updateRole(roleId, data);
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<RolesProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />

      {/* Header row */}
      <div className="mb-4">
        <p className="text-13 font-medium leading-4 text-tertiary">
          管理此项目内生效的自定义角色，可从工作区模板导入或手动创建
        </p>
      </div>

      <section
        className={cn(
          "flex h-[calc(100svh-12rem)] min-h-[520px] w-full overflow-hidden rounded-lg border border-subtle bg-surface-1",
          { "opacity-60 pointer-events-none": !canView }
        )}
      >
        {/* Left: Project roles sidebar — 复用工作区角色侧边栏，角色 type 无关 */}
        <RolesSidebar
          roles={roles as unknown as IWorkspaceRole[]}
          totalRoleCount={roles.length}
          isLoading={isLoading}
          isAdmin={isAdmin}
          selectedRoleId={selectedRoleId}
          onSelectRole={handleSelectRole}
          onCreate={async (data) => {
            const newRole = await createRole(data);
            return newRole as unknown as IWorkspaceRole;
          }}
          onUpdate={handleUpdate}
          onDelete={handleDeleteRole}
          onImport={isAdmin ? () => setShowImportModal(true) : undefined}
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
                  {(selectedRole as unknown as { source_template_name?: string | null }).source_template_name && (
                    <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-13 font-medium leading-4 text-accent-primary">
                      来自：{(selectedRole as unknown as { source_template_name?: string | null }).source_template_name}
                    </span>
                  )}
                </div>
                {(selectedRole as unknown as { description?: string }).description?.trim() && (
                  <p className="truncate text-13 font-medium leading-4 text-tertiary">
                    {(selectedRole as unknown as { description?: string }).description}
                  </p>
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
                <Search className={cn("size-3.5 shrink-0", searchQuery ? "text-accent-primary" : "text-placeholder")} />
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
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <PermissionsPanel
              role={selectedRole as unknown as IWorkspaceRole}
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

      {/* Import template modal */}
      <ImportTemplateModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        templates={templates}
        isTemplatesLoading={isTemplatesLoading}
        onImport={handleImport}
      />
    </SettingsContentWrapper>
  );
});

export default ProjectRolesPage;
