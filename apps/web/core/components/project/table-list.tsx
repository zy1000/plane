"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pagination } from "antd";
import { ArrowDown, ArrowUp, ArrowUpDown, Earth, Link as LinkIcon, Lock, Settings, Star } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, ContentWrapper, ERowVariant, LinearProgressIndicator } from "@plane/ui";
import { calculateTotalFilters, cn, copyUrlToClipboard, getFileURL, renderFormattedDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectsLoader } from "@/components/ui/loader/projects-loader";
import { captureClick } from "@/helpers/event-tracker.helper";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useUserPermissions } from "@/hooks/store/user";
import type { TProject } from "@plane/types";

type Props = {
  totalProjectIds?: string[];
  filteredProjectIds?: string[];
};

type TSortKey = "name" | "created_at" | "status";
type TSortDirection = "asc" | "desc";

const isSortKey = (key: string): key is TSortKey =>
  key === "name" || key === "created_at" || key === "status";

type TProjectAnalyze = {
  total_work_items?: { count: number };
  started_work_items?: { count: number };
  backlog_work_items?: { count: number };
  un_started_work_items?: { count: number };
  completed_work_items?: { count: number };
  cancelled_work_items?: { count: number };
};

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
    fetchProjectAnalyticsCount,
    getProjectAnalyticsCountById,
    fetchProjectAnalyze,
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
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<TSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<TSortDirection>("desc");

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
  const currentPageProjectIds = useMemo(() => currentPageProjects.map((p) => p.id).join(","), [currentPageProjects]);
  const currentPageProjectIdList = useMemo(() => currentPageProjects.map((p) => p.id), [currentPageProjects]);
  const [workItemStatsMap, setWorkItemStatsMap] = useState<Record<string, TProjectAnalyze | null | undefined>>({});

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
      if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-custom-text-400" />;
      if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 text-custom-text-200" />;
      return <ArrowDown className="h-3 w-3 text-custom-text-200" />;
    },
    [sortDirection, sortKey]
  );

  useEffect(() => {
    if (!workspaceSlug || !currentPageProjectIds) return;
    fetchProjectAnalyticsCount(workspaceSlug.toString(), {
      project_ids: currentPageProjectIds,
      fields: "total_issues,completed_issues",
    }).catch(() => {});
  }, [workspaceSlug, currentPageProjectIds, fetchProjectAnalyticsCount]);

  useEffect(() => {
    if (!workspaceSlug || currentPageProjectIdList.length === 0) return;

    let active = true;

    (async () => {
      const results = await Promise.all(
        currentPageProjectIdList.map(async (projectId) => {
          try {
            const data = (await fetchProjectAnalyze(workspaceSlug.toString(), projectId)) as TProjectAnalyze;
            return [projectId, data] as const;
          } catch {
            return [projectId, null] as const;
          }
        })
      );

      if (!active) return;

      setWorkItemStatsMap((prev) => {
        const next = { ...prev };
        for (const [projectId, data] of results) next[projectId] = data;
        return next;
      });
    })();

    return () => {
      active = false;
    };
  }, [workspaceSlug, currentPageProjectIdList, fetchProjectAnalyze]);

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
    <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
      <div className="w-full h-full rounded border border-custom-border-200 bg-custom-background-100 m-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto vertical-scrollbar scrollbar-lg">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-custom-border-200 bg-custom-background-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300">
                  <button
                    type="button"
                    className="flex items-center gap-1 transition-colors hover:text-custom-text-200"
                    onClick={() => handleSort("name")}
                  >
                    项目名称
                    {renderSortIcon("name")}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300 hidden sm:table-cell">负责人</th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300 hidden md:table-cell">
                  <button
                    type="button"
                    className="flex items-center gap-1 transition-colors hover:text-custom-text-200"
                    onClick={() => handleSort("status")}
                  >
                    状态
                    {renderSortIcon("status")}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300 hidden md:table-cell">权限</th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300 hidden md:table-cell">
                  工作项进度
                </th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300 hidden lg:table-cell">
                  <button
                    type="button"
                    className="flex items-center gap-1 transition-colors hover:text-custom-text-200"
                    onClick={() => handleSort("created_at")}
                  >
                    创建时间
                    {renderSortIcon("created_at")}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-custom-text-300">操作</th>
              </tr>
            </thead>
            <tbody>
              {currentPageProjects.map((project) => {
              const isArchived = !!project.archived_at;
              const analytics = getProjectAnalyticsCountById(project.id) as
                | {
                    completed_issues?: number;
                    total_issues?: number;
                  }
                | undefined;
              const analyze = workItemStatsMap[project.id];
              const projectLeadId =
                typeof project.project_lead === "string" ? project.project_lead : project.project_lead?.id ?? null;
              const projectLead =
                typeof project.project_lead === "string"
                  ? getUserDetails(project.project_lead)
                  : project.project_lead ?? undefined;

              const completedWorkItems = Number(
                analyze?.completed_work_items?.count ?? analytics?.completed_issues ?? 0
              );
              const totalWorkItems = Number(analyze?.total_work_items?.count ?? analytics?.total_issues ?? 0);
              const completionPercentage =
                totalWorkItems > 0
                  ? Math.min(100, Math.max(0, Math.round((completedWorkItems / totalWorkItems) * 100)))
                  : 0;
              const startedCount = Number(analyze?.started_work_items?.count ?? 0);
              const backlogCount = Number(analyze?.backlog_work_items?.count ?? 0);
              const unstartedCount = Number(analyze?.un_started_work_items?.count ?? 0);
              const cancelledCount = Number(analyze?.cancelled_work_items?.count ?? 0);

              const progressData = [
                { id: "completed", name: "已完成", value: completedWorkItems, color: "#92eca7" },
                {
                  id: "remaining",
                  name: "未完成",
                  value: Math.max(totalWorkItems - completedWorkItems, 0),
                  color: "#ebedf2",
                },
              ];

              return (
                <tr
                  key={project.id}
                  className={cn("border-b border-custom-border-200 last:border-b-0 hover:bg-custom-background-80", {
                    "bg-custom-background-90": isArchived,
                    "opacity-70": isArchived,
                  })}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={workspaceSlugString ? `/${workspaceSlugString}/projects/${project.id}/issues` : "#"}
                      className="flex items-center gap-2 text-custom-text-100"
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
                          <p className="min-w-0 truncate text-sm font-medium text-custom-text-200">{project.name}</p>
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
                          "text-custom-text-200": !isArchived,
                          "text-custom-text-400": isArchived,
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
                            "text-custom-text-200": !isArchived,
                            "text-custom-text-400": isArchived,
                          })}
                        >
                          {projectLead.display_name ?? projectLead.email ?? "-"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-custom-text-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className={cn("inline-flex items-center rounded px-2 py-1 text-xs font-medium", {
                        "text-custom-text-200": !isArchived,
                        "text-custom-text-400": isArchived,
                      })}
                    >
                      {isArchived ? "已归档" : "进行中"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {project.network === 2 ? (
                      <div className="flex items-center gap-2 truncate">
                        <div className="grid w-5 flex-shrink-0 place-items-center">
                          <Earth className="h-3 w-3" />
                        </div>
                        <div
                          className={cn("flex-grow truncate text-xs", {
                            "text-custom-text-200": !isArchived,
                            "text-custom-text-400": isArchived,
                          })}
                        >
                          公开
                        </div>
                      </div>
                    ) : project.network === 0 ? (
                      <div className="flex items-center gap-2 truncate">
                        <div className="grid w-5 flex-shrink-0 place-items-center">
                          <Lock className="h-3 w-3" />
                        </div>
                        <div
                          className={cn("flex-grow truncate text-xs", {
                            "text-custom-text-200": !isArchived,
                            "text-custom-text-400": isArchived,
                          })}
                        >
                          私有
                        </div>
                      </div>
                    ) : (
                      <span className="text-custom-text-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {totalWorkItems > 0 ? (
                      <div className="flex items-center gap-3">
                        <div className="w-36">
                          <Tooltip
                            tooltipContent={
                              analyze === undefined ? (
                                <div className="text-xs text-custom-text-300">加载中...</div>
                              ) : (
                                <div className="flex flex-col gap-1 text-xs">
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Backlog</span>
                                    <span className="text-custom-text-300 tabular-nums">
                                      {analyze ? backlogCount : "-"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Unstarted</span>
                                    <span className="text-custom-text-300 tabular-nums">
                                      {analyze ? unstartedCount : "-"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Started</span>
                                    <span className="text-custom-text-300 tabular-nums">
                                      {analyze ? startedCount : "-"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Completed</span>
                                    <span className="text-custom-text-300 tabular-nums">{completedWorkItems}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Cancelled</span>
                                    <span className="text-custom-text-300 tabular-nums">
                                      {analyze ? cancelledCount : "-"}
                                    </span>
                                  </div>
                                  <div className="h-px w-full bg-custom-border-200 my-1" />
                                  <div className="flex items-center justify-between gap-6">
                                    <span className="text-custom-text-200">Total</span>
                                    <span className="text-custom-text-300 tabular-nums">{totalWorkItems}</span>
                                  </div>
                                </div>
                              )
                            }
                            position="top"
                          >
                            <div>
                              <LinearProgressIndicator noTooltip size="sm" data={progressData} />
                            </div>
                          </Tooltip>
                        </div>
                        <span className="text-xs text-custom-text-300 tabular-nums">{completionPercentage}%</span>
                      </div>
                    ) : (
                      <span className="text-custom-text-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-custom-text-300 hidden lg:table-cell">
                    {project.created_at ? renderFormattedDate(project.created_at) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-start gap-2">
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-custom-text-200">{isArchived ? "已归档不可复制链接" : "复制链接"}</div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-custom-text-300 transition-colors",
                            isArchived
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-custom-text-200 hover:bg-custom-background-80"
                          )}
                          aria-label="复制链接"
                          onClick={(e) => handleCopyProjectLink(e, project.id)}
                        >
                          <LinkIcon className="h-3 w-3" />
                        </button>
                      </Tooltip>
                      <Tooltip
                        tooltipContent={
                          <div className="text-xs text-custom-text-200">{isArchived ? "已归档不可收藏" : "收藏"}</div>
                        }
                        position="top"
                      >
                        <button
                          type="button"
                          disabled={isArchived}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded text-custom-text-300 transition-colors",
                            isArchived
                              ? "cursor-not-allowed opacity-50"
                              : "hover:text-custom-text-200 hover:bg-custom-background-80"
                          )}
                          aria-label="收藏"
                          onClick={(e) => handleToggleProjectFavorite(e, project.id)}
                        >
                          <Star className="transition-all h-3 w-3" fill={project.is_favorite ? "currentColor" : "none"} />
                        </button>
                      </Tooltip>
                      <Tooltip tooltipContent={<div className="text-xs text-custom-text-200">设置</div>} position="top">
                         <Link
                            className="flex items-center justify-center rounded p-1 text-custom-text-400 hover:bg-custom-background-80 hover:text-custom-text-200"
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
        <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-custom-text-300">
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
  );
});
