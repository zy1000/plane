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
import { renderFormattedPayloadDate } from "@plane/utils";
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
import {
  PermissionGroupEditor,
  PermissionGroupIdentity,
  PermissionGroupSaveBar,
  PermissionGroupTiles,
  countDepartments,
  getScopeKeys,
} from "@/components/workspace/settings/permission-groups";
import type { TDetailTile } from "@/components/workspace/settings/permission-groups";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { Route } from "./+types/page";
import { RolesProjectSettingsHeader } from "../header";

type TTab = "permissions" | "members";

/** 项目设置 › 权限组详情：与工作区设置的权限组详情同一套样式（头部 + 数字卡片页签：权限 / 成员） */
function ProjectPermissionGroupDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, groupId } = params;
  const router = useAppRouter();
  const [tab, setTab] = useState<TTab>("permissions");
  // 待确认的删除：本项目组是真删，模板组是「删除引用」
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [isPendingSubmitting, setIsPendingSubmitting] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  const { getUserDetails } = useMember();
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
  const totalKeyCount = useMemo(() => getScopeKeys("project").length, []);
  // 不用 useMemo：成员详情晚于成员 id 到达时要跟着重算（observer 会重渲）
  const departmentCount = countDepartments(memberIds ?? [], getUserDetails);

  // 权限卡片跟草稿走：勾了还没保存也能看到数字在变
  const permissionCount = draft
    ? draft.permission_keys.filter((key) => key.startsWith("project.")).length
    : (group?.permission_count ?? 0);
  const tiles: TDetailTile<TTab>[] = [
    { key: "permissions", label: "权限", value: permissionCount, unit: "项", sub: `项目权限共 ${totalKeyCount} 项` },
    {
      key: "members",
      label: "成员",
      value: memberIds?.length ?? group?.member_count ?? 0,
      unit: "人",
      sub: departmentCount > 0 ? `来自 ${departmentCount} 个部门` : undefined,
    },
  ];

  const handleSave = async () => {
    try {
      await detail.save();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存" });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: errorMessage(error, "请稍后重试") });
    }
  };

  const goToList = () => router.push(`/${workspaceSlug}/settings/projects/${projectId}/permission/`);

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

  const actions =
    group && canManage ? (
      <>
        {group.source === "project" && (
          <Button variant="secondary" size="xl" className="h-9 px-4" onClick={() => setIsRenameOpen(true)}>
            编辑
          </Button>
        )}
        <Button
          variant="secondary"
          size="xl"
          className="h-9 px-4 text-danger-primary"
          onClick={() => setIsDeletePending(true)}
        >
          {deleteActionLabel(group)}
        </Button>
      </>
    ) : undefined;

  const meta = group?.updated_at
    ? `${group.source === "project" ? "更新于" : "标准权限组更新于"} ${renderFormattedPayloadDate(group.updated_at)}`
    : null;

  return (
    <SettingsContentWrapper header={<RolesProjectSettingsHeader currentLabel={group?.name} />} hugging>
      <PageHead title={group ? `${group.name} - 权限组` : "权限组"} />
      {!group ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="36px" width="240px" />
          <Loader.Item height="96px" />
          <Loader.Item height="480px" />
        </Loader>
      ) : (
        <div className="flex flex-col gap-5">
          <PermissionGroupIdentity
            name={group.name}
            badge={<PermissionGroupSourceBadge source={group.source} />}
            description={group.description}
            meta={meta}
            actions={actions}
          />

          <PermissionGroupTiles tiles={tiles} active={tab} onSelect={setTab} />

          <div className="mt-1">
            {tab === "members" ? (
              <PermissionGroupMembersTab
                memberIds={memberIds}
                membersPath={`/${workspaceSlug}/settings/projects/${projectId}/members/`}
              />
            ) : permissionState.isLoading && !draft ? (
              <Loader className="flex flex-col gap-3">
                <Loader.Item height="36px" />
                <Loader.Item height="480px" />
              </Loader>
            ) : !content || !draft ? (
              <div className="rounded-xl border border-subtle py-12 text-center">
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
                  value={draft}
                  onChange={detail.setDraft}
                  typeOptions={content.type_options}
                  typeSourceLabel={group.source === "project" ? "本项目" : "类型库"}
                  readOnly={readOnly}
                  notice={
                    !content.is_editable ? (
                      <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                        这是工作区的标准权限组，权限请到工作区设置里改；本项目里只能绑人或「删除引用」。
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
            )}
          </div>
        </div>
      )}

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
