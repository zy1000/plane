/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { PermissionGroupMembersTab } from "@/components/project/settings/permission-groups/group-members-tab";
import { ProjectPermissionGroupFormModal } from "@/components/project/settings/permission-groups/permission-group-form-modal";
import {
  GROUP_SOURCE_LABEL,
  PermissionGroupSourceBadge,
  deleteActionLabel,
  deleteConfirmCopy,
  errorMessage,
} from "@/components/project/settings/permission-groups/shared";
import { useProjectPermissionGroupDetail } from "@/components/project/settings/permission-groups/use-permission-group-detail";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { PermissionGroupEditor, PermissionGroupSaveBar } from "@/components/workspace/settings/permission-groups";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { Route } from "./+types/page";
import { RolesProjectSettingsHeader } from "../header";

type TTab = "members" | "permissions";

function ProjectPermissionGroupDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, groupId } = params;
  const router = useAppRouter();
  const [tab, setTab] = useState<TTab>("permissions");
  // 待确认的删除：本项目组是真删，模板组是「删除引用」
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [isPendingSubmitting, setIsPendingSubmitting] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.roles.permissionKeys ?? [], workspaceSlug, projectId);
  const canManage = allowProjectPermissionKeys(PROJECT_SETTINGS.roles.editPermissionKeys ?? [], workspaceSlug, projectId);

  const detail = useProjectPermissionGroupDetail(workspaceSlug, projectId, groupId);
  const { group, detail: content, permissionState, memberIds, roles, draft } = detail;
  const readOnly = !canManage || !content?.is_editable;
  const copySources = useMemo(
    () =>
      roles
        .filter((row) => row.id !== groupId)
        .map((row) => ({ id: row.id, name: row.name, badge: GROUP_SOURCE_LABEL[row.source] })),
    [roles, groupId]
  );

  const handleSave = async () => {
    try {
      await detail.save();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存" });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: errorMessage(error, "请稍后重试") });
    }
  };

  const goToList = () => router.push(`/${workspaceSlug}/settings/projects/${projectId}/permission-groups/`);

  const handleDeleteConfirm = async () => {
    if (!group) return;
    const label = deleteActionLabel(group);
    setIsPendingSubmitting(true);
    try {
      await detail.deleteRole(groupId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已${label}` });
      setIsDeletePending(false);
      goToList();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: `${label}失败`, message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsPendingSubmitting(false);
    }
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const headerActions = group && canManage && (
    <div className="flex items-center gap-2">
      {group.source === "project" && (
        <Button variant="secondary" size="lg" onClick={() => setIsRenameOpen(true)}>
          编辑
        </Button>
      )}
      <Button variant="secondary" size="lg" className="text-danger-primary" onClick={() => setIsDeletePending(true)}>
        {deleteActionLabel(group)}
      </Button>
    </div>
  );

  const subtitle = group
    ? [
        "项目权限组",
        `${group.member_count} 人`,
        group.updated_at
          ? `${group.source === "project" ? "更新于" : "模板更新于"} ${renderFormattedPayloadDate(group.updated_at)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <SettingsContentWrapper
      header={<RolesProjectSettingsHeader currentLabel={group?.name} rightItem={headerActions || undefined} />}
      hugging
    >
      <PageHead title={group ? `${group.name} - 权限组` : "权限组"} />
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-20 font-semibold text-primary">{group?.name ?? "…"}</h1>
            {group && <PermissionGroupSourceBadge source={group.source} />}
          </div>
          <p className="mt-1 text-13 text-tertiary">{subtitle}</p>
          {group?.description && <p className="mt-1 text-13 text-secondary">{group.description}</p>}
        </div>

        <div className="flex items-center gap-6 border-b border-subtle">
          {(
            [
              { key: "members", label: "成员", count: group?.member_count },
              { key: "permissions", label: "权限" },
            ] as { key: TTab; label: string; count?: number }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-14 transition-colors",
                tab === item.key
                  ? "border-accent-strong font-medium text-accent-primary"
                  : "border-transparent text-secondary hover:text-primary"
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="rounded-full bg-layer-1 px-1.5 text-11 text-tertiary tabular-nums">{item.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "members" ? (
          <PermissionGroupMembersTab memberIds={memberIds} />
        ) : (
          permissionState.isLoading && !draft ? (
            <Loader className="flex flex-col gap-3">
              <Loader.Item height="36px" />
              <Loader.Item height="480px" />
            </Loader>
          ) : !content || !draft ? (
            <div className="rounded-lg border border-subtle py-12 text-center">
              <p className="text-13 text-secondary">读取权限失败</p>
              <Button
                className="mt-3"
                variant="secondary"
                size="lg"
                onClick={() => void detail.loadRolePermissions(groupId, true)}
              >
                重试
              </Button>
            </div>
          ) : (
            <>
              <PermissionGroupEditor
                scopes={["project"]}
                defaultScope="project"
                value={draft}
                onChange={detail.setDraft}
                typeOptions={content.type_options}
                typeSourceLabel={group?.source === "project" ? "本项目" : "类型库"}
                readOnly={readOnly}
                notice={
                  !content.is_editable ? (
                    <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                      这是工作区的模板组，权限请到工作区设置里改；本项目里只能绑人或「删除引用」。
                    </div>
                  ) : !canManage ? (
                    <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                      你没有管理项目权限组的权限，只能查看。
                    </div>
                  ) : null
                }
                copySources={copySources}
                loadCopySource={readOnly ? undefined : detail.loadCopySource}
              />
              {detail.isDirty && !readOnly && (
                <PermissionGroupSaveBar
                  count={detail.changedCount}
                  isSaving={detail.isSaving}
                  onDiscard={detail.discard}
                  onSave={() => void handleSave()}
                />
              )}
            </>
          )
        )}
      </div>

      <ProjectPermissionGroupFormModal
        isOpen={isRenameOpen}
        group={group}
        copySources={[]}
        onClose={() => setIsRenameOpen(false)}
        onSubmit={(values) => detail.updateRole(groupId, { name: values.name, description: values.description })}
      />

      {isDeletePending && group && (
        <AlertModalCore
          isOpen
          variant="danger"
          title={deleteConfirmCopy(group).title}
          content={deleteConfirmCopy(group).content}
          primaryButtonText={{ default: deleteActionLabel(group), loading: "处理中…" }}
          isSubmitting={isPendingSubmitting}
          handleClose={() => setIsDeletePending(false)}
          handleSubmit={() => void handleDeleteConfirm()}
        />
      )}
    </SettingsContentWrapper>
  );
}

export default observer(ProjectPermissionGroupDetailPage);
