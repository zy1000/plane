"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pagination } from "antd";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Globe2, Link as LinkIcon, Settings, Star } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, ContentWrapper, ERowVariant } from "@plane/ui";
import { calculateTotalFilters, cn, copyUrlToClipboard, getFileURL, renderFormattedDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectsLoader } from "@/components/ui/loader/projects-loader";
import { captureClick } from "@/helpers/event-tracker.helper";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useUserPermissions } from "@/hooks/store/user";
import { PublishProjectModal } from "@/components/project/publish-project/modal";
import { ArchiveRestoreProjectModal } from "@/components/project/archive-restore-modal";
import type { TProject } from "@plane/types";

type Props = {
  totalProjectIds?: string[];
  filteredProjectIds?: string[];
};

type TSortKey = "name" | "created_at" | "status";
type TSortDirection = "asc" | "desc";

const isSortKey = (key: string): key is TSortKey =>
  key === "name" || key === "created_at" || key === "status";

export const ProjectTableList = observer(function ProjectTableList(props: Props) {
  const { totalProjectIds: totalProjectIdsProps, filteredProjectIds: filteredProjectIdsProps } = props;
  const { workspaceSlug } = useParams();
  const workspaceSlugString = workspaceSlug?.toString();
  const { t } = useTranslation();

  const { toggleCreateProjectModal } = useCommandPalette();
  const {
    loader,
    fetchStatus,
    totalProjectIds: storeTotalProjectIds,
    filteredProjectIds: storeFilteredProjectIds,
    getProjectById,
    fetchPartialProjects,
    updateProject,
    addProjectToFavorites,
    removeProjectFromFavorites,
  } = useProject();
  const {
    currentWorkspaceDisplayFilters,
    currentWorkspaceFilters,
    updateDisplayFilters,
  } = useProjectFilter();
  const { allowPermissions } = useUserPermissions();
  const { getUserDetails } = useMember();

  const totalProjectIds = totalProjectIdsProps ?? storeTotalProjectIds;
  const filteredProjectIds = filteredProjectIdsProps ?? storeFilteredProjectIds;

  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const canEditProjectLead = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const handleUpdateProjectLead = useCallback(
    async (projectId: string, leadId: string | null) => {
      if (!workspaceSlugString) return;
      try {
        await updateProject(workspaceSlugString, projectId, { project_lead: leadId });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "负责人已更新",
        });
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "更新失败",
          message: "未能更新负责人，请稍后重试",
        });
      }
    },
    [updateProject, workspaceSlugString]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<TSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<TSortDirection>("desc");
  const [publishProjectId, setPublishProjectId] = useState<string | null>(null);
  const [archiveProjectId, setArchiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceSlugString) return;
    void fetchPartialProjects(workspaceSlugString);
  }, [fetchPartialProjects, workspaceSlugString]);

  useEffect(() => {
    const orderBy = currentWorkspaceDisplayFilters?.order_by?.toString();
    if (!orderBy) return;
    const isDescending = orderBy[0] === "-";
    const key = (isDescending ? orderBy.slice(1) : orderBy).trim();
    if (!isSortKey(key)) return;
    setSortKey(key);
    setSortDirection(isDescending ? "desc" : "asc");
  }, [currentWorkspaceDisplayFilters?.order_by]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredProjectIds?.length, sortKey, sortDirection]);

  const projects = useMemo(() => {
    if (!filteredProjectIds) return [];
    return filteredProjectIds
      .map((id) => getProjectById(id))
      .filter((p): p is TProject => !!p);
  }, [filteredProjectIds, getProjectById]);

  const sortedProjects = useMemo(() => {
    const arr = [...projects];
    const factor = sortDirection === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      if (sortKey === "name") return factor * a.name.localeCompare(b.name);
      if (sortKey === "created_at")
        return factor * (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
      if (sortKey === "status") {
        const av = a.archived_at ? 1 : 0;
        const bv = b.archived_at ? 1 : 0;
        if (av !== bv) return factor * (av - bv);
        return factor * a.name.localeCompare(b.name);
      }
      return factor * a.name.localeCompare(b.name);
    });

    return arr;
  }, [projects, sortDirection, sortKey]);

  const total = sortedProjects.length;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(currentPage * pageSize, total);
  const currentPageProjects = useMemo(
    () => sortedProjects.slice(startIndex, startIndex + pageSize),
    [sortedProjects, startIndex, pageSize]
  );
  const handlePaginationChange = useCallback((page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  }, []);

  const handleCopyProjectLink = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!workspaceSlugString) return;

      try {
        await copyUrlToClipboard(`${workspaceSlugString}/projects/${projectId}/issues`);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "链接已复制",
          message: "项目链接已复制到剪贴板",
        });
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "复制失败",
          message: "未能复制链接，请重试",
        });
      }
    },
    [workspaceSlugString]
  );

  const handleToggleProjectFavorite = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!workspaceSlugString) return;

      const projectDetails = getProjectById(projectId);
      if (!projectDetails) return;

      try {
        if (projectDetails.is_favorite) {
          await removeProjectFromFavorites(workspaceSlugString, projectId);
          setToast({
            type: TOAST_TYPE.INFO,
            title: "已取消收藏",
          });
        } else {
          await addProjectToFavorites(workspaceSlugString, projectId);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "已收藏",
          });
        }
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "操作失败",
          message: "请稍后重试",
        });
      }
    },
    [addProjectToFavorites, getProjectById, removeProjectFromFavorites, workspaceSlugString]
  );

  const handleOpenPublishModal = useCallback((e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPublishProjectId(projectId);
  }, []);

  const handleOpenArchiveModal = useCallback((e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setArchiveProjectId(projectId);
  }, []);

  const handleSort = useCallback(
    (key: TSortKey) => {
      const nextDirection: TSortDirection = key === sortKey ? (sortDirection === "asc" ? "desc" : "asc") : "asc";
      setSortKey(key);
      setSortDirection(nextDirection);

      if (!workspaceSlug) return;
      if (key === "name" || key === "created_at") {
        const orderBy = nextDirection === "desc" ? `-${key}` : key;
        updateDisplayFilters(workspaceSlug.toString(), { order_by: orderBy as any });
      }
    },
    [sortDirection, sortKey, updateDisplayFilters, workspaceSlug]
  );

  const renderSortIcon = useCallback(
    (key: TSortKey) => {
      if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-placeholder" />;
      if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 text-primary" />;
      return <ArrowDown className="h-3 w-3 text-primary" />;
    },
    [sortDirection, sortKey]
  );

  if (!filteredProjectIds || !totalProjectIds || loader === "init-loader" || fetchStatus !== "complete")
    return <ProjectsLoader />;

  if (totalProjectIds?.length === 0 && !currentWorkspaceDisplayFilters?.archived_projects)
    return (
      <EmptyStateDetailed
        title={t("workspace_projects.empty_state.general.title")}
        description={t("workspace_projects.empty_state.general.description")}
        assetKey="project"
        assetClassName="size-40"
        actions={[
          {
            label: t("workspace_projects.empty_state.general.primary_button.text"),
            onClick: () => {
              toggleCreateProjectModal(true);
              captureClick({ elementName: PROJECT_TRACKER_ELEMENTS.EMPTY_STATE_CREATE_PROJECT_BUTTON });
            },
            disabled: !canPerformEmptyStateActions,
            variant: "primary",
          },
        ]}
      />
    );

  if (filteredProjectIds.length === 0)
    return (
      <EmptyStateDetailed
        title={
          currentWorkspaceDisplayFilters?.archived_projects && calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.title")
            : t("common_empty_state.search.title")
        }
        description={
          currentWorkspaceDisplayFilters?.archived_projects && calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.description")
            : t("common_empty_state.search.description")
        }
        assetKey={
          currentWorkspaceDisplayFilters?.archived_projects && calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? "archived-work-item"
            : "search"
        }
        assetClassName="size-40"
      />
    );

  return (
    <>
      {publishProjectId && (
        <PublishProjectModal
          isOpen={!!publishProjectId}
          projectId={publishProjectId}
          onClose={() => setPublishProjectId(null)}
        />
      )}
      {archiveProjectId && workspaceSlugString && (
        <ArchiveRestoreProjectModal
          isOpen={!!archiveProjectId}
          projectId={archiveProjectId}
          onClose={() => setArchiveProjectId(null)}
          workspaceSlug={workspaceSlugString}
          archive
        />
      )}
      <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
        <div className="w-full h-full rounded border border-subtle bg-surface-1 m-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto vertical-scrollbar scrollbar-lg">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-subtle bg-surface-1">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-secondary">
                    <button
                      type="button"
                      className="flex items-center gap-1 transition-colors hover:text-primary"
                      onClick={() => handleSort("name")}
                    >
                      项目名称
                      {renderSortIcon("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden sm:table-cell">负责人</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden md:table-cell">
                    <button
                      type="button"
                      className="flex items-center gap-1 transition-colors hover:text-primary"
                      onClick={() => handleSort("status")}
                    >
                      状态
                      {renderSortIcon("status")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden md:table-cell">
                    进度
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden md:table-cell">
                    缺陷数量
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden md:table-cell">
                    迭代数量
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary hidden lg:table-cell">
                    <button
                      type="button"
                      className="flex items-center gap-1 transition-colors hover:text-primary"
                      onClick={() => handleSort("created_at")}
                    >
                      创建时间
                      {renderSortIcon("created_at")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {currentPageProjects.map((project) => {
                  const isArchived = !!project.archived_at;
                  const canManageProject = allowPermissions(
                    [EUserPermissions.ADMIN],
                    EUserPermissionsLevel.PROJECT,
                    workspaceSlugString,
                    project.id
                  );
                  const projectLeadId =
                    typeof project.project_lead === "string" ? project.project_lead : project.project_lead?.id ?? null;
                  const projectLead =
                    typeof project.project_lead === "string"
                      ? getUserDetails(project.project_lead)
                      : project.project_lead ?? undefined;

                  const completedWorkItems = Number(project.completed_work_items ?? 0);
                  const totalWorkItems = Number(project.total_work_items ?? 0);
                  const completionPercentage =
                    totalWorkItems > 0
                      ? Math.min(100, Math.max(0, Math.round((completedWorkItems / totalWorkItems) * 100)))
                      : 0;
                  const startedCount = Number(project.started_work_items ?? 0);
                  const backlogCount = Number(project.backlog_work_items ?? 0);
                  const unstartedCount = Number(project.un_started_work_items ?? 0);
                  const cancelledCount = Number(project.cancelled_work_items ?? 0);

                  return (
                    <tr
                      key={project.id}
                      className={cn("border-b border-subtle last:border-b-0 hover:bg-layer-1-hover", {
                        "bg-layer-1": isArchived,
                        "opacity-70": isArchived,
                      })}
                    >
                  <td className="px-4 py-3">
                    <Link
                      href={workspaceSlugString ? `/${workspaceSlugString}/projects/${project.id}/overview` : "#"}
                      className="flex items-center gap-2 text-primary"
                      data-prevent-progress={isArchived}
                      onClick={(e) => {
                        if (isArchived) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                    >
                      <div className="flex-grow flex items-center gap-1.5 text-left select-none w-full min-w-0">
                        <div className="size-4 grid place-items-center flex-shrink-0">
                          <Logo logo={project.logo_props} size={14} />
                        </div>
                        <div className="flex min-w-0 flex-grow items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-primary">{project.name}</p>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {canEditProjectLead ? (
                      <MemberDropdown
                        multiple={false}
                        value={projectLeadId}
                        onChange={(val) => handleUpdateProjectLead(project.id, val)}
                        disabled={!workspaceSlugString || isArchived}
                        placeholder="选择负责人"
                        className="w-full text-sm"
                        buttonContainerClassName="w-full text-left p-0"
                        buttonVariant="transparent-with-text"
                        buttonClassName={cn("text-xs p-0 hover:bg-transparent hover:bg-inherit", {
                          "text-primary": !isArchived,
                          "text-placeholder": isArchived,
                        })}
                        showUserDetails={true}
                        hideIcon={!projectLeadId}
                        optionsClassName="z-[60]"
                        projectId={project.id}
                      />
                    ) : projectLead ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar
                          name={projectLead.display_name}
                          src={getFileURL(projectLead.avatar_url)}
                          showTooltip={false}
                          size="sm"
                        />
                        <span
                          className={cn("truncate text-xs", {
                            "text-primary": !isArchived,
                            "text-placeholder": isArchived,
                          })}
                        >
                          {projectLead.display_name ?? projectLead.email ?? "-"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-secondary">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 pl-1 hidden md:table-cell">
                    <span
                      className={cn("inline-flex items-center rounded px-2 py-1 text-xs font-medium", {
                        "text-primary": !isArchived,
                        "text-placeholder": isArchived,
                      })}
                    >
                      {isArchived ? "已归档" : "进行中"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {totalWorkItems > 0 ? (
                      <Tooltip
                        tooltipContent={
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Backlog</span>
                              <span className="text-secondary tabular-nums">{backlogCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Unstarted</span>
                              <span className="text-secondary tabular-nums">{unstartedCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Started</span>
                              <span className="text-secondary tabular-nums">{startedCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Completed</span>
                              <span className="text-secondary tabular-nums">{completedWorkItems}</span>
                            </div>
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Cancelled</span>
                              <span className="text-secondary tabular-nums">{cancelledCount}</span>
                            </div>
                            <div className="h-px w-full bg-[var(--border-subtle)] my-1" />
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-primary">Total</span>
                              <span className="text-secondary tabular-nums">{totalWorkItems}</span>
                            </div>
                          </div>
                        }
                        position="top"
                      >
                        <span className="text-xs text-secondary tabular-nums">
                          {completionPercentage}%
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-secondary">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary hidden md:table-cell tabular-nums">
                    {project.bug_count ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-secondary hidden md:table-cell tabular-nums">
                    {project.cycle_count ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-secondary hidden lg:table-cell">
                    {project.created_at ? renderFormattedDate(project.created_at) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-start gap-2">
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-primary">{isArchived ? "已归档不可复制链接" : "复制链接"}</div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                            isArchived
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-primary hover:bg-layer-1-hover"
                          )}
                          aria-label="复制链接"
                          onClick={(e) => handleCopyProjectLink(e, project.id)}
                        >
                          <LinkIcon className="h-3 w-3" />
                        </button>
                      </Tooltip>
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-primary">{isArchived ? "已归档不可收藏" : "收藏"}</div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                            isArchived
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-primary hover:bg-layer-1-hover"
                          )}
                          aria-label="收藏"
                          onClick={(e) => handleToggleProjectFavorite(e, project.id)}
                        >
                          <Star className="transition-all h-3 w-3" fill={project.is_favorite ? "currentColor" : "none"} />
                        </button>
                      </Tooltip>
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-primary">
                            {isArchived ? "已归档不可发布" : canManageProject ? "发布项目" : "无权限发布"}
                          </div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived || !canManageProject}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                            isArchived || !canManageProject
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-primary hover:bg-layer-1-hover"
                          )}
                          aria-label="发布项目"
                          onClick={(e) => handleOpenPublishModal(e, project.id)}
                        >
                          <Globe2 className="h-3 w-3" />
                        </button>
                      </Tooltip>
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-primary">
                            {isArchived ? "已归档" : canManageProject ? "归档" : "无权限归档"}
                          </div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived || !canManageProject}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                            isArchived || !canManageProject
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-primary hover:bg-layer-1-hover"
                          )}
                          aria-label="归档项目"
                          onClick={(e) => handleOpenArchiveModal(e, project.id)}
                        >
                          <Archive className="h-3 w-3" />
                        </button>
                      </Tooltip>
                      <Tooltip tooltipContent={<div className="text-xs text-primary">设置</div>} position="top">
                        <Link
                          className="flex items-center justify-center rounded p-1 text-placeholder hover:bg-layer-1-hover hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          href={`/${workspaceSlug}/settings/projects/${project.id}`}
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Link>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
                })}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0 border-t border-subtle px-4 py-3 bg-surface-1 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-secondary">
              {total > 0 ? `第 ${startIndex + 1}-${endIndex} 条，共 ${total} 条` : ""}
            </span>
          </div>
          <Pagination
            simple
            current={currentPage}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={["10", "20", "50", "100"]}
            onChange={handlePaginationChange}
            onShowSizeChange={handlePaginationChange}
            size="small"
          />
        </div>
      </div>
    </ContentWrapper>
    </>
  );
});
