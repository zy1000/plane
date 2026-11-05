/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTemplateProjectRef } from "@plane/types";
import { AlertModalCore, Avatar, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { getPermissionGroupErrorMessage } from "./helpers";
import { PermissionGroupPager, PermissionGroupSearch, PermissionGroupSegmented } from "./ui";

type Props = {
  workspaceSlug: string;
  projects: TTemplateProjectRef[];
  isLoading: boolean;
  canManage: boolean;
  onExclude: (projectId: string) => Promise<void>;
  onRestore: (projectId: string) => Promise<void>;
};

type TFilter = "referencing" | "excluded";

const PAGE_SIZE = 20;
const GRID = "grid grid-cols-[minmax(0,1fr)_170px_110px_56px] items-center gap-x-4 px-5";
const OP_BUTTON = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/**
 * 项目权限模板详情的「引用项目」页：工作区全部项目，分「引用中 / 已移除」两页，搜索 + 分页。
 * 「移除」= 这个项目不再引用（项目里绑到它的人解绑，先确认），「恢复」= 从排除列表拿掉。
 * 项目里删除这个组和这里移除是同一件事。
 */
export const TemplateProjectsPanel = observer(function TemplateProjectsPanel(props: Props) {
  const { workspaceSlug, projects, isLoading, canManage, onExclude, onRestore } = props;
  const { getUserDetails } = useMember();
  const [filter, setFilter] = useState<TFilter>("referencing");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingExclude, setPendingExclude] = useState<TTemplateProjectRef | null>(null);

  const referencingCount = projects.filter((project) => !project.excluded).length;
  const excludedCount = projects.length - referencingCount;
  const keyword = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      projects.filter((project) => {
        if (project.excluded !== (filter === "excluded")) return false;
        if (!keyword) return true;
        return project.name.toLowerCase().includes(keyword) || project.identifier.toLowerCase().includes(keyword);
      }),
    [projects, filter, keyword]
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 换页签 / 搜索回到第一页；移除后当前页空了往前退
  useEffect(() => setPage(1), [filter, keyword]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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

  const handleExclude = async () => {
    if (!pendingExclude) return;
    await run(pendingExclude.id, () => onExclude(pendingExclude.id), "移除失败");
    setPendingExclude(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSegmented<TFilter>
          items={[
            { key: "referencing", label: "引用中", count: referencingCount },
            { key: "excluded", label: "已移除", count: excludedCount },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索项目名称或代号" className="w-72" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[680px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>项目</span>
            <span>负责人</span>
            <span>本项目绑定</span>
            <span className="flex justify-end">操作</span>
          </div>
          {isLoading && projects.length === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="40px" />
              ))}
            </Loader>
          ) : pageRows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">
              {keyword ? "没有匹配的项目" : filter === "excluded" ? "没有移除过的项目" : "还没有引用中的项目"}
            </p>
          ) : (
            pageRows.map((project) => {
              const lead = project.project_lead_id ? getUserDetails(project.project_lead_id) : undefined;
              const isBusy = busyId === project.id;
              return (
                <div
                  key={project.id}
                  className={cn(GRID, "h-14 border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
                >
                  <div className="flex min-w-0 items-baseline gap-3">
                    <Link
                      to={`/${workspaceSlug}/settings/projects/${project.id}/permission/`}
                      className="truncate font-medium text-primary hover:text-accent-primary hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="shrink-0 text-13 text-tertiary tabular-nums">{project.identifier}</span>
                    {project.archived_at && <span className="shrink-0 text-12 text-placeholder">已归档</span>}
                  </div>
                  {lead ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size="md" />
                      <span className="truncate text-secondary">{lead.display_name}</span>
                    </span>
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                  {project.bound_member_count > 0 ? (
                    <span className="text-secondary tabular-nums">{project.bound_member_count} 人</span>
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                  <span className="flex justify-end">
                    {project.excluded ? (
                      <button
                        type="button"
                        className={`${OP_BUTTON} text-accent-primary`}
                        disabled={!canManage || isBusy}
                        onClick={() => void run(project.id, () => onRestore(project.id), "恢复失败")}
                      >
                        恢复
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${OP_BUTTON} text-secondary hover:text-danger-primary`}
                        disabled={!canManage || isBusy}
                        onClick={() => setPendingExclude(project)}
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

      <PermissionGroupPager total={rows.length} page={page} pageCount={pageCount} onPageChange={setPage} />

      <AlertModalCore
        isOpen={Boolean(pendingExclude)}
        handleClose={() => setPendingExclude(null)}
        handleSubmit={handleExclude}
        isSubmitting={Boolean(pendingExclude) && busyId === pendingExclude?.id}
        title={`移除「${pendingExclude?.name ?? ""}」的引用？`}
        content={
          (pendingExclude?.bound_member_count ?? 0) > 0
            ? `该项目里绑在这个组上的 ${pendingExclude?.bound_member_count} 人会被解绑，之后可在「已移除」里恢复。`
            : "之后可在「已移除」里恢复。"
        }
        primaryButtonText={{ loading: "移除中", default: "移除" }}
      />
    </div>
  );
});
