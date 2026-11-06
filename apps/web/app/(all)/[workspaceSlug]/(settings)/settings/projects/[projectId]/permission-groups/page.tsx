/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectPermissionGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { PermissionPageTabs } from "@/components/project/settings/permission-groups/permission-page-tabs";
import type { TPermissionPageTab } from "@/components/project/settings/permission-groups/permission-page-tabs";
import { ProjectPermissionGroupFormModal } from "@/components/project/settings/permission-groups/permission-group-form-modal";
import { ProjectPermissionGroupsTable } from "@/components/project/settings/permission-groups/permission-groups-table";
import type { TProjectGroupFilter } from "@/components/project/settings/permission-groups/permission-groups-table";
import { deleteActionLabel, deleteConfirmCopy, errorMessage } from "@/components/project/settings/permission-groups/shared";
import {
  ProjectVisibleMembersPanel,
  useProjectVisibleMembers,
} from "@/components/project/settings/permission-groups/visible-members";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import {
  PermissionGroupSearch,
  PermissionGroupSegmented,
  getScopeKeys,
} from "@/components/workspace/settings/permission-groups";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<TProjectGroupFilter>("all");
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
  // 页签上的「可访问人员」人数；页签内容用同一个 SWR key
  const { data: visibleMembers, refresh: refreshVisibleMembers } = useProjectVisibleMembers(
    workspaceSlug,
    projectId,
    canView
  );

  // 页签放在 URL 上（?tab=visible），保留 returnTo 等其他参数
  const tab: TPermissionPageTab = searchParams.get("tab") === "visible" ? "visible" : "groups";
  const setTab = (next: TPermissionPageTab) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "visible") params.set("tab", "visible");
        else params.delete("tab");
        return params;
      },
      { replace: true }
    );

  const totalKeyCount = useMemo(() => getScopeKeys("project").length, []);
  const keyword = query.trim().toLowerCase();
  const filteredGroups = groups.filter(
    (group) =>
      !keyword || group.name.toLowerCase().includes(keyword) || (group.description ?? "").toLowerCase().includes(keyword)
  );
  const filteredInherited = inheritedGroups.filter((group) => !keyword || group.name.toLowerCase().includes(keyword));
  const templateCount = groups.filter((group) => group.source === "template").length;

  const openDetail = (group: TProjectPermissionGroup) =>
    router.push(`/${workspaceSlug}/settings/projects/${projectId}/permission/${group.id}/`);

  const handlePendingConfirm = async () => {
    if (!pending) return;
    const label = deleteActionLabel(pending);
    setIsPendingSubmitting(true);
    try {
      await deleteRole(pending.id);
      void refreshVisibleMembers();
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
          onCreate={tab === "groups" ? () => setFormState({ open: true, group: null }) : undefined}
        />
      }
      hugging
    >
      <PageHead title={currentProjectDetails?.name ? `${currentProjectDetails.name} - 权限` : undefined} />
      <PermissionPageTabs
        value={tab}
        onChange={setTab}
        groupCount={groups.length + inheritedGroups.length}
        visibleCount={visibleMembers?.people.length}
      />

      {tab === "visible" ? (
        <ProjectVisibleMembersPanel workspaceSlug={workspaceSlug} projectId={projectId} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PermissionGroupSegmented<TProjectGroupFilter>
              items={[
                { key: "all", label: "全部", count: groups.length + inheritedGroups.length },
                { key: "project", label: "本项目", count: groups.length - templateCount },
                { key: "template", label: "模板", count: templateCount },
                { key: "workspace", label: "工作区权限组", count: inheritedGroups.length },
              ]}
              value={sourceFilter}
              onChange={setSourceFilter}
            />
            <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索权限组" />
          </div>

          <ProjectPermissionGroupsTable
            workspaceSlug={workspaceSlug}
            groups={filteredGroups}
            inheritedGroups={filteredInherited}
            filter={sourceFilter}
            totalKeyCount={totalKeyCount}
            canManage={canManage}
            isLoading={isLoading}
            emptyText={keyword || sourceFilter !== "all" ? "没有匹配的权限组" : "还没有权限组"}
            onOpen={openDetail}
            onEdit={(group) => setFormState({ open: true, group })}
            onDelete={(group) => setPending(group)}
          />
        </div>
      )}

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
