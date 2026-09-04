import { type FC, useCallback, useState } from "react";
import { observer } from "mobx-react";
import { Modal } from "antd";
import { History, Maximize2, Megaphone, Plus, Timer, Users } from "lucide-react";
import {
  PROJECT_ANNOUNCEMENT_CREATE_PERMISSION_KEY,
  PROJECT_ANNOUNCEMENT_DELETE_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IProject } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getDate, getFileURL, renderFormattedDate } from "@plane/utils";
import { DEFECT_PRESET_PARAM } from "@/components/issues/defects/defect-quick-filter-bar";
import { ProjectActivity } from "@/components/project/project-activity";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { AnnouncementDetailModal, CreateAnnouncementModal, type TProjectAnnouncement } from "./announcement-modals";
import { OverviewAnnouncementsCard, OverviewAnnouncementsList } from "./overview-announcements-card";
import { OverviewCard, overviewIconButtonClass } from "./overview-card";
import { OverviewDefectsCard } from "./overview-defects-card";
import { OverviewDescriptionCard } from "./overview-description-card";
import { OverviewDescriptionModal } from "./overview-description-modal";
import { OverviewFactsStrip } from "./overview-facts-strip";
import { OverviewFullscreenModal } from "./overview-fullscreen-modal";
import { OverviewHero } from "./overview-hero";
import { OverviewMemberTimesheet } from "./overview-member-timesheet";
import { OverviewOngoingCard } from "./overview-ongoing-card";
import { OverviewProductsCard } from "./overview-products-card";
import { OverviewProgressListModal, type OverviewProgressSection } from "./overview-progress-list-modal";
import { Reveal } from "./overview-reveal";
import { OverviewTeamWorkload } from "./overview-team-workload";
import { OverviewWorkItemListModal, type OverviewWorkItemMetric } from "./overview-work-item-list-modal";
import { OverviewWorkloadCard } from "./overview-workload-card";
import { useProjectAnnouncements } from "./use-project-announcements";
import { useProjectOverview } from "./use-project-overview";
import { useProjectOverviewStatistic } from "./use-project-overview-statistic";

type TPageView = {
  project: IProject;
  workspaceSlug: string;
};

/** 标题行：项目名 · 标识，右侧是状态 / 负责人 / 创建时间 */
const OverviewPageHeader: FC<{ project: IProject }> = observer(({ project }) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const lead =
    typeof project.project_lead === "string" ? getUserDetails(project.project_lead) : (project.project_lead ?? null);
  const createdAt = project.created_at ? renderFormattedDate(getDate(project.created_at), "yyyy-MM-dd") : "-";
  const isArchived = Boolean(project.archived_at);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="shrink-0 text-xl font-semibold tracking-tight text-primary">{t("project_overview.title")}</h1>
        <p className="min-w-0 truncate text-13 text-tertiary">
          {project.name} · {project.identifier}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-12 text-tertiary">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium",
            isArchived ? "bg-layer-2 text-secondary" : "bg-success-subtle text-success-primary"
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {isArchived ? t("project_overview.project_status.archived") : t("project_overview.project_status.active")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {t("project_overview.lead")}
          {lead ? (
            <>
              <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size={20} shape="circle" />
              <span className="font-medium text-primary">{lead.display_name ?? lead.email}</span>
            </>
          ) : (
            <span className="text-placeholder">{t("project_overview.lead_unassigned")}</span>
          )}
        </span>
        <span>
          {t("project_overview.created_at")} <span className="tabular-nums text-primary">{createdAt}</span>
        </span>
      </div>
    </div>
  );
});

export const OverviewListView: FC<TPageView> = observer((props) => {
  const { project, workspaceSlug } = props;
  const router = useAppRouter();
  const { t } = useTranslation();
  const {
    project: { getProjectMemberIds },
  } = useMember();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<TProjectAnnouncement | null>(null);
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const [isActivityFullscreenOpen, setIsActivityFullscreenOpen] = useState(false);
  const [isAnnouncementsFullscreenOpen, setIsAnnouncementsFullscreenOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [isHoursChartReady, setIsHoursChartReady] = useState(false);
  const [progressListSection, setProgressListSection] = useState<OverviewProgressSection | null>(null);
  const [workItemListMetric, setWorkItemListMetric] = useState<OverviewWorkItemMetric | null>(null);

  const overview = useProjectOverview(workspaceSlug, project.id);
  const { statistic, isLoading: isStatisticLoading } = useProjectOverviewStatistic(workspaceSlug, project.id);
  const announcements = useProjectAnnouncements(workspaceSlug, project.id);

  const memberCount = getProjectMemberIds(project.id, true)?.length ?? overview.memberStats.length;
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
    // 图表挂载放到弹窗动画后的下一帧，避免首帧按 0 宽度布局
    window.requestAnimationFrame(() => setIsHoursChartReady(true));
  }, []);

  const goToPendingDefects = useCallback(() => {
    router.push(`/${workspaceSlug}/projects/${project.id}/defects?${DEFECT_PRESET_PARAM}=open`);
  }, [project.id, router, workspaceSlug]);

  const createAnnouncementButton = (
    <button
      type="button"
      className={overviewIconButtonClass}
      aria-label={t("project_overview.announcements.create")}
      title={t("project_overview.announcements.create")}
      disabled={!canCreateAnnouncements}
      onClick={() => setIsCreateModalOpen(true)}
    >
      <Plus className="size-3.5" />
    </button>
  );

  return (
    <div className="vertical-scrollbar scrollbar-sm h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-4 px-6 py-5">
        <Reveal>
          <OverviewPageHeader project={project} />
        </Reveal>

        <Reveal delay={60}>
          <OverviewHero
            overview={overview}
            onOverdueClick={() => setWorkItemListMetric("overdue")}
            onDueSoonClick={() => setWorkItemListMetric("due_soon")}
            onPendingDefectsClick={goToPendingDefects}
          >
            <OverviewFactsStrip
              memberCount={memberCount}
              totalHours={overview.totalHours}
              statistic={statistic}
              onMembersClick={() => setIsMembersModalOpen(true)}
              onHoursClick={() => setIsHoursModalOpen(true)}
              onCyclesClick={() => setProgressListSection("cycle")}
              onReleasesClick={() => setProgressListSection("release")}
              onTestPlansClick={() => setProgressListSection("plan")}
              onCaseReviewsClick={() => setProgressListSection("review")}
            />
          </OverviewHero>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Reveal delay={120} className="xl:col-span-8">
            <OverviewProductsCard workspaceSlug={workspaceSlug} projectId={project.id} />
          </Reveal>
          <Reveal delay={160} className="xl:col-span-4">
            <OverviewOngoingCard
              workspaceSlug={workspaceSlug}
              projectId={project.id}
              statistic={statistic}
              isLoading={isStatisticLoading}
              onViewAll={setProgressListSection}
            />
          </Reveal>

          <Reveal delay={200} className="xl:col-span-6">
            <OverviewWorkloadCard
              memberStats={overview.memberStats}
              memberCount={memberCount}
              isLoading={overview.isLoading}
              onViewAll={() => setIsMembersModalOpen(true)}
            />
          </Reveal>
          <Reveal delay={240} className="xl:col-span-6">
            <OverviewDefectsCard overview={overview} onOpenBoard={goToPendingDefects} />
          </Reveal>

          <Reveal delay={280} className="xl:col-span-6">
            <OverviewDescriptionCard
              project={project}
              workspaceSlug={workspaceSlug}
              onExpand={() => setIsDescriptionModalOpen(true)}
            />
          </Reveal>
          <Reveal delay={320} className="xl:col-span-6">
            <OverviewAnnouncementsCard
              announcements={announcements}
              canCreate={canCreateAnnouncements}
              canDelete={canDeleteAnnouncements}
              onCreate={() => setIsCreateModalOpen(true)}
              onOpen={setActiveAnnouncement}
              onFullscreen={() => setIsAnnouncementsFullscreenOpen(true)}
            />
          </Reveal>

          <Reveal delay={360} className="xl:col-span-12">
            <OverviewCard
              title={t("project_overview.activity.title")}
              icon={History}
              action={
                <button
                  type="button"
                  className={overviewIconButtonClass}
                  aria-label={t("project_overview.activity.fullscreen")}
                  title={t("project_overview.activity.fullscreen")}
                  onClick={() => setIsActivityFullscreenOpen(true)}
                >
                  <Maximize2 className="size-3.5" />
                </button>
              }
            >
              <div className="px-4 pb-4">
                <ProjectActivity
                  workspaceSlug={workspaceSlug}
                  projectId={project.id}
                  showHeading={false}
                  containerClassName="max-h-[420px] overflow-y-auto vertical-scrollbar scrollbar-sm"
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
        onSuccess={announcements.refreshFromFirstPage}
      />
      <AnnouncementDetailModal
        isOpen={Boolean(activeAnnouncement)}
        onClose={() => setActiveAnnouncement(null)}
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

      <OverviewFullscreenModal
        open={isActivityFullscreenOpen}
        onClose={() => setIsActivityFullscreenOpen(false)}
        icon={History}
        title={t("project_overview.activity.title")}
        exitLabel={t("project_overview.activity.exit_fullscreen")}
      >
        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          <ProjectActivity
            workspaceSlug={workspaceSlug}
            projectId={project.id}
            showHeading={false}
            containerClassName="min-h-0"
          />
        </div>
      </OverviewFullscreenModal>

      {/* 公告全屏 — zIndex 低于 ModalCore(z-30) 以免遮挡公告详情弹窗 */}
      <OverviewFullscreenModal
        open={isAnnouncementsFullscreenOpen}
        onClose={() => setIsAnnouncementsFullscreenOpen(false)}
        icon={Megaphone}
        title={t("project_overview.announcements.title")}
        headerExtra={createAnnouncementButton}
        exitLabel={t("project_overview.announcements.exit_fullscreen")}
        zIndex={29}
      >
        <OverviewAnnouncementsList
          announcements={announcements}
          canDelete={canDeleteAnnouncements}
          onOpen={setActiveAnnouncement}
          className="px-5 pb-4"
        />
      </OverviewFullscreenModal>

      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <Users className="size-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">{t("project_overview.modals.team_workload")}</span>
            <span className="text-sm text-placeholder">
              {t("project_overview.modals.members_count", { count: memberCount })}
            </span>
          </div>
        }
        open={isMembersModalOpen}
        onCancel={() => setIsMembersModalOpen(false)}
        footer={null}
        centered
        width={2500}
        destroyOnHidden
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

      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <Timer className="size-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">{t("project_overview.modals.member_hours")}</span>
            <span className="text-sm text-placeholder">
              {t("project_overview.modals.hours_total", { hours: overview.totalHours })}
            </span>
          </div>
        }
        open={isHoursModalOpen}
        onCancel={() => setIsHoursModalOpen(false)}
        afterOpenChange={handleHoursModalOpenChange}
        footer={null}
        centered
        width={2500}
        destroyOnHidden
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

      {progressListSection && (
        <OverviewProgressListModal
          open
          onClose={() => setProgressListSection(null)}
          section={progressListSection}
          workspaceSlug={workspaceSlug}
          projectId={project.id}
        />
      )}
      {workItemListMetric && (
        <OverviewWorkItemListModal
          open
          onClose={() => setWorkItemListMetric(null)}
          metric={workItemListMetric}
          workspaceSlug={workspaceSlug}
          projectId={project.id}
        />
      )}
    </div>
  );
});
