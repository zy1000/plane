/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";

import { Disclosure } from "@headlessui/react";
// plane imports
import { EUserPermissions, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import { TrashIcon, SuspendedUserIcon } from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUser, IWorkspaceGroup, IWorkspaceMember, IWorkspaceRole, TNetworkZone } from "@plane/types";
// plane ui
import { AlertModalCore, CustomSelect, PopoverMenu } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
// helpers
import { SYSTEM_USER_AVATAR_FALLBACK_COLOR } from "@/helpers/user-avatar.helper";
import { getFileURL } from "@plane/utils";
import { WorkspaceRoleMultiSelect } from "./workspace-role-multi-select";
import { WorkspaceTeamMultiSelect } from "./workspace-team-multi-select";

export interface RowData {
  member: IWorkspaceMember;
  role: EUserPermissions;
  is_active: boolean;
  custom_role_ids: string[];
  group_role_ids: string[];
  group_ids: string[];
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  canRemoveMember: boolean;
  canLeaveWorkspace: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
};

type CustomRolesProps = {
  rowData: RowData;
  workspaceSlug: string;
  roles: IWorkspaceRole[];
  isLoading: boolean;
  canEditMember: boolean;
};

type TeamsProps = {
  rowData: RowData;
  workspaceSlug: string;
  groups: IWorkspaceGroup[];
  isLoading: boolean;
  canManageTeams: boolean;
};

export function NameColumn(props: NameProps) {
  const { rowData, workspaceSlug, canRemoveMember, canLeaveWorkspace, currentUser, setRemoveMemberModal } = props;
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;
  const isSuspended = rowData.is_active === false;
  const isCurrentUser = id === currentUser?.id;
  const canRemove = isCurrentUser ? canLeaveWorkspace : canRemoveMember;

  return (
    <Disclosure>
      {() => (
        <div className="group relative">
          <div className="flex w-72 items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-1 items-center gap-x-2 gap-y-2">
              {isSuspended ? (
                <div className="rounded-full bg-layer-1">
                  <SuspendedUserIcon className="size-6 text-placeholder" />
                </div>
              ) : avatar_url && avatar_url.trim() !== "" ? (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full text-on-color capitalize">
                    <img
                      src={getFileURL(avatar_url)}
                      className="absolute top-0 left-0 h-full w-full rounded-full object-cover"
                      alt={display_name || email}
                    />
                  </span>
                </Link>
              ) : (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span
                    className="relative flex size-6 items-center justify-center rounded-full text-11 text-on-color capitalize"
                    style={{ backgroundColor: SYSTEM_USER_AVATAR_FALLBACK_COLOR }}
                  >
                    {(email ?? display_name ?? "?")[0]}
                  </span>
                </Link>
              )}
              <span className={isSuspended ? "text-placeholder" : ""}>
                {first_name} {last_name}
              </span>
            </div>

            {!isSuspended && canRemove && (
              <PopoverMenu
                data={[""]}
                keyExtractor={(item) => item}
                popoverClassName="justify-end"
                buttonClassName="outline-none	origin-center rotate-90 size-8 aspect-square flex-shrink-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                render={() => (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-center gap-x-3"
                    onClick={() => setRemoveMemberModal(rowData)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRemoveMemberModal(rowData);
                      }
                    }}
                    data-ph-element={MEMBER_TRACKER_ELEMENTS.WORKSPACE_MEMBER_TABLE_CONTEXT_MENU}
                  >
                    <TrashIcon className="size-3.5 align-middle" /> {id === currentUser?.id ? "Leave " : "Remove "}
                  </div>
                )}
              />
            )}
          </div>
        </div>
      )}
    </Disclosure>
  );
}

export const CustomRolesColumn = observer(function CustomRolesColumn(props: CustomRolesProps) {
  const { rowData, workspaceSlug, roles, isLoading, canEditMember } = props;
  const isSuspended = rowData.is_active === false;

  if (isSuspended) return null;

  return (
    <WorkspaceRoleMultiSelect
      workspaceSlug={workspaceSlug}
      memberId={rowData.member.id}
      selectedRoleIds={rowData.custom_role_ids ?? []}
      roles={roles}
      isLoading={isLoading}
      disabled={!canEditMember}
    />
  );
});

export const TeamsColumn = observer(function TeamsColumn(props: TeamsProps) {
  const { rowData, workspaceSlug, groups, isLoading, canManageTeams } = props;
  const isSuspended = rowData.is_active === false;

  if (isSuspended) return null;

  return (
    <WorkspaceTeamMultiSelect
      workspaceSlug={workspaceSlug}
      memberId={rowData.member.id}
      selectedGroupIds={rowData.group_ids ?? []}
      groups={groups}
      isLoading={isLoading}
      disabled={!canManageTeams}
    />
  );
});

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
        buttonClassName="rounded-md border-none px-2 py-1 text-xs hover:bg-layer-1"
        optionsClassName="w-32"
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
