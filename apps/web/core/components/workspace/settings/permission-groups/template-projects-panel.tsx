/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link } from "react-router";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTemplateProjectRef } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { getPermissionGroupErrorMessage } from "./helpers";

type Props = {
  workspaceSlug: string;
  projects: TTemplateProjectRef[];
  isLoading: boolean;
  canManage: boolean;
  onExclude: (projectId: string) => Promise<void>;
  onRestore: (projectId: string) => Promise<void>;
};

const GRID = "grid grid-cols-[minmax(0,1fr)_140px_110px_90px] items-center gap-x-4 px-4";
const OP_BUTTON =
  "text-13 text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/**
 * 模板组详情的「引用项目」页：白名单命中的项目。「移除」= 这个项目不再引用（项目里绑到它的人解绑），
 * 「恢复」= 从排除列表拿掉。项目里删除这个组和这里移除是同一件事。
 */
export function TemplateProjectsPanel({ workspaceSlug, projects, isLoading, canManage, onExclude, onRestore }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (projectId: string, action: () => Promise<void>, failure: string) => {
    setBusyId(projectId);
    try {
      await action();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: failure, message: getPermissionGroupErrorMessage(error, "请稍后重试") });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading && projects.length === 0)
    return (
      <Loader className="flex flex-col gap-2">
        {[0, 1, 2].map((index) => (
          <Loader.Item key={index} height="40px" />
        ))}
      </Loader>
    );

  const referencing = projects.filter((project) => !project.excluded).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-13 text-tertiary">
        数据权限白名单命中的项目自动引用这个组：模板改了，它们同步生效。移除后项目里不再有这个组（绑到它上面的人解绑），随时可以恢复。
        <span className="ml-2 tabular-nums">引用中 {referencing} 个</span>
      </p>
      <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div className={cn(GRID, "h-10 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary")}>
          <span>项目</span>
          <span>代号</span>
          <span>状态</span>
          <span className="text-right">操作</span>
        </div>
        {projects.length === 0 ? (
          <p className="py-12 text-center text-13 text-placeholder">白名单里还没有项目</p>
        ) : (
          projects.map((project) => {
            const isBusy = busyId === project.id;
            return (
              <div
                key={project.id}
                className={cn(GRID, "h-11 border-b border-subtle text-13 last:border-b-0 hover:bg-layer-1-hover")}
              >
                <Link
                  to={`/${workspaceSlug}/settings/projects/${project.id}/roles/`}
                  className={cn("truncate text-accent-primary hover:underline", project.excluded && "text-secondary")}
                >
                  {project.name}
                </Link>
                <span className="truncate text-secondary">{project.identifier}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-11 font-medium",
                      project.excluded ? "bg-layer-2 text-tertiary" : "bg-accent-subtle text-accent-primary"
                    )}
                  >
                    {project.excluded ? "已排除" : "引用中"}
                  </span>
                  {project.archived_at && <span className="text-11 text-placeholder">已归档</span>}
                </span>
                <span className="flex items-center justify-end">
                  {project.excluded ? (
                    <button
                      type="button"
                      className={OP_BUTTON}
                      disabled={!canManage || isBusy}
                      onClick={() => void run(project.id, () => onRestore(project.id), "恢复失败")}
                    >
                      恢复
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={cn(OP_BUTTON, "text-danger-primary")}
                      disabled={!canManage || isBusy}
                      onClick={() => void run(project.id, () => onExclude(project.id), "移除失败")}
                    >
                      移除
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
