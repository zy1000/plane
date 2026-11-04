/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Search } from "lucide-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectPermissionGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { InheritedGroupsNote } from "@/components/project/settings/permission-groups/inherited-groups-note";
import { ProjectPermissionGroupFormModal } from "@/components/project/settings/permission-groups/permission-group-form-modal";
import { ProjectPermissionGroupsTable } from "@/components/project/settings/permission-groups/permission-groups-table";
import { deleteActionLabel, deleteConfirmCopy, errorMessage } from "@/components/project/settings/permission-groups/shared";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { getScopeKeys } from "@/components/workspace/settings/permission-groups";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { Route } from "./+types/page";
import { RolesProjectSettingsHeader } from "./header";

function ProjectPermissionGroupsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const router = useAppRouter();
  const [query, setQuery] = useState("");
  const [formState, setFormState] = useState<{ open: boolean; group: TProjectPermissionGroup | null }>({
    open: false,
    group: null,
  });
  // 待确认的删除：本项目组是真删，模板组是「删除引用」
  const [pending, setPending] = useState<TProjectPermissionGroup | null>(null);
  const [isPendingSubmitting, setIsPendingSubmitting] = useState(false);

  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const { roles: groups, inheritedGroups, isLoading, fetchRoles, createRole, updateRole, deleteRole } = useProjectRoles(
    workspaceSlug,
    projectId
  );

  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.roles.permissionKeys ?? [], workspaceSlug, projectId);
  const canManage = allowProjectPermissionKeys(PROJECT_SETTINGS.roles.editPermissionKeys ?? [], workspaceSlug, projectId);
  useSWR(canView ? `PROJECT_PERMISSION_GROUPS_${workspaceSlug}_${projectId}` : null, canView ? fetchRoles : null);

  const totalKeyCount = useMemo(() => getScopeKeys("project").length, []);
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((group) => group.name.toLowerCase().includes(q)) : groups;
  }, [groups, query]);
  const templateCount = groups.filter((group) => group.source === "template").length;

  const openDetail = (group: TProjectPermissionGroup) =>
    router.push(`/${workspaceSlug}/settings/projects/${projectId}/permission-groups/${group.id}/`);

  const handlePendingConfirm = async () => {
    if (!pending) return;
    const label = deleteActionLabel(pending);
    setIsPendingSubmitting(true);
    try {
      await deleteRole(pending.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已${label}` });
      setPending(null);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: `${label}失败`, message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsPendingSubmitting(false);
    }
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper
      header={
        <RolesProjectSettingsHeader
          canCreate={canManage}
          onCreate={() => setFormState({ open: true, group: null })}
        />
      }
      hugging
    >
      <PageHead title={currentProjectDetails?.name ? `${currentProjectDetails.name} - 权限组` : undefined} />
      <div className="flex flex-col gap-5">
        <InheritedGroupsNote workspaceSlug={workspaceSlug} groups={inheritedGroups} />

        <div className="flex items-center justify-between gap-4">
          <div className="flex h-9 w-64 items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-3">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索权限组"
              className="min-w-0 flex-1 border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
            />
          </div>
          <span className="text-13 text-tertiary">
            {groups.length} 个权限组 · {templateCount} 个引用模板
          </span>
        </div>

        <ProjectPermissionGroupsTable
          groups={filteredGroups}
          totalKeyCount={totalKeyCount}
          canManage={canManage}
          isLoading={isLoading}
          onOpen={openDetail}
          onEdit={(group) => setFormState({ open: true, group })}
          onDelete={(group) => setPending(group)}
        />
      </div>

      <ProjectPermissionGroupFormModal
        isOpen={formState.open}
        group={formState.group}
        copySources={groups}
        onClose={() => setFormState({ open: false, group: null })}
        onSubmit={(data) =>
          formState.group
            ? updateRole(formState.group.id, { name: data.name, description: data.description })
            : createRole(data).then((row) => openDetail(row))
        }
      />

      {pending && (
        <AlertModalCore
          isOpen
          variant="danger"
          title={deleteConfirmCopy(pending).title}
          content={deleteConfirmCopy(pending).content}
          primaryButtonText={{ default: deleteActionLabel(pending), loading: "处理中…" }}
          isSubmitting={isPendingSubmitting}
          handleClose={() => setPending(null)}
          handleSubmit={() => void handlePendingConfirm()}
        />
      )}
    </SettingsContentWrapper>
  );
}

export default observer(ProjectPermissionGroupsPage);
