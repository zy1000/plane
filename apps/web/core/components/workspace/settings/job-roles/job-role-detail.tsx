/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { DictionaryColorDot } from "@/components/data-dictionaries";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import {
  PermissionGroupIdentity,
  PermissionGroupTiles,
  countDepartments,
} from "@/components/workspace/settings/permission-groups/ui";
import { useMember } from "@/hooks/store/use-member";
import { useJobRoleDetail } from "@/hooks/store/use-workspace-job-roles";
import { useUserPermissions } from "@/hooks/store/user";
import type { TJobRoleTab } from "./helpers";
import {
  JOB_ROLE_MANAGE_KEYS,
  JOB_ROLE_MEMBER_MANAGE_KEYS,
  JOB_ROLE_READ_KEYS,
  getJobRoleColor,
  getJobRolesPath,
  isJobRoleTab,
} from "./helpers";
import { JobRoleDeleteModal } from "./job-role-delete-modal";
import { JobRoleFormModal } from "./job-role-form-modal";
import { JobRoleProjectMembers } from "./job-role-project-members";
import { JobRoleReferences } from "./job-role-references";
import { JobRoleWorkspaceMembers } from "./job-role-workspace-members";

/** 角色详情：三张数字卡片兼页签——工作区成员 / 项目成员 / 工作流引用，当前页签在 ?tab= */
export const JobRoleDetail = observer(function JobRoleDetail(props: { workspaceSlug: string; roleId: string }) {
  const { workspaceSlug, roleId } = props;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, workspaceMemberMap },
  } = useMember();
  const { role, isLoading, error, reload, updateRole, deleteRole, addWorkspaceMembers, removeWorkspaceMember } =
    useJobRoleDetail(workspaceSlug, roleId);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const canView = allowWorkspacePermissionKeys(JOB_ROLE_READ_KEYS, workspaceSlug);
  const canManage = allowWorkspacePermissionKeys(JOB_ROLE_MANAGE_KEYS, workspaceSlug);
  const canManageMembers = allowWorkspacePermissionKeys(JOB_ROLE_MEMBER_MANAGE_KEYS, workspaceSlug);

  if (workspaceUserInfo[workspaceSlug] && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  const tabParam = searchParams.get("tab");
  const tab: TJobRoleTab = isJobRoleTab(tabParam) ? tabParam : "workspace";
  const setTab = (next: TJobRoleTab) => setSearchParams({ tab: next }, { replace: true });

  // 工作区成员页签直接从成员表算：挂了这个角色的活跃成员
  const holderIds = getWorkspaceMemberIds(workspaceSlug).filter((userId) => {
    const membership = workspaceMemberMap?.[workspaceSlug]?.[userId];
    return membership?.is_active !== false && (membership?.job_role_ids ?? []).includes(roleId);
  });
  const departmentCount = countDepartments(holderIds, getUserDetails);

  const listPath = getJobRolesPath(workspaceSlug);
  const Icon = WORKSPACE_SETTINGS_ICONS["job-roles"];
  const updater = role?.updated_by_id ? getUserDetails(role.updated_by_id) : undefined;
  const meta = role
    ? `${updater?.display_name ? `${updater.display_name} ` : ""}更新于 ${renderFormattedPayloadDate(role.updated_at)}`
    : null;

  const header = (
    <Header>
      <Header.LeftItem className="min-w-0">
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="角色" href={listPath} icon={<Icon className="size-4 text-tertiary" />} />}
          />
          <Breadcrumbs.Item component={<BreadcrumbLink label={role?.label ?? "…"} isLast />} />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title={role ? `角色 - ${role.label}` : "角色"} />
      {!role ? (
        error && !isLoading ? (
          <div className="rounded-xl border border-subtle py-12 text-center">
            <p className="text-13 text-secondary">{error}</p>
            <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
              重试
            </Button>
          </div>
        ) : (
          <Loader className="flex flex-col gap-3">
            <Loader.Item height="36px" width="240px" />
            <Loader.Item height="96px" />
            <Loader.Item height="420px" />
          </Loader>
        )
      ) : (
        <div className="flex flex-col gap-5">
          <PermissionGroupIdentity
            name={role.label}
            badge={<DictionaryColorDot color={getJobRoleColor(role)} size="md" className="order-first" />}
            meta={meta}
            actions={
              canManage ? (
                <>
                  <Button variant="secondary" size="xl" className="h-9 px-4" onClick={() => setIsEditOpen(true)}>
                    编辑
                  </Button>
                  <Button
                    variant="secondary"
                    size="xl"
                    className="h-9 px-4 text-danger-primary"
                    onClick={() => setIsDeleteOpen(true)}
                  >
                    删除
                  </Button>
                </>
              ) : undefined
            }
          />

          <PermissionGroupTiles<TJobRoleTab>
            className="lg:grid-cols-3"
            active={tab}
            onSelect={setTab}
            tiles={[
              {
                key: "workspace",
                label: "工作区成员",
                value: role.workspace_member_count,
                unit: "人",
                sub: departmentCount > 0 ? `分布于 ${departmentCount} 个部门` : undefined,
              },
              {
                key: "projects",
                label: "项目成员",
                value: role.project_member_count,
                unit: "人",
                sub: role.project_count > 0 ? `分布于 ${role.project_count} 个项目` : undefined,
              },
              {
                key: "references",
                label: "工作流引用",
                value: role.transition_count,
                unit: "个流转",
                sub: role.workflow_count > 0 ? `涉及 ${role.workflow_count} 个工作流` : undefined,
              },
            ]}
          />

          {tab === "workspace" && (
            <JobRoleWorkspaceMembers
              workspaceSlug={workspaceSlug}
              role={role}
              holderIds={holderIds}
              canManageMembers={canManageMembers}
              onAdd={addWorkspaceMembers}
              onRemove={removeWorkspaceMember}
            />
          )}
          {tab === "projects" && <JobRoleProjectMembers workspaceSlug={workspaceSlug} roleId={roleId} />}
          {tab === "references" && <JobRoleReferences workspaceSlug={workspaceSlug} roleId={roleId} />}
        </div>
      )}

      <JobRoleFormModal
        isOpen={isEditOpen}
        workspaceSlug={workspaceSlug}
        role={role}
        onClose={() => setIsEditOpen(false)}
        onSubmit={async (payload) => {
          await updateRole(payload);
          setIsEditOpen(false);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "角色已保存" });
        }}
      />
      <JobRoleDeleteModal
        workspaceSlug={workspaceSlug}
        role={isDeleteOpen ? role : null}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={async () => {
          await deleteRole();
          navigate(listPath);
        }}
      />
    </SettingsContentWrapper>
  );
});
