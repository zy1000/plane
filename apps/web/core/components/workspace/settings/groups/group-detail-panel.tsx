/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { MoreHorizontal, PencilIcon, RotateCcw, Trash2Icon, UsersRound, X } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupMember, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Menu } from "@plane/propel/menu";
import { Tabs } from "@plane/propel/tabs";
import { MembersPanel } from "./members-panel";
import { RolesPanel } from "./roles-panel";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type TBulkMutationResult = {
  succeededIds: string[];
  failures: { targetId: string; message: string }[];
};

type Props = {
  isOpen: boolean;
  group: IWorkspaceGroup | null;
  members: IWorkspaceGroupMember[];
  roles: IWorkspaceGroupRole[];
  isDetailLoading: boolean;
  isDetailLoaded: boolean;
  detailError: string | null;
  availableRoles: IWorkspaceRole[];
  isAvailableRolesLoading: boolean;
  availableRolesError: string | null;
  memberOptions: TMemberOption[];
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  onClose: () => void;
  onEdit: (group: IWorkspaceGroup) => void;
  onDelete: (group: IWorkspaceGroup) => void;
  onRetryDetail: (groupId: string) => void;
  onRetryAvailableRoles: () => void;
  onAddMembers: (groupId: string, memberIds: string[]) => Promise<TBulkMutationResult>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
  onAddRoles: (groupId: string, roleIds: string[]) => Promise<TBulkMutationResult>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
  onPermissionsChanged: () => Promise<void>;
};

type TDetailTab = "members" | "roles";

export function GroupDetailPanel({
  isOpen,
  group,
  members,
  roles,
  isDetailLoading,
  isDetailLoaded,
  detailError,
  availableRoles,
  isAvailableRolesLoading,
  availableRolesError,
  memberOptions,
  canEdit,
  canDelete,
  canManageMembers,
  canManageRoles,
  onClose,
  onEdit,
  onDelete,
  onRetryDetail,
  onRetryAvailableRoles,
  onAddMembers,
  onRemoveMember,
  onAddRoles,
  onRemoveRole,
  onPermissionsChanged,
}: Props) {
  const [activeTab, setActiveTab] = useState<TDetailTab>("members");

  useEffect(() => {
    if (isOpen) setActiveTab("members");
  }, [group?.id, isOpen]);

  const showDetailLoading = isDetailLoading || (!isDetailLoaded && !detailError);

  return (
    <Transition.Root show={isOpen && Boolean(group)} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-200 ease-out motion-reduce:transition-none"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150 ease-in motion-reduce:transition-none"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/20" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 z-20 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full">
              <Transition.Child
                as={Fragment}
                enter="transform transition-transform duration-200 ease-out motion-reduce:transition-none"
                enterFrom="translate-x-full motion-reduce:translate-x-0"
                enterTo="translate-x-0"
                leave="transform transition-transform duration-150 ease-in motion-reduce:transition-none"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full motion-reduce:translate-x-0"
              >
                <Dialog.Panel className="pointer-events-auto flex h-full w-screen max-w-[45rem] flex-col border-l border-subtle bg-surface-1 shadow-raised-200">
                  {group && (
                    <>
                      <div className="flex shrink-0 items-start gap-3 border-b border-subtle px-5 py-4 sm:px-6">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                          <UsersRound className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Dialog.Title className="truncate text-16 font-semibold text-primary">
                            {group.name}
                          </Dialog.Title>
                          <p className="mt-1 line-clamp-2 max-w-[65ch] text-13 leading-5 text-secondary">
                            {group.description?.trim() || "暂无团队描述"}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary tabular-nums">
                              {group.member_count} 位成员
                            </span>
                            <span className="rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary tabular-nums">
                              {group.role_count} 个角色
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {(canEdit || canDelete) && (
                            <Menu
                              ariaLabel={`管理团队 ${group.name}`}
                              customButtonClassName="flex size-8 items-center justify-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                              optionsClassName="min-w-36 space-y-0.5"
                              customButton={<MoreHorizontal className="size-4" />}
                            >
                              {canEdit && (
                                <Menu.MenuItem
                                  onClick={() => onEdit(group)}
                                  className="flex items-center gap-2 px-2 py-1.5 text-13"
                                >
                                  <PencilIcon className="size-3.5" />
                                  编辑团队
                                </Menu.MenuItem>
                              )}
                              {canDelete && (
                                <Menu.MenuItem
                                  onClick={() => onDelete(group)}
                                  className="flex items-center gap-2 px-2 py-1.5 text-13 text-danger-primary hover:bg-danger-subtle"
                                >
                                  <Trash2Icon className="size-3.5" />
                                  删除团队
                                </Menu.MenuItem>
                              )}
                            </Menu>
                          )}
                          <button
                            type="button"
                            onClick={onClose}
                            className="flex size-8 items-center justify-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                            aria-label="关闭团队详情"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>

                      <Tabs
                        value={activeTab}
                        onValueChange={(value) => setActiveTab(value as TDetailTab)}
                        className="min-h-0 flex-1"
                      >
                        <div className="shrink-0 border-b border-subtle px-5 py-2.5 sm:px-6">
                          <Tabs.List className="w-full max-w-80">
                            <Tabs.Trigger value="members">
                              <span className="flex items-center gap-1.5">
                                成员
                                <span className="text-11 text-tertiary tabular-nums">{group.member_count}</span>
                              </span>
                            </Tabs.Trigger>
                            <Tabs.Trigger value="roles">
                              <span className="flex items-center gap-1.5">
                                角色与权限
                                <span className="text-11 text-tertiary tabular-nums">{group.role_count}</span>
                              </span>
                            </Tabs.Trigger>
                          </Tabs.List>
                        </div>

                        {detailError ? (
                          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-danger-subtle">
                              <RotateCcw className="size-5 text-danger-primary" />
                            </div>
                            <p className="text-13 font-medium text-primary">团队详情加载失败</p>
                            <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">{detailError}</p>
                            <Button
                              variant="secondary"
                              className="mt-4"
                              prependIcon={<RotateCcw />}
                              onClick={() => onRetryDetail(group.id)}
                            >
                              重新加载
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Tabs.Content value="members" className="flex min-h-0 flex-1 flex-col">
                              <MembersPanel
                                group={group}
                                members={members}
                                isLoading={showDetailLoading}
                                canManage={canManageMembers}
                                memberOptions={memberOptions}
                                onAddMembers={onAddMembers}
                                onRemoveMember={onRemoveMember}
                                onPermissionsChanged={onPermissionsChanged}
                              />
                            </Tabs.Content>
                            <Tabs.Content value="roles" className="flex min-h-0 flex-1 flex-col">
                              <RolesPanel
                                group={group}
                                roles={roles}
                                isLoading={showDetailLoading}
                                canManage={canManageRoles}
                                availableRoles={availableRoles}
                                isAvailableRolesLoading={isAvailableRolesLoading}
                                availableRolesError={availableRolesError}
                                onRetryAvailableRoles={onRetryAvailableRoles}
                                onAddRoles={onAddRoles}
                                onRemoveRole={onRemoveRole}
                                onPermissionsChanged={onPermissionsChanged}
                              />
                            </Tabs.Content>
                          </>
                        )}
                      </Tabs>
                    </>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
