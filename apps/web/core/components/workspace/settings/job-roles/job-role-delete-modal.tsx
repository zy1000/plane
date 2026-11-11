/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRole } from "@plane/types";
import { AlertModalCore, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getJobRoleErrorMessage } from "@/hooks/store/use-workspace-job-roles";
import type { TJobRoleTab } from "./helpers";
import { getJobRoleDetailPath } from "./helpers";
import { JobRoleTag } from "./job-role-tag";

type Props = {
  workspaceSlug: string;
  role: TJobRole | null;
  onClose: () => void;
  onConfirm: (role: TJobRole) => Promise<void>;
};

const isInUse = (role: TJobRole) =>
  role.workspace_member_count > 0 || role.project_member_count > 0 || role.transition_count > 0 || role.matrix_count > 0;

/** 删除角色：使用中的角色列出引用、不给删（后端同样拦）；没被使用的二次确认后删除 */
export function JobRoleDeleteModal({ workspaceSlug, role, onClose, onConfirm }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (role && isInUse(role)) return <JobRoleInUseModal workspaceSlug={workspaceSlug} role={role} onClose={onClose} />;

  const handleSubmit = async () => {
    if (!role) return;
    setIsSubmitting(true);
    try {
      await onConfirm(role);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已删除「${role.label}」` });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: getJobRoleErrorMessage(error, "请稍后重试") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={Boolean(role)}
      handleClose={onClose}
      handleSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      title={`删除角色「${role?.label ?? ""}」？`}
      content="该角色未被使用。删除后不可恢复。"
      primaryButtonText={{ loading: "删除中", default: "删除" }}
    />
  );
}

function JobRoleInUseModal({ workspaceSlug, role, onClose }: { workspaceSlug: string; role: TJobRole; onClose: () => void }) {
  const rows: { key: string; label: string; value: string; sub?: string; tab?: TJobRoleTab }[] = [
    { key: "workspace", label: "工作区成员", value: `${role.workspace_member_count} 人`, tab: "workspace" },
    {
      key: "projects",
      label: "项目成员",
      value: `${role.project_member_count} 人`,
      sub: `${role.project_count} 个项目`,
      tab: "projects",
    },
    {
      key: "references",
      label: "工作流引用",
      value: `${role.transition_count} 个流转`,
      sub: `${role.workflow_count} 个工作流`,
      tab: "references",
    },
    { key: "matrix", label: "研发矩阵", value: `${role.matrix_count} 处` },
  ].filter((row) => {
    if (row.key === "workspace") return role.workspace_member_count > 0;
    if (row.key === "projects") return role.project_member_count > 0;
    if (row.key === "references") return role.transition_count > 0;
    return role.matrix_count > 0;
  });

  return (
    <ModalCore isOpen handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <h2 className="text-18 font-semibold text-primary">无法删除角色</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-5 pt-3 pb-1">
        <p className="flex flex-wrap items-center gap-1.5 text-14 leading-6 text-primary">
          角色
          <JobRoleTag role={role} />
          正在使用中，移除以下引用后方可删除。
        </p>
        <div className="overflow-hidden rounded-lg border border-subtle">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid h-13 grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-x-4 border-b border-subtle px-4 text-14 last:border-b-0"
            >
              <span className="text-secondary">{row.label}</span>
              <span className="font-medium whitespace-nowrap text-primary tabular-nums">
                {row.value}
                {row.sub && <span className="ml-1.5 text-13 font-normal text-tertiary">{row.sub}</span>}
              </span>
              {row.tab ? (
                <Link
                  to={getJobRoleDetailPath(workspaceSlug, role.id, row.tab)}
                  className="text-right text-accent-primary hover:underline"
                  onClick={onClose}
                >
                  查看
                </Link>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <p className="text-13 text-tertiary">未被使用的角色可直接删除，删除后不可恢复。</p>
      </div>
      <div className="flex justify-end px-5 pt-4 pb-5">
        <Button variant="primary" size="lg" onClick={onClose}>
          知道了
        </Button>
      </div>
    </ModalCore>
  );
}
