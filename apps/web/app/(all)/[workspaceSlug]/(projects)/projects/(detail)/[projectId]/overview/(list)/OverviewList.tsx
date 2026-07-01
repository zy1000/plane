import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal, Pagination } from "antd";
import useSWR from "swr";
import {
  AlertTriangle,
  BookOpen,
  History,
  Maximize2,
  Megaphone,
  MoreHorizontal,
  Plus,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import {
  PROJECT_ANNOUNCEMENT_CREATE_PERMISSION_KEY,
  PROJECT_ANNOUNCEMENT_DELETE_PERMISSION_KEY,
  PROJECT_ERROR_MESSAGES,
  isProjectPermissionError,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu } from "@plane/ui";
import { calculateTimeAgo, getDate, renderFormattedDate } from "@plane/utils";
import { OverdueByAssigneeCard } from "@/components/common/overdue-by-assignee-card";
import { DEFECT_PRESET_PARAM } from "@/components/issues/defects/defect-quick-filter-bar";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { ProjectActivity } from "@/components/project/project-activity";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import {
  ProjectAnnouncementService,
  ProjectStatisticService,
  type TProjectStatisticResponse,
} from "@/services/project";
import {
  AnnouncementDetailModal,
  CreateAnnouncementModal,
  type TProjectAnnouncement,
} from "./announcement-modals";
import { OverviewCard } from "./overview-card";
import { OverviewDescriptionModal } from "./overview-description-modal";
import { OverviewDistributionCard, type TOverviewDistributionItem } from "./overview-distribution-card";
import { OverviewFactsRail } from "./overview-facts-rail";
import { OverviewProjectMeta } from "./overview-project-meta";
import { Reveal } from "./overview-reveal";
import { OverviewMemberTimesheet } from "./overview-member-timesheet";
import {
  OverviewProgressListModal,
  type OverviewProgressSection,
} from "./overview-progress-list-modal";
import { OverviewTeamWorkload } from "./overview-team-workload";
import { OverviewVelocityCard } from "./overview-velocity-card";
import { ProjectHealthHero } from "./project-health-hero";
import { useProjectOverview } from "./use-project-overview";

const announcementService = new ProjectAnnouncementService();
const projectStatisticService = new ProjectStatisticService();

const iconButtonClass =
  "cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder";

/** 工作项类型环形图配色（无类型自带颜色时按序兜底） */
const WORK_ITEM_TYPE_PALETTE = [
  "#3f76ff",
  "#16a34a",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

type TPageView = {
  project: IProject;
  workspaceSlug: string;
};

export const OverviewListView: React.FC<TPageView> = observer((props) => {
  const { project, workspaceSlug } = props;
  const router = useAppRouter();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState<TNameDescriptionLoader>("submitted");
  const [announcements, setAnnouncements] = useState<TProjectAnnouncement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<TProjectAnnouncement | null>(null);
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isAnnouncementsFullscreenOpen, setIsAnnouncementsFullscreenOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [isHoursChartReady, setIsHoursChartReady] = useState(false);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [progressListModalSection, setProgressListModalSection] = useState<OverviewProgressSection | null>(null);
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const overview = useProjectOverview(workspaceSlug, project.id);
  const projectMemberIds = getProjectMemberIds(project.id, true);
  const memberCount = projectMemberIds?.length ?? overview.memberStats.length;
  const canCreateAnnouncements = allowProjectPermissionKeys(
    [PROJECT_ANNOUNCEMENT_CREATE_PERMISSION_KEY],
    workspaceSlug,
    project.id
  );
  const canDeleteAnnouncements = allowProjectPermissionKeys(
    [PROJECT_ANNOUNCEMENT_DELETE_PERMISSION_KEY],
    workspaceSlug,
    project.id
  );

  const handleHoursModalOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setIsHoursChartReady(false);
      return;
    }

    if (typeof window === "undefined") {
      setIsHoursChartReady(true);
      return;
    }

    window.requestAnimationFrame(() => setIsHoursChartReady(true));
  }, []);

  const handlePendingDefectsClick = useCallback(() => {
    router.push(`/${workspaceSlug}/projects/${project.id}/defects?${DEFECT_PRESET_PARAM}=open`);
  }, [project.id, router, workspaceSlug]);

  const { data: statisticData } = useSWR(
    workspaceSlug && project.id ? `project-statistic-overview-${workspaceSlug}-${project.id}` : null,
    () =>
      projectStatisticService.getOverviewStatistic(workspaceSlug, project.id, {
        page_size: 20,
        include_all_statuses: true,
      }),
    { keepPreviousData: true }
  );

  const { data: overdueStatisticData, error: overdueStatisticError } = useSWR<TProjectStatisticResponse>(
    isOverdueModalOpen ? `project-statistic-overdue-${workspaceSlug}-${project.id}` : null,
    () =>
      projectStatisticService.getStatistic(workspaceSlug, project.id, {
        page_size: 20,
      }),
    { keepPreviousData: true }
  );

  const overdueByAssigneeData = useMemo(() => {
    if (overdueStatisticData?.overdue_by_assignee) return overdueStatisticData.overdue_by_assignee;
    if (overdueStatisticData || overdueStatisticError) {
      return {
        total: 0,
        data: [],
      };
    }
    return null;
  }, [overdueStatisticData, overdueStatisticError]);

  const fetchAnnouncements = useCallback(async () => {
    if (!workspaceSlug || !project?.id) return;
    setIsLoadingAnnouncements(true);
    try {
      const response = await announcementService.fetchAnnouncements(workspaceSlug, project.id, {
        page,
        page_size: pageSize,
      });
      setAnnouncements(response?.data ?? []);
      setTotalCount(response?.count ?? 0);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "加载失败",
        message: "获取公告列表失败，请稍后重试。",
      });
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [page, pageSize, project?.id, workspaceSlug]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const creatorLabel = useMemo(
    () =>
      (createdBy: TProjectAnnouncement["created_by"]) => {
        if (!createdBy) return "-";
        if (typeof createdBy === "string") {
          const details = getUserDetails(createdBy);
          return details?.display_name || details?.email || createdBy;
        }
        return createdBy.display_name || createdBy.email || createdBy.id || "-";
      },
    [getUserDetails]
  );

  const workItemTypeDistribution = useMemo<TOverviewDistributionItem[]>(() => {
    const rows = statisticData?.work_item_stats ?? [];
    return rows
      .map((row, index) => ({
        key: row.type_id,
        label: row.name,
        value: Math.max((row.total ?? 0) - (row.cancelled ?? 0), 0),
        color: row.logo_props?.icon?.color || WORK_ITEM_TYPE_PALETTE[index % WORK_ITEM_TYPE_PALETTE.length],
      }))
      .filter((item) => item.value > 0);
  }, [statisticData?.work_item_stats]);

  const workItemTypeTotal = useMemo(
    () => workItemTypeDistribution.reduce((acc, item) => acc + item.value, 0),
    [workItemTypeDistribution]
  );

  const projectDescriptionEditMeta = useMemo(() => {
    if (!project.updated_at) return null;
    const userId = project.updated_by ?? project.created_by;
    const details = userId ? getUserDetails(userId) : null;
    const displayName = userId ? details?.display_name || details?.email || userId : null;

    return (
      <div className="flex items-center gap-1 text-tertiary">
        <span className="grid size-4 flex-shrink-0 place-items-center">
          <History className="size-3.5" />
        </span>
        <p className="text-11">
          {t("description_versions.last_edited_by")}{" "}
          <span className="font-medium">{displayName ?? t("common.deactivated_user")}</span>{" "}
          {calculateTimeAgo(project.updated_at)}
        </p>
      </div>
    );
  }, [project.updated_at, project.updated_by, project.created_by, getUserDetails, t]);

  const handleDeleteAnnouncement = async (id: string) => {
    if (!workspaceSlug || !project?.id) return;
    try {
      await announcementService.deleteAnnouncements(workspaceSlug, project.id, [id]);
      if (announcements.length === 1 && page > 1) setPage(page - 1);
      else fetchAnnouncements();
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "删除失败",
          message: "删除公告失败，请稍后重试。",
        });
      }
    }
  };

  const confirmDeleteAnnouncement = (id: string) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除该公告后不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDeleteAnnouncement(id);
      },
    });
  };

  const announcementsListBody = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
        {isLoadingAnnouncements ? (
          <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
        ) : announcements.length === 0 ? (
          <div className="grid h-14 place-items-center text-sm text-placeholder">暂无公告</div>
        ) : (
          <div>
            {announcements.map((item) => (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  className="group/list-block relative flex min-h-11 w-full cursor-pointer flex-col gap-3 bg-layer-transparent py-3 pr-10 pl-6 text-left text-13 transition-colors hover:bg-layer-transparent-hover md:flex-row md:items-center"
                  title={item.name}
                  onClick={() => {
                    setActiveAnnouncement(item);
                    setIsDetailModalOpen(true);
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                    <span className="truncate text-primary">{item.name}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3 text-11 text-tertiary">
                    <span className="max-w-32 truncate">{creatorLabel(item.created_by)}</span>
                    <span>{item.created_at ? renderFormattedDate(getDate(item.created_at), "yyyy-MM-dd") : "-"}</span>
                  </div>
                </button>
                <div className="absolute top-1/2 right-0 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
                  <CustomMenu
                    customButton={
                      <button
                        type="button"
                        className="grid size-7 cursor-pointer place-items-center rounded-md text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                        aria-label="公告操作"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    }
                    placement="bottom-end"
                    closeOnSelect
                  >
                    <CustomMenu.MenuItem
                      className={`flex items-center gap-2 ${
                        canDeleteAnnouncements ? "text-danger-primary" : "text-placeholder"
                      }`}
                      disabled={!canDeleteAnnouncements}
                      onClick={() => {
                        if (canDeleteAnnouncements) confirmDeleteAnnouncement(item.id);
                      }}
                    >
                      <Trash2 className="size-3 flex-shrink-0" />
                      <span>删除</span>
                    </CustomMenu.MenuItem>
                  </CustomMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalCount > pageSize && (
        <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-2">
          <span className="text-xs text-placeholder">
            第 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} 条，共 {totalCount} 条
          </span>
          <Pagination
            simple
            current={page}
            pageSize={pageSize}
            total={totalCount}
            showQuickJumper
            onChange={(p) => setPage(p)}
            size="small"
          />
        </div>
      )}
    </>
  );

  const fullscreenModalClassName =
    "[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto";

  const fullscreenModalContentStyles = {
    height: "100vh" as const,
    maxHeight: "100vh" as const,
    borderRadius: 0,
    boxShadow: "none",
    display: "flex" as const,
    flexDirection: "column" as const,
    padding: 0,
    margin: 0,
  };

  const fullscreenModalHeaderStyles = {
    flexShrink: 0,
    margin: 0,
    borderRadius: 0,
    padding: "16px 20px",
    minHeight: 64,
    display: "flex" as const,
    alignItems: "center" as const,
  };

  const fullscreenModalBodyStyles = {
    flex: 1,
    minHeight: 0,
    padding: 0,
    overflow: "hidden" as const,
    display: "flex" as const,
    flexDirection: "column" as const,
  };

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Header */}
        <Reveal className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="shrink-0 text-xl font-semibold tracking-tight text-primary">项目概览</h1>
          <p className="min-w-0 truncate text-sm text-placeholder">
            {project.name} · {project.identifier}
          </p>
        </Reveal>

        {/* 健康总览 Hero */}
        <Reveal delay={60}>
          <ProjectHealthHero
            overview={overview}
            onOverdueClick={() => setIsOverdueModalOpen(true)}
            onPendingDefectsClick={handlePendingDefectsClick}
            leftExtra={<OverviewProjectMeta project={project} />}
          >
            <OverviewFactsRail
              totalHours={overview.totalHours}
              memberCount={memberCount}
              cycleCount={statisticData?.cycles?.count ?? 0}
              releaseCount={statisticData?.releases?.count ?? 0}
              testPlanCount={statisticData?.test_plans?.count ?? 0}
              caseReviewCount={statisticData?.case_reviews?.count ?? 0}
              onMembersClick={() => setIsMembersModalOpen(true)}
              onHoursClick={() => setIsHoursModalOpen(true)}
              onCyclesClick={() => setProgressListModalSection("cycle")}
              onReleasesClick={() => setProgressListModalSection("release")}
              onTestPlansClick={() => setProgressListModalSection("plan")}
              onCaseReviewsClick={() => setProgressListModalSection("review")}
            />
          </ProjectHealthHero>
        </Reveal>

        {/* Bento 栅格 */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Reveal delay={160} className="xl:col-span-4">
            <OverviewDistributionCard
              className="h-[340px]"
              title="工作项类型分布"
              distribution={workItemTypeDistribution}
              total={workItemTypeTotal}
              isLoading={!statisticData}
            />
          </Reveal>
          <Reveal delay={200} className="xl:col-span-8">
            <OverviewVelocityCard className="h-[340px]" trend={overview.trend} isLoading={overview.isLoading} />
          </Reveal>

          {/* 项目描述 */}
          <Reveal delay={240} className="xl:col-span-12">
            <OverviewCard
              className="h-[380px]"
              title="项目描述"
              icon={BookOpen}
              meta={projectDescriptionEditMeta}
              action={
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label="全屏查看项目描述"
                  title="全屏查看"
                  onClick={() => setIsDescriptionModalOpen(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              }
            >
              {/* contain:paint 让本卡片成为只读编辑器内 position:fixed 拖拽手柄的包含块并裁剪它，
                  否则该 fixed 元素会逃逸 overflow-hidden、停靠在描述完整高度处，撑出页面底部空白 */}
              <div className="h-full overflow-hidden px-4 pb-4 [contain:paint]">
                <ProjectDescriptionInput
                  workspaceSlug={workspaceSlug}
                  projectId={project.id}
                  initialValue={project?.description_html}
                  disabled
                  setIsSubmitting={setIsSubmitting}
                  swrProjectDescription={project?.description_html}
                  containerClassName="h-full vertical-scrollbar scrollbar-sm overflow-y-auto pb-0"
                />
              </div>
            </OverviewCard>
          </Reveal>

          {/* 项目公告 */}
          <Reveal delay={280} className="xl:col-span-12">
            <OverviewCard
              className="h-[380px]"
              title="项目公告"
              icon={Megaphone}
              action={
                <>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label="新增公告"
                    title="新增公告"
                    disabled={!canCreateAnnouncements}
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className={iconButtonClass} onClick={() => setIsAnnouncementsFullscreenOpen(true)}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </>
              }
              bodyClassName="flex flex-col"
            >
              {announcementsListBody}
            </OverviewCard>
          </Reveal>

          {/* 项目活动 */}
          <Reveal delay={320} className="xl:col-span-12">
            <OverviewCard
              className="h-[380px]"
              title="项目活动"
              icon={History}
              action={
                <button type="button" className={iconButtonClass} onClick={() => setIsActivityModalOpen(true)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              }
            >
              <div className="h-full px-4 pb-4">
                <ProjectActivity
                  workspaceSlug={workspaceSlug}
                  projectId={project.id}
                  showHeading={false}
                  containerClassName="h-full overflow-y-auto vertical-scrollbar scrollbar-sm"
                />
              </div>
            </OverviewCard>
          </Reveal>
        </div>
      </div>

      <CreateAnnouncementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        onSuccess={() => {
          if (page !== 1) setPage(1);
          else fetchAnnouncements();
        }}
      />
      <AnnouncementDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setActiveAnnouncement(null);
        }}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        announcement={activeAnnouncement}
      />

      <OverviewDescriptionModal
        isOpen={isDescriptionModalOpen}
        onClose={() => setIsDescriptionModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        initialValue={project?.description_html}
      />

      {/* 项目活动 Modal（全屏） */}
      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <History className="h-4 w-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">项目活动</span>
          </div>
        }
        open={isActivityModalOpen}
        onCancel={() => setIsActivityModalOpen(false)}
        closable
        closeIcon={
          <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
            <CloseOutlined className="text-base text-inherit" />
            <span>退出全屏</span>
          </span>
        }
        footer={null}
        centered={false}
        width="100%"
        style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
        className={fullscreenModalClassName}
        classNames={{ wrapper: "!p-0", header: "!mb-0 border-b border-subtle" }}
        styles={{
          content: fullscreenModalContentStyles,
          header: fullscreenModalHeaderStyles,
          body: fullscreenModalBodyStyles,
        }}
        destroyOnClose
        getContainer={() => document.body}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm px-4 pb-3">
            <ProjectActivity
              workspaceSlug={workspaceSlug}
              projectId={project.id}
              showHeading={false}
              containerClassName="min-h-0"
            />
          </div>
        </div>
      </Modal>

      {/* 项目公告全屏 — zIndex 低于 ModalCore(z-30) 以免遮挡公告详情弹窗 */}
      <Modal
        title={
          <div className="flex w-full min-w-0 items-center justify-between gap-4 pr-24">
            <div className="flex min-w-0 items-center gap-2">
              <Megaphone className="h-4 w-4 shrink-0 text-placeholder" />
              <span className="text-base font-medium text-primary">项目公告</span>
            </div>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder"
              aria-label="新增公告"
              title="新增公告"
              disabled={!canCreateAnnouncements}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        }
        open={isAnnouncementsFullscreenOpen}
        onCancel={() => setIsAnnouncementsFullscreenOpen(false)}
        closable
        closeIcon={
          <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
            <CloseOutlined className="text-base text-inherit" />
            <span>退出全屏</span>
          </span>
        }
        footer={null}
        centered={false}
        zIndex={29}
        width="100%"
        style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
        className={fullscreenModalClassName}
        classNames={{ wrapper: "!p-0", header: "!mb-0 border-b border-subtle" }}
        styles={{
          content: fullscreenModalContentStyles,
          header: fullscreenModalHeaderStyles,
          body: fullscreenModalBodyStyles,
        }}
        destroyOnClose
        getContainer={() => document.body}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-1">{announcementsListBody}</div>
      </Modal>

      {/* 团队负荷 Modal */}
      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <Users className="h-4 w-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">团队负荷</span>
            <span className="text-sm text-placeholder">共 {memberCount} 人</span>
          </div>
        }
        open={isMembersModalOpen}
        onCancel={() => setIsMembersModalOpen(false)}
        footer={null}
        centered
        width={2500}
        destroyOnClose
        styles={{ body: { padding: 0, overflow: "hidden" } }}
      >
        <div className="h-[78vh] max-h-[78vh]">
          <OverviewTeamWorkload
            workspaceSlug={workspaceSlug}
            projectId={project.id}
            memberStats={overview.memberStats}
            isAnalyticsLoading={overview.isLoading}
          />
        </div>
      </Modal>

      {/* 成员工时 Modal */}
      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <Timer className="h-4 w-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">成员工时</span>
            <span className="text-sm text-placeholder">累计 {overview.totalHours}h</span>
          </div>
        }
        open={isHoursModalOpen}
        onCancel={() => setIsHoursModalOpen(false)}
        afterOpenChange={handleHoursModalOpenChange}
        footer={null}
        centered
        width={2500}
        destroyOnClose
        styles={{ body: { padding: 0, overflow: "hidden" } }}
      >
        <div className="h-[78vh] max-h-[78vh]">
          <OverviewMemberTimesheet
            memberStats={overview.memberStats}
            isAnalyticsLoading={overview.isLoading}
            isChartReady={isHoursChartReady}
          />
        </div>
      </Modal>

      {/* 延期工作项负责人 Modal */}
      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger-primary" />
            <span className="text-base font-medium text-primary">延期工作项负责人</span>
            <span className="text-sm text-placeholder">
              共 {overdueByAssigneeData?.total ?? overview.overdue} 条
            </span>
          </div>
        }
        open={isOverdueModalOpen}
        onCancel={() => setIsOverdueModalOpen(false)}
        footer={null}
        centered
        width={1200}
        destroyOnClose
        styles={{ body: { padding: 0, overflow: "hidden" } }}
      >
        <div className="flex h-[78vh] max-h-[78vh] flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
            <OverdueByAssigneeCard
              hideHeader
              data={overdueByAssigneeData}
              className="h-full min-h-0 bg-surface-1 p-4"
            />
          </div>
        </div>
      </Modal>

      {progressListModalSection && (
        <OverviewProgressListModal
          open={Boolean(progressListModalSection)}
          onClose={() => setProgressListModalSection(null)}
          section={progressListModalSection}
          workspaceSlug={workspaceSlug}
          projectId={project.id}
        />
      )}
    </div>
  );
});
