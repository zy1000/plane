/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPermissionGroupJobRole } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { JobRoleTag } from "@/components/workspace/settings/job-roles/job-role-tag";
import { useMember } from "@/hooks/store/use-member";
import type { TGroupJobRolesState } from "@/hooks/store/use-permission-group-detail";
import { AddJobRoleModal } from "./add-job-role-modal";
import { getPermissionGroupErrorMessage } from "./helpers";
import { MemberAvatarStack, PermissionGroupSearch } from "./ui";

type Props = {
  workspaceSlug: string;
  groupName: string;
  /** 绑定的角色与增删（工作区、项目两级各自的 hook 给） */
  state: TGroupJobRolesState;
  canManage: boolean;
  /** 第二列数的是谁：工作区权限组 / 数据权限是「工作区成员」，项目标准权限组与项目里的组是「项目成员」 */
  holderLabel: string;
  /** 只读时表格上方的说明（项目里的标准权限组：角色由工作区统一维护） */
  notice?: string;
  /** 添加角色弹窗里各角色现有的人数（拿得到才显示） */
  holderCounts?: Map<string, number>;
  /** 绑定 / 解除后：刷新卡片数字、成员列表、自己的权限 */
  onChanged: () => void;
};

const GRID =
  "grid grid-cols-[minmax(180px,1.2fr)_minmax(220px,1.4fr)_minmax(110px,0.8fr)_120px_88px] items-center gap-x-4 px-5";

/**
 * 权限组详情的「角色」页签：组绑定的角色。挂着这些角色的人自动拥有这个组的权限；
 * 反过来不成立，把人直接加进权限组不会让他得到角色。工作区设置、项目设置两级共用。
 */
export const PermissionGroupJobRolesPanel = observer(function PermissionGroupJobRolesPanel(props: Props) {
  const { workspaceSlug, groupName, state, canManage, holderLabel, notice, holderCounts, onChanged } = props;
  const { jobRoles, isEditable, isLoading, error, reload, addJobRoles, removeJobRole } = state;
  const { getUserDetails } = useMember();
  const [query, setQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TPermissionGroupJobRole | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const canEdit = canManage && isEditable;
  const keyword = query.trim().toLowerCase();
  const rows = jobRoles.filter((row) => !keyword || row.label.toLowerCase().includes(keyword));

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoving(true);
    try {
      await removeJobRole(pendingRemove.id);
      onChanged();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已解除绑定" });
      setPendingRemove(null);
    } catch (removeError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "解除绑定失败",
        message: getPermissionGroupErrorMessage(removeError, "请稍后重试"),
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">{notice}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索角色" className="w-72" />
        {canEdit && (
          <Button variant="primary" size="xl" className="h-9 px-4" onClick={() => setIsAddOpen(true)}>
            添加角色
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[780px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>角色</span>
            <span>{holderLabel}</span>
            <span>绑定人</span>
            <span>绑定时间</span>
            <span className="flex justify-end">操作</span>
          </div>
          {isLoading && jobRoles.length === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="36px" />
              ))}
            </Loader>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-13 text-secondary">{error}</p>
              <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
                重试
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">{keyword ? "没有匹配的角色" : "尚未绑定角色"}</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className={cn(GRID, "min-h-[60px] border-b border-subtle py-2 text-14 last:border-b-0")}>
                <span className="flex min-w-0">
                  <JobRoleTag role={row} />
                </span>
                <span className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
                  <MemberAvatarStack userIds={row.member_preview_ids} count={row.member_count} />
                  {row.project_count != null && row.member_count > 0 && (
                    <span className="truncate text-13 text-tertiary tabular-nums">分布于 {row.project_count} 个项目</span>
                  )}
                </span>
                <span className="truncate text-secondary">
                  {(row.created_by_id && getUserDetails(row.created_by_id)?.display_name) || "—"}
                </span>
                <span className="text-secondary tabular-nums">{renderFormattedPayloadDate(row.created_at) || "—"}</span>
                <span className="flex justify-end">
                  {canEdit && (
                    <button
                      type="button"
                      className="text-14 whitespace-nowrap text-secondary hover:text-danger-primary hover:underline"
                      onClick={() => setPendingRemove(row)}
                    >
                      解除绑定
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {jobRoles.length > 0 && <p className="px-1 text-13 text-tertiary tabular-nums">共 {jobRoles.length} 个角色</p>}

      <AddJobRoleModal
        isOpen={isAddOpen}
        workspaceSlug={workspaceSlug}
        boundIds={jobRoles.map((row) => row.id)}
        holderCounts={holderCounts}
        onClose={() => setIsAddOpen(false)}
        onAdd={async (jobRoleIds) => {
          await addJobRoles(jobRoleIds);
          onChanged();
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => setPendingRemove(null)}
        handleSubmit={handleRemove}
        isSubmitting={isRemoving}
        title={`解除「${groupName}」与角色「${pendingRemove?.label ?? ""}」的绑定？`}
        content="解除后，仅通过该角色获得权限的成员不再拥有此权限组的权限；直接添加的成员不受影响。"
        primaryButtonText={{ loading: "解除中", default: "解除绑定" }}
      />
    </div>
  );
});
