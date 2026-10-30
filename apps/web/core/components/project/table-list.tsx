"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Pagination } from "antd";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  EUserPermissions,
  EUserPermissionsLevel,
  PROJECT_PUBLISH_CREATE_PERMISSION_KEY,
  PROJECT_PUBLISH_VIEW_PERMISSION_KEY,
  PROJECT_SETTINGS_EDIT_PERMISSION_KEY,
  PROJECT_TRACKER_ELEMENTS,
  WORKSPACE_PROJECT_CREATE_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { LockIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProject, TProjectOrderByOptions } from "@plane/types";
import { ContentWrapper, ERowVariant } from "@plane/ui";
import { cn, copyUrlToClipboard, renderFormattedPayloadDate } from "@plane/utils";
import { ProjectsLoader } from "@/components/ui/loader/projects-loader";
import { captureClick } from "@/helpers/event-tracker.helper";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useUserPermissions } from "@/hooks/store/user";
import { PublishProjectModal } from "@/components/project/publish-project/modal";
import { ArchiveRestoreProjectModal } from "@/components/project/archive-restore-modal";
import { CloseProjectModal, ReopenProjectModal } from "@/components/project/close-project-modal";
import { buildProjectSettingsPath, getPathWithSearch } from "@/components/settings/project/navigation";
import { parseOrderBy, toOrderBy } from "./display/display-dropdown";
import { projectConditionsNeedDetails } from "./filters/match-project";
import type { TProjectListLookups } from "./filters/use-project-list-lookups";
import { useProjectListLookups } from "./filters/use-project-list-lookups";
import type { TProjectTableContext } from "./table/columns";
import {
  ACTIONS_COLUMN_WIDTH,
  NAME_COLUMN_MIN_WIDTH,
  PROJECT_COLUMN_WIDTH,
  getVisibleProjectColumns,
  isProjectClosed,
  renderProjectCell,
} from "./table/columns";
import { ProjectRowActions } from "./table/row-actions";

type Props = {
  totalProjectIds?: string[];
  filteredProjectIds?: string[];
  /** 页面根已经拉过字典时传进来，省一次请求；不传就自己拉 */
  lookups?: TProjectListLookups;
};

type TSortKey = "name" | "created_at" | "start_date" | "end_date" | "members_length";

/** 表头点一个新列时的默认方向；再点一次翻转 */
const DEFAULT_SORT_DIRECTION: Record<TSortKey, "asc" | "desc"> = {
  name: "asc",
  created_at: "desc",
  start_date: "asc",
  end_date: "asc",
  members_length: "desc",
};

const HEADER_CELL_CLASS = "px-4 py-3 text-left text-xs font-medium text-secondary whitespace-nowrap";
/** 名称列左侧固定；横向滚动时底色要自己画，否则后面的列会从它底下透出来 */
const STICKY_CELL_CLASS = "sticky left-0 z-[1]";

export const ProjectTableList = observer(function ProjectTableList(props: Props) {
  const { totalProjectIds: totalProjectIdsProps, filteredProjectIds: filteredProjectIdsProps, lookups: lookupsProps } = props;
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceSlugString = workspaceSlug?.toString();
  const { t } = useTranslation();

  const { toggleCreateProjectModal } = useCommandPalette();
  const {
    loader,
    fetchStatus,
    totalProjectIds: storeTotalProjectIds,
    filteredProjectIds: storeFilteredProjectIds,
    getProjectById,
    addProjectToFavorites,
    removeProjectFromFavorites,
  } = useProject();
  const { currentWorkspaceDisplayFilters, currentWorkspaceDisplayProperties, updateDisplayFilters, getRichFilter } =
    useProjectFilter();
  const { allowPermissions, allowWorkspacePermissionKeys, allowProjectPermissionKeys } = useUserPermissions();
  const { getUserDetails } = useMember();
  const ownLookups = useProjectListLookups(lookupsProps ? undefined : workspaceSlugString);
  const lookups = lookupsProps ?? ownLookups;

  const totalProjectIds = totalProjectIdsProps ?? storeTotalProjectIds;
  const filteredProjectIds = filteredProjectIdsProps ?? storeFilteredProjectIds;
  const richFilter = workspaceSlugString ? getRichFilter(workspaceSlugString) : undefined;
  const hasActiveFilters = richFilter?.hasActiveFilters ?? false;

  const canPerformEmptyStateActions = allowWorkspacePermissionKeys(
    [WORKSPACE_PROJECT_CREATE_PERMISSION_KEY],
    workspaceSlugString
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [publishProjectId, setPublishProjectId] = useState<string | null>(null);
  const [archiveProjectId, setArchiveProjectId] = useState<string | null>(null);
  const [restoreProjectId, setRestoreProjectId] = useState<string | null>(null);
  const [closeProjectId, setCloseProjectId] = useState<string | null>(null);
  const [reopenProjectId, setReopenProjectId] = useState<string | null>(null);

  const { key: sortKey, direction: sortDirection } = parseOrderBy(currentWorkspaceDisplayFilters?.order_by);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredProjectIds?.length, sortKey, sortDirection]);

  // 排序已由 store 的 orderProjects 做完，这里只按 id 取出来
  const projects = useMemo(() => {
    if (!filteredProjectIds) return [];
    return filteredProjectIds.map((id) => getProjectById(id)).filter((p): p is TProject => !!p);
  }, [filteredProjectIds, getProjectById]);

  const columns = useMemo(() => getVisibleProjectColumns(currentWorkspaceDisplayProperties), [currentWorkspaceDisplayProperties]);
  const tableMinWidth =
    NAME_COLUMN_MIN_WIDTH + columns.reduce((sum, column) => sum + PROJECT_COLUMN_WIDTH[column.key], 0) + ACTIONS_COLUMN_WIDTH;

  const cellContext = useMemo<TProjectTableContext>(
    () => ({ lookups, getUserDetails, today: renderFormattedPayloadDate(new Date()) ?? "", t }),
    // t 每次渲染都是新引用（见 use-translation.ts），不放依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookups, getUserDetails]
  );

  const total = projects.length;
  const currentPath = getPathWithSearch(pathname, searchParams);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(currentPage * pageSize, total);
  const currentPageProjects = useMemo(
    () => projects.slice(startIndex, startIndex + pageSize),
    [projects, startIndex, pageSize]
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
        setToast({ type: TOAST_TYPE.SUCCESS, title: "链接已复制", message: "项目链接已复制到剪贴板" });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "复制失败", message: "未能复制链接，请重试" });
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
          setToast({ type: TOAST_TYPE.INFO, title: "已取消收藏" });
        } else {
          await addProjectToFavorites(workspaceSlugString, projectId);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "已收藏" });
        }
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: "请稍后重试" });
      }
    },
    [addProjectToFavorites, getProjectById, removeProjectFromFavorites, workspaceSlugString]
  );

  const openModal = useCallback(
    (setter: (id: string | null) => void) => (e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setter(projectId);
    },
    []
  );
  const handleOpenPublishModal = useMemo(() => openModal(setPublishProjectId), [openModal]);
  const handleOpenArchiveModal = useMemo(() => openModal(setArchiveProjectId), [openModal]);
  const handleOpenRestoreModal = useMemo(() => openModal(setRestoreProjectId), [openModal]);
  const handleOpenCloseModal = useMemo(() => openModal(setCloseProjectId), [openModal]);
  const handleOpenReopenModal = useMemo(() => openModal(setReopenProjectId), [openModal]);

  const handleSort = useCallback(
    (key: TSortKey) => {
      if (!workspaceSlugString) return;
      const nextDirection = key === sortKey ? (sortDirection === "asc" ? "desc" : "asc") : DEFAULT_SORT_DIRECTION[key];
      updateDisplayFilters(workspaceSlugString, { order_by: toOrderBy(key, nextDirection) as TProjectOrderByOptions });
    },
    [sortDirection, sortKey, updateDisplayFilters, workspaceSlugString]
  );

  const renderSortIcon = useCallback(
    (key: TSortKey) => {
      if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-placeholder" />;
      if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 text-primary" />;
      return <ArrowDown className="h-3 w-3 text-primary" />;
    },
    [sortDirection, sortKey]
  );

  const renderSortableHeader = (label: string, key: TSortKey) => (
    <button type="button" className="flex items-center gap-1 transition-colors hover:text-primary" onClick={() => handleSort(key)}>
      {label}
      {renderSortIcon(key)}
    </button>
  );

  // 轻量的 projects 接口就够渲染表格，不必死等更重的 projects/details。
  // 例外：按成员筛选依赖 project.members，只有 details 才返回，否则会先闪一下「无结果」。
  const isMembersFilterApplied = projectConditionsNeedDetails(richFilter?.allConditionsForDisplay ?? []);
  const isProjectDataReady =
    fetchStatus === "complete" || (fetchStatus === "partial" && !isMembersFilterApplied);

  if (!filteredProjectIds || !totalProjectIds || loader === "init-loader" || !isProjectDataReady)
    return <ProjectsLoader />;

  if (totalProjectIds?.length === 0 && !currentWorkspaceDisplayFilters?.archived_projects)
    return (
      <EmptyStateDetailed
        title={t("workspace_projects.empty_state.general.title")}
        description={t("workspace_projects.empty_state.general.description")}
        assetKey="project"
        assetClassName="size-40"
        actions={
          canPerformEmptyStateActions
            ? [
                {
                  label: t("workspace_projects.empty_state.general.primary_button.text"),
                  onClick: () => {
                    toggleCreateProjectModal(true);
                    captureClick({ elementName: PROJECT_TRACKER_ELEMENTS.EMPTY_STATE_CREATE_PROJECT_BUTTON });
                  },
                  variant: "primary",
                },
              ]
            : []
        }
      />
    );

  if (filteredProjectIds.length === 0) {
    const isArchivedEmpty = currentWorkspaceDisplayFilters?.archived_projects && !hasActiveFilters;
    return (
      <EmptyStateDetailed
        title={isArchivedEmpty ? t("workspace_empty_state.projects_archived.title") : t("common_empty_state.search.title")}
        description={
          isArchivedEmpty
            ? t("workspace_empty_state.projects_archived.description")
            : t("common_empty_state.search.description")
        }
        assetKey={isArchivedEmpty ? "archived-work-item" : "search"}
        assetClassName="size-40"
      />
    );
  }

  return (
    <>
      {publishProjectId && (
        <PublishProjectModal isOpen={!!publishProjectId} projectId={publishProjectId} onClose={() => setPublishProjectId(null)} />
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
      {restoreProjectId && workspaceSlugString && (
        <ArchiveRestoreProjectModal
          isOpen={!!restoreProjectId}
          projectId={restoreProjectId}
          onClose={() => setRestoreProjectId(null)}
          workspaceSlug={workspaceSlugString}
          archive={false}
        />
      )}
      {closeProjectId && workspaceSlugString && (
        <CloseProjectModal
          isOpen={!!closeProjectId}
          projectId={closeProjectId}
          workspaceSlug={workspaceSlugString}
          lookups={lookups}
          onClose={() => setCloseProjectId(null)}
        />
      )}
      {reopenProjectId && workspaceSlugString && (
        <ReopenProjectModal
          isOpen={!!reopenProjectId}
          projectId={reopenProjectId}
          workspaceSlug={workspaceSlugString}
          onClose={() => setReopenProjectId(null)}
        />
      )}
      <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
        <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
          <div className="min-h-0 flex-1 overflow-auto vertical-scrollbar horizontal-scrollbar scrollbar-lg">
            <table className="w-full table-fixed text-sm" style={{ minWidth: tableMinWidth }}>
              <colgroup>
                <col />
                {columns.map((column) => (
                  <col key={column.key} style={{ width: PROJECT_COLUMN_WIDTH[column.key] }} />
                ))}
                <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
              </colgroup>
              <thead className="sticky top-0 z-[2] border-b border-subtle bg-layer-1">
                <tr>
                  <th className={cn(HEADER_CELL_CLASS, STICKY_CELL_CLASS, "bg-layer-1")}>
                    {renderSortableHeader(t("workspace_projects.fields.name"), "name")}
                  </th>
                  {columns.map((column) => (
                    <th key={column.key} className={HEADER_CELL_CLASS}>
                      {column.orderByKey ? renderSortableHeader(t(column.i18n_label), column.orderByKey) : t(column.i18n_label)}
                    </th>
                  ))}
                  <th className={HEADER_CELL_CLASS}>{t("workspace_projects.fields.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {currentPageProjects.map((project) => {
                  const isArchived = !!project.archived_at;
                  const isPrivateProject = project.network === 0;
                  // 私有项目非成员：可见但不能进入 / 加入
                  const isInviteOnly = isPrivateProject && !project.member_role;
                  const canManageProject = allowPermissions(
                    [EUserPermissions.ADMIN],
                    EUserPermissionsLevel.PROJECT,
                    workspaceSlugString,
                    project.id
                  );
                  const canPublishProject =
                    allowProjectPermissionKeys(
                      [PROJECT_PUBLISH_VIEW_PERMISSION_KEY, PROJECT_PUBLISH_CREATE_PERMISSION_KEY],
                      workspaceSlugString,
                      project.id
                    ) ||
                    (project.permission_keys ?? []).some(
                      (k) => k === PROJECT_PUBLISH_VIEW_PERMISSION_KEY || k === PROJECT_PUBLISH_CREATE_PERMISSION_KEY
                    );
                  // 关闭 / 重新开启与后端同一把 key（项目设置编辑）；列表页只有进过的项目才拉了权限 key，
                  // 所以项目管理员也直接放行（管理员必有这把 key）
                  const canCloseProject =
                    canManageProject ||
                    allowProjectPermissionKeys([PROJECT_SETTINGS_EDIT_PERMISSION_KEY], workspaceSlugString, project.id) ||
                    (project.permission_keys ?? []).includes(PROJECT_SETTINGS_EDIT_PERMISSION_KEY);
                  const projectSettingsPath = workspaceSlugString
                    ? buildProjectSettingsPath({ workspaceSlug: workspaceSlugString, projectId: project.id, currentPath })
                    : "#";

                  return (
                    <tr
                      key={project.id}
                      className={cn("group border-b border-subtle hover:bg-layer-1-hover", {
                        "bg-layer-1 opacity-70": isArchived,
                      })}
                    >
                      <td
                        className={cn(
                          STICKY_CELL_CLASS,
                          "px-4 py-3 group-hover:bg-layer-1-hover",
                          isArchived ? "bg-layer-1" : "bg-surface-1"
                        )}
                      >
                        <div className="flex min-w-0 items-center">
                          <Link
                            href={workspaceSlugString ? `/${workspaceSlugString}/projects/${project.id}/overview` : "#"}
                            className="flex min-w-0 flex-1 items-center gap-2 text-primary"
                            data-prevent-progress={isArchived || isInviteOnly}
                            onClick={(e) => {
                              if (isArchived || isInviteOnly) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                              if (isInviteOnly) {
                                setToast({ type: TOAST_TYPE.INFO, title: t("workspace_projects.network.private.description") });
                              }
                            }}
                          >
                            <div className="flex w-full min-w-0 flex-grow select-none items-center gap-1.5 text-left">
                              <div className="grid size-4 flex-shrink-0 place-items-center">
                                <Logo logo={project.logo_props} size={14} />
                              </div>
                              <div className="flex min-w-0 flex-grow items-center gap-2">
                                <p className="min-w-0 truncate text-sm font-medium text-primary">{project.name}</p>
                                {isPrivateProject && (
                                  <Tooltip tooltipContent={t("workspace_projects.network.private.title")} position="top">
                                    <span className="grid flex-shrink-0 place-items-center">
                                      <LockIcon className="h-3 w-3 text-placeholder" />
                                    </span>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </Link>
                        </div>
                      </td>
                      {columns.map((column) => (
                        <td key={column.key} className="px-4 py-3">
                          {renderProjectCell(column.key, project, cellContext)}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <ProjectRowActions
                          project={project}
                          isClosed={isProjectClosed(project, cellContext)}
                          canManageProject={canManageProject}
                          canCloseProject={canCloseProject}
                          canPublishProject={canPublishProject}
                          settingsPath={projectSettingsPath}
                          onCopyLink={handleCopyProjectLink}
                          onToggleFavorite={handleToggleProjectFavorite}
                          onPublish={handleOpenPublishModal}
                          onCloseProject={handleOpenCloseModal}
                          onReopenProject={handleOpenReopenModal}
                          onArchive={handleOpenArchiveModal}
                          onRestore={handleOpenRestoreModal}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-secondary">{total > 0 ? `第 ${startIndex + 1}-${endIndex} 条，共 ${total} 条` : ""}</span>
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
