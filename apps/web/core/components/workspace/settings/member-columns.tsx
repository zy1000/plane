/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup, IWorkspaceMember, TNetworkZone } from "@plane/types";
import { AlertModalCore, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { PERMISSION_GROUP_KIND_CHIP_CLASS } from "./permission-group-kind";
import type { TAssignablePermissionGroupKind } from "./permission-group-kind";

/** 成员表的一行：store 的 getWorkspaceMemberDetails（member 是带工号 / 部门的 IUserLite） */
export type RowData = IWorkspaceMember;

const CHIP = "inline-flex h-5 max-w-full items-center truncate rounded border px-1.5 text-12";

/**
 * 权限组列：按 kind 各一列（工作区权限组 / 数据权限），只列该类的组。
 * 直绑的组实底 chip（两类两种底色）+ 团队带来的组（虚线框，悬停看来源）。
 */
export const PermissionGroupsColumn = observer(function PermissionGroupsColumn(props: {
  rowData: RowData;
  groupMap: Map<string, IPermissionGroup>;
  kind: TAssignablePermissionGroupKind;
}) {
  const { rowData, groupMap, kind } = props;
  // 停用状态只在第一列（工作区权限组）标一次
  if (rowData.is_active === false)
    return kind === "workspace" ? <span className="text-13 text-placeholder">已停用</span> : null;
  const pick = (ids: string[]) =>
    ids.map((id) => groupMap.get(id)).filter((group): group is IPermissionGroup => !!group && group.kind === kind);
  const direct = pick(rowData.custom_role_ids ?? []);
  const directIds = new Set(direct.map((group) => group.id));
  const viaTeam = pick((rowData.group_role_ids ?? []).filter((id) => !directIds.has(id)));
  const names = [...direct.map((group) => group.name), ...viaTeam.map((group) => group.name)];

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" title={names.join("、")}>
      {names.length === 0 && <span className="text-13 text-placeholder">—</span>}
      {direct.map((group) => (
        <span key={group.id} className={cn(CHIP, PERMISSION_GROUP_KIND_CHIP_CLASS[kind])}>
          {group.name}
        </span>
      ))}
      {viaTeam.map((group) => (
        <span
          key={group.id}
          className={cn(CHIP, "border-dashed border-subtle-1 text-tertiary")}
          title={`通过团队获得：${group.name}`}
        >
          {group.name}
        </span>
      ))}
    </span>
  );
});

/** 操作列：「编辑」改角色与权限组，「移出 / 退出」。按钮常显，没权限时置灰 */
export function MemberActionsColumn(props: {
  rowData: RowData;
  isCurrentUser: boolean;
  isOwner: boolean;
  canEditMember: boolean;
  canRemoveMember: boolean;
  canLeaveWorkspace: boolean;
  onEdit: (rowData: RowData) => void;
  onRemove: (rowData: RowData) => void;
}) {
  const { rowData, isCurrentUser, isOwner, canEditMember, canRemoveMember, canLeaveWorkspace, onEdit, onRemove } =
    props;
  if (rowData.is_active === false) return null;
  const canRemove = !isOwner && (isCurrentUser ? canLeaveWorkspace : canRemoveMember);
  const button =
    "text-13 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";
  return (
    <span className="flex items-center justify-end gap-3">
      <button
        type="button"
        className={cn(button, "text-accent-primary")}
        disabled={!canEditMember || isOwner}
        title={isOwner ? "工作区所有者拥有全部权限，不需要分配" : undefined}
        onClick={() => onEdit(rowData)}
      >
        编辑
      </button>
      <button
        type="button"
        className={cn(button, "text-danger-primary")}
        disabled={!canRemove}
        onClick={() => onRemove(rowData)}
      >
        {isCurrentUser ? "退出" : "移出"}
      </button>
    </span>
  );
}

type NetworkZoneProps = {
  rowData: RowData;
  workspaceSlug: string;
  canEditMember: boolean;
};

const NETWORK_ZONE_OPTIONS: { value: TNetworkZone | null; labelKey: string }[] = [
  { value: "wan", labelKey: "network_zone.wan" },
  { value: "lan", labelKey: "network_zone.lan" },
  { value: null, labelKey: "network_zone.unbound" },
];

/** 大网 / 小网归属列：改完后端会踢掉此人全部会话，所以先确认再提交 */
export const NetworkZoneColumn = observer(function NetworkZoneColumn(props: NetworkZoneProps) {
  const { rowData, workspaceSlug, canEditMember } = props;
  const { t } = useTranslation();
  const {
    workspace: { updateMemberNetworkZone },
  } = useMember();
  const [pendingZone, setPendingZone] = useState<TNetworkZone | null | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSuspended = rowData.is_active === false;
  // 成员列表接口把 network_zone 挂在 member 上；RowData.member 的声明类型没有这个键
  const currentZone = (rowData.member as { network_zone?: TNetworkZone | null }).network_zone ?? null;
  const labelOf = (zone: TNetworkZone | null) =>
    t(NETWORK_ZONE_OPTIONS.find((option) => option.value === zone)?.labelKey ?? "network_zone.unbound");

  if (isSuspended) return null;

  const handleConfirm = async () => {
    if (pendingZone === undefined) return;
    setIsSubmitting(true);
    try {
      await updateMemberNetworkZone(workspaceSlug, rowData.member.id, pendingZone);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("network_zone.change_success") });
      setPendingZone(undefined);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("network_zone.change_failed"),
        message: (error as { error?: string })?.error,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={pendingZone !== undefined}
        variant="primary"
        title={t("network_zone.change_confirm_title")}
        content={t("network_zone.change_confirm_message")}
        isSubmitting={isSubmitting}
        handleClose={() => setPendingZone(undefined)}
        handleSubmit={handleConfirm}
      />
      <CustomSelect
        value={currentZone}
        onChange={(zone: TNetworkZone | null) => {
          if (zone !== currentZone) setPendingZone(zone);
        }}
        label={<span className={currentZone ? "" : "text-tertiary"}>{labelOf(currentZone)}</span>}
        buttonClassName="rounded border-none px-0 py-1 text-13"
        optionsClassName="w-32 text-13"
        disabled={!canEditMember}
      >
        {NETWORK_ZONE_OPTIONS.map((option) => (
          <CustomSelect.Option key={String(option.value)} value={option.value}>
            {t(option.labelKey)}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    </>
  );
});
