/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { IWorkspaceRole, IWorkspaceRoleSyncToProjectsResult } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

type Props = {
  isOpen: boolean;
  role: IWorkspaceRole | null;
  onClose: () => void;
  onSync: (roleId: string) => Promise<IWorkspaceRoleSyncToProjectsResult>;
};

/**
 * 角色模板「同步权限到项目」确认弹窗：把模板权限覆盖到本工作区所有同名的项目角色。
 * 只负责确认与结果提示，请求由 onSync（useWorkspaceRoles.syncRoleToProjects）发起。
 */
export function SyncTemplateToProjectsModal({ isOpen, role, onClose, onSync }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!role) return;
    setIsSubmitting(true);
    try {
      const { updated, skipped } = await onSync(role.id);
      if (updated > 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "同步完成",
          message:
            `已将「${role.name}」的权限同步到 ${updated} 个项目的同名角色` +
            (skipped > 0 ? `，${skipped} 个项目没有该角色，已跳过` : ""),
        });
      } else {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "未同步任何角色",
          message: `没有项目存在名为「${role.name}」的角色`,
        });
      }
      onClose();
    } catch (err: unknown) {
      // service 抛出的是 error.response.data，后端错误文案在 error 字段里
      const raw = (err as { error?: string | string[] } | undefined)?.error;
      const message = raw ? String(Array.isArray(raw) ? raw[0] : raw) : "请稍后重试";
      setToast({ type: TOAST_TYPE.ERROR, title: "同步失败", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={isOpen}
      variant="primary"
      handleClose={onClose}
      handleSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      title="同步权限到项目？"
      content={
        role
          ? `将把模板「${role.name}」当前的权限覆盖到本工作区所有同名的项目角色（含已归档项目）。没有该角色的项目会跳过，不会新建；项目角色里已单独勾选的工作项类型权限会保留；模板描述不会同步。此操作不可撤销。`
          : null
      }
      secondaryButtonText="取消"
      primaryButtonText={{ default: "同步", loading: "同步中…" }}
    />
  );
}
