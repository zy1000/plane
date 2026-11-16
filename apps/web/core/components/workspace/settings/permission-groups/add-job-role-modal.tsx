/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { JobRoleTag } from "@/components/workspace/settings/job-roles/job-role-tag";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { getPermissionGroupErrorMessage } from "./helpers";
import { PermissionGroupSearch } from "./ui";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  /** 已绑定的角色 id：列表里置灰、不可再选 */
  boundIds: string[];
  /** 各角色现有的人数（拿得到才显示在行尾） */
  holderCounts?: Map<string, number>;
  onClose: () => void;
  onAdd: (jobRoleIds: string[]) => Promise<void>;
};

/** 权限组「添加角色」：从工作区的角色里多选，已绑定的置灰 */
export function AddJobRoleModal({ isOpen, workspaceSlug, boundIds, holderCounts, onClose, onAdd }: Props) {
  const { jobRoles, isLoading } = useJobRoles(workspaceSlug);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIds([]);
  }, [isOpen]);

  const bound = useMemo(() => new Set(boundIds), [boundIds]);
  const keyword = query.trim().toLowerCase();
  const rows = jobRoles.filter((role) => !keyword || role.label.toLowerCase().includes(keyword));

  const toggle = (jobRoleId: string) =>
    setSelectedIds((prev) => (prev.includes(jobRoleId) ? prev.filter((id) => id !== jobRoleId) : [...prev, jobRoleId]));

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await onAdd(selectedIds);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已添加 ${selectedIds.length} 个角色` });
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "添加失败",
        message: getPermissionGroupErrorMessage(error, "请稍后重试"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={isSubmitting ? undefined : onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h3 className="text-18 font-semibold text-primary">添加角色</h3>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-6 pt-3 pb-1">
          <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索角色" className="w-full" />
          <div className="vertical-scrollbar scrollbar-sm max-h-[min(52vh,26rem)] overflow-y-auto rounded-lg border border-subtle">
            {isLoading && jobRoles.length === 0 ? (
              <Loader className="flex flex-col gap-2 p-3">
                {[0, 1, 2].map((index) => (
                  <Loader.Item key={index} height="32px" />
                ))}
              </Loader>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-14 text-placeholder">{keyword ? "没有匹配的角色" : "工作区暂无角色"}</p>
            ) : (
              rows.map((role) => {
                const isBound = bound.has(role.id);
                const inputId = `add-job-role-${role.id}`;
                const count = holderCounts?.get(role.id);
                return (
                  <label
                    key={role.id}
                    htmlFor={inputId}
                    className={cn(
                      "flex h-12 items-center gap-3 border-b border-subtle px-3.5 last:border-b-0",
                      isBound ? "bg-layer-1" : "cursor-pointer hover:bg-layer-1-hover"
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={isBound || selectedIds.includes(role.id)}
                      disabled={isBound}
                      onChange={() => toggle(role.id)}
                    />
                    <JobRoleTag role={role} />
                    <span className="ml-auto text-13 text-tertiary tabular-nums">
                      {isBound ? "已绑定" : count !== undefined ? `${count} 人` : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-5">
          <span className="text-13 text-tertiary tabular-nums">已选 {selectedIds.length} 个</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={isSubmitting}
              disabled={selectedIds.length === 0}
              onClick={() => void handleSubmit()}
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
