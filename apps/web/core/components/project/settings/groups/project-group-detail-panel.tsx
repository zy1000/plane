/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { RotateCcw, ShieldCheck, UsersRound, X } from "lucide-react";
import type { IProjectGroup, IProjectGroupMember } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Avatar } from "@plane/ui";

type TTab = "roles" | "members";

type Props = {
  isOpen: boolean;
  group: IProjectGroup | null;
  members: IProjectGroupMember[];
  isMembersLoading: boolean;
  membersError: string | null;
  onClose: () => void;
  onRetryMembers: (groupId: string) => void;
};

export function ProjectGroupDetailPanel({
  isOpen,
  group,
  members,
  isMembersLoading,
  membersError,
  onClose,
  onRetryMembers,
}: Props) {
  const [activeTab, setActiveTab] = useState<TTab>("roles");

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab("roles");
  }, [group?.id, isOpen]);

  const projectMembers = useMemo(() => members.filter((member) => member.is_project_member), [members]);

  return (
    <>
      <Transition.Root show={isOpen && Boolean(group)} as={Fragment}>
        <Dialog as="div" className="relative z-20" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity duration-200 motion-reduce:transition-none"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-150 motion-reduce:transition-none"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/20" aria-hidden="true" />
          </Transition.Child>
          <div className="fixed inset-0 z-20 overflow-hidden">
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
                <Dialog.Panel className="pointer-events-auto flex h-full w-screen max-w-[42rem] flex-col border-l border-subtle bg-surface-1 shadow-raised-200">
                  {group && (
                    <>
                      <div className="flex items-start gap-3 border-b border-subtle px-5 py-4 sm:px-6">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                          <UsersRound className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Dialog.Title className="truncate text-16 font-semibold text-primary">
                            {group.name}
                          </Dialog.Title>
                          <p className="mt-1 line-clamp-2 text-13 leading-5 text-secondary">
                            {group.description?.trim() || "暂无团队描述"}
                          </p>
                          <p className="mt-2 text-11 text-tertiary">
                            {group.project_member_count}/{group.member_count} 位成员当前在项目内
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={onClose}
                          className="flex size-8 items-center justify-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary"
                          aria-label="关闭团队详情"
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="flex gap-1 border-b border-subtle px-5 py-2.5 sm:px-6">
                        {(["roles", "members"] as TTab[]).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`rounded-md px-3 py-1.5 text-13 font-medium ${activeTab === tab ? "bg-layer-1 text-primary" : "text-secondary hover:bg-layer-1-hover"}`}
                          >
                            {tab === "roles"
                              ? `项目角色 ${group.grants.length}`
                              : `项目内成员 ${group.project_member_count}`}
                          </button>
                        ))}
                      </div>

                      {activeTab === "roles" ? (
                        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
                          {group.grants.length === 0 ? (
                            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                              <ShieldCheck className="mb-3 size-7 text-placeholder" />
                              <p className="text-13 font-medium text-primary">尚未分配项目角色</p>
                              <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
                                可在团队列表中分配角色；当前项目内的团队成员会立即继承。
                              </p>
                            </div>
                          ) : (
                            <ul className="divide-y divide-subtle">
                              {group.grants.map((grant) => (
                                <li key={grant.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                                    <ShieldCheck className="size-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-13 font-medium text-primary">
                                      {grant.role_detail.name}
                                    </p>
                                    <p className="mt-0.5 truncate text-13 text-secondary">
                                      {grant.role_detail.description?.trim() || "暂无角色描述"}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
                          {isMembersLoading ? (
                            <div className="space-y-2">
                              {[1, 2, 3, 4].map((item) => (
                                <div key={item} className="h-12 animate-pulse rounded-md bg-layer-transparent-hover" />
                              ))}
                            </div>
                          ) : membersError ? (
                            <div className="flex min-h-72 flex-col items-center justify-center text-center">
                              <RotateCcw className="mb-3 size-5 text-danger-primary" />
                              <p className="text-13 font-medium text-primary">团队成员加载失败</p>
                              <p className="mt-1 text-13 text-secondary">{membersError}</p>
                              <Button variant="secondary" className="mt-4" onClick={() => onRetryMembers(group.id)}>
                                重新加载
                              </Button>
                            </div>
                          ) : projectMembers.length === 0 ? (
                            <div className="flex min-h-72 flex-col items-center justify-center text-center">
                              <UsersRound className="mb-3 size-7 text-placeholder" />
                              <p className="text-13 font-medium text-primary">暂无项目内团队成员</p>
                              <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
                                可在项目成员页从该团队导入成员；未加入项目的团队成员不会继承项目角色。
                              </p>
                            </div>
                          ) : (
                            <ul className="divide-y divide-subtle">
                              {projectMembers.map((item) => (
                                <li key={item.id} className="flex items-center gap-3 py-3">
                                  <Avatar name={item.member.display_name} src={item.member.avatar_url} size={28} />
                                  <div className="min-w-0">
                                    <p className="truncate text-13 font-medium text-primary">
                                      {item.member.display_name}
                                    </p>
                                    <p className="truncate text-11 text-tertiary">{item.member.email}</p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
