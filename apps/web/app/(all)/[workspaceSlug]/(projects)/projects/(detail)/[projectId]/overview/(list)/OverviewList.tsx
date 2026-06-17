import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal, Pagination } from "antd";
import useSWR from "swr";
import { BookOpen, History, Maximize2, Megaphone, Plus, Timer, Trash2, Users } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { ProjectActivity } from "@/components/project/project-activity";
import { useMember } from "@/hooks/store/use-member";
import { ProjectAnnouncementService, ProjectStatisticService } from "@/services/project";
import {
  AnnouncementDetailModal,
  CreateAnnouncementModal,
  type TProjectAnnouncement,
} from "./announcement-modals";
import { OverviewCard } from "./overview-card";
import { OverviewDescriptionModal } from "./overview-description-modal";
import { OverviewDistributionCard } from "./overview-distribution-card";
import { OverviewFactsRail } from "./overview-facts-rail";
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
  "cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary";

type TPageView = {
  project: IProject;
  workspaceSlug: string;
};

export const OverviewListView: React.FC<TPageView> = observer((props) => {
  const { project, workspaceSlug } = props;
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
  const [progressListModalSection, setProgressListModalSection] = useState<OverviewProgressSection | null>(null);
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();

  const overview = useProjectOverview(workspaceSlug, project.id);
  const projectMemberIds = getProjectMemberIds(project.id, true);
  const memberCount = projectMemberIds?.length ?? overview.memberStats.length;

  const { data: statisticData } = useSWR(
    workspaceSlug && project.id ? `project-statistic-overview-${workspaceSlug}-${project.id}` : null,
    () =>
      projectStatisticService.getStatistic(workspaceSlug, project.id, {
        page_size: 20,
        include_all_statuses: true,
      }),
    { keepPreviousData: true }
  );

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

  const projectDescriptionEditMeta = useMemo(() => {
    if (!project.updated_at) return null;
    const timeLabel =
      renderFormattedDate(getDate(project.updated_at), "yyyy-MM-dd") ?? String(project.updated_at);
    const userId = project.updated_by ?? project.created_by;
    if (!userId) return timeLabel;
    const details = getUserDetails(userId);
    const name = details?.display_name || details?.email || userId;
    return `${name} · ${timeLabel}`;
  }, [project.updated_at, project.updated_by, project.created_by, getUserDetails]);

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
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
            <TableRow>
              <TableHead className="h-8 w-2/5 text-left text-xs font-medium text-placeholder">公告</TableHead>
              <TableHead className="h-8 w-1/5 text-left text-xs font-medium text-placeholder">创建人</TableHead>
              <TableHead className="h-8 w-1/4 text-left text-xs font-medium text-placeholder">创建时间</TableHead>
              <TableHead className="h-8 w-12 text-left text-xs font-medium text-placeholder">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingAnnouncements ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                </TableCell>
              </TableRow>
            ) : announcements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="grid h-14 place-items-center text-sm text-placeholder">暂无公告</div>
                </TableCell>
              </TableRow>
            ) : (
              announcements.map((item) => (
                <TableRow key={item.id} className="transition-colors hover:bg-layer-1">
                  <TableCell
                    className="max-w-[200px] cursor-pointer truncate text-sm text-primary"
                    title={item.name}
                    onClick={() => {
                      setActiveAnnouncement(item);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    {item.name}
                  </TableCell>
                  <TableCell className="text-sm">{creatorLabel(item.created_by)}</TableCell>
                  <TableCell className="text-sm">
                    {item.created_at ? renderFormattedDate(getDate(item.created_at), "yyyy-MM-dd") : "-"}
                  </TableCell>
                  <TableCell className="text-left">
                    <button
                      type="button"
                      className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDeleteAnnouncement(item.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
          <ProjectHealthHero overview={overview}>
            <OverviewFactsRail
              project={project}
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
              distribution={overview.distribution}
              total={overview.counts.total}
              isLoading={overview.isLoading}
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
              <div className="h-full overflow-hidden px-4 pb-4">
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
              className="shrink-0 cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
              aria-label="新增公告"
              title="新增公告"
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
          />
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
