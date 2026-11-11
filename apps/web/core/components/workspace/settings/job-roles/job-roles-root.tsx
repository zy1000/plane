/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { GripVertical } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRole } from "@plane/types";
import { Breadcrumbs } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { PermissionGroupIdentity, PermissionGroupSearch } from "@/components/workspace/settings/permission-groups/ui";
import { getJobRoleErrorMessage, useWorkspaceJobRoles } from "@/hooks/store/use-workspace-job-roles";
import { useUserPermissions } from "@/hooks/store/user";
import { JOB_ROLE_MANAGE_KEYS, JOB_ROLE_READ_KEYS } from "./helpers";
import { JobRoleDeleteModal } from "./job-role-delete-modal";
import { JobRoleFormModal } from "./job-role-form-modal";
import { JobRolesTable } from "./job-roles-table";

/**
 * 工作区设置 › 角色列表：新建 / 编辑走弹窗，删除使用中的角色会列出引用；
 * 「调整顺序」进入显式排序模式（整行可拖），保存后各处候选列表按这个顺序。
 */
export const JobRolesRoot = observer(function JobRolesRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const canView = allowWorkspacePermissionKeys(JOB_ROLE_READ_KEYS, workspaceSlug);
  const canManage = allowWorkspacePermissionKeys(JOB_ROLE_MANAGE_KEYS, workspaceSlug);
  const { roles, isLoading, error, reload, createRole, updateRole, deleteRole, reorderRoles } = useWorkspaceJobRoles(
    canView ? workspaceSlug : undefined
  );

  const [query, setQuery] = useState("");
  /** undefined = 弹窗关着；null = 新建 */
  const [formRole, setFormRole] = useState<TJobRole | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<TJobRole | null>(null);
  /** 非空 = 调整顺序模式中的草稿 */
  const [orderDraft, setOrderDraft] = useState<TJobRole[] | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  if (workspaceUserInfo[workspaceSlug] && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  const isReordering = orderDraft !== null;
  const keyword = query.trim().toLowerCase();
  const visible = isReordering
    ? orderDraft
    : keyword
      ? roles.filter((role) => role.label.toLowerCase().includes(keyword))
      : roles;

  const handleSaveOrder = async () => {
    if (!orderDraft) return;
    setIsSavingOrder(true);
    try {
      await reorderRoles(orderDraft.map((role) => role.id));
      setOrderDraft(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "顺序已保存" });
    } catch (saveError) {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: getJobRoleErrorMessage(saveError, "请稍后重试") });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const Icon = WORKSPACE_SETTINGS_ICONS["job-roles"];
  const header = (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item component={<BreadcrumbLink label="角色" icon={<Icon className="size-4 text-tertiary" />} />} />
        </Breadcrumbs>
      }
    />
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title="角色" />
      <div className="flex flex-col gap-5">
        <PermissionGroupIdentity
          name="角色"
          description="用于按岗位指定审批人、评审负责人，不授予任何权限。"
          actions={
            canManage && !isReordering ? (
              <>
                <Button
                  variant="secondary"
                  size="xl"
                  className="h-9 px-4"
                  disabled={roles.length < 2}
                  onClick={() => {
                    setQuery("");
                    setOrderDraft(roles);
                  }}
                >
                  调整顺序
                </Button>
                <Button variant="primary" size="xl" className="h-9 px-4" onClick={() => setFormRole(null)}>
                  新建角色
                </Button>
              </>
            ) : undefined
          }
        />

        {isReordering ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-subtle bg-accent-subtle px-4 py-2.5">
            <GripVertical className="size-4 text-accent-primary" aria-hidden="true" />
            <span className="text-14 text-primary">拖动行调整顺序，成员角色、审批人等处的候选列表按此顺序显示。</span>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" size="lg" disabled={isSavingOrder} onClick={() => setOrderDraft(null)}>
                取消
              </Button>
              <Button variant="primary" size="lg" loading={isSavingOrder} onClick={() => void handleSaveOrder()}>
                保存顺序
              </Button>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索角色" className="w-72" />
            <span className="text-13 text-tertiary tabular-nums">共 {roles.length} 个角色</span>
          </div>
        )}

        {error && roles.length === 0 ? (
          <div className="rounded-xl border border-subtle py-12 text-center">
            <p className="text-13 text-secondary">{error}</p>
            <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
              重试
            </Button>
          </div>
        ) : (
          <JobRolesTable
            workspaceSlug={workspaceSlug}
            roles={visible}
            isLoading={isLoading}
            isReordering={isReordering}
            canManage={canManage}
            emptyText={keyword ? "没有匹配的角色" : "工作区暂无角色"}
            onEdit={setFormRole}
            onDelete={setPendingDelete}
            onReorder={setOrderDraft}
          />
        )}
      </div>

      <JobRoleFormModal
        isOpen={formRole !== undefined}
        workspaceSlug={workspaceSlug}
        role={formRole ?? null}
        onClose={() => setFormRole(undefined)}
        onSubmit={async (payload) => {
          if (formRole) {
            await updateRole(formRole.id, payload);
            setToast({ type: TOAST_TYPE.SUCCESS, title: "角色已保存" });
          } else {
            const created = await createRole(payload);
            setToast({ type: TOAST_TYPE.SUCCESS, title: `已创建「${created.label}」` });
          }
          setFormRole(undefined);
        }}
      />
      <JobRoleDeleteModal
        workspaceSlug={workspaceSlug}
        role={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async (role) => {
          await deleteRole(role.id);
        }}
      />
    </SettingsContentWrapper>
  );
});
