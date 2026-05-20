import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal, Pagination } from "antd";
import { BookOpen, History, Maximize2, Megaphone, Plus, Trash2, Users } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { ProjectActivity } from "@/components/project/project-activity";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { ProjectAnnouncementService } from "@/services/project";
import {
  AnnouncementDetailModal,
  CreateAnnouncementModal,
  type TProjectAnnouncement,
} from "./announcement-modals";
import type { IProjectOverviewAnalytics } from "./overview-analytics.types";
import { OverviewDescriptionModal } from "./overview-description-modal";
import { ProjectOverviewKpiCards } from "./overview-kpi-cards";
import { OverviewMemberStats } from "./overview-member-stats";

const announcementService = new ProjectAnnouncementService();

const sectionCard = "rounded-lg border border-subtle bg-surface-1";

type TPageView = {
  children: React.ReactNode;
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
  const [isMembersFullscreenOpen, setIsMembersFullscreenOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<IProjectOverviewAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const { fetchProjectAnalyze } = useProject();

  const projectMemberIds = getProjectMemberIds(project.id, true);

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

  useEffect(() => {
    if (!workspaceSlug || !project?.id) return;

    setIsLoadingAnalytics(true);
    fetchProjectAnalyze(workspaceSlug, project.id)
      .then((response: IProjectOverviewAnalytics) => {
        setAnalyticsData(response);
      })
      .catch((error) => {
        console.error(error);
        setAnalyticsData(null);
      })
      .finally(() => {
        setIsLoadingAnalytics(false);
      });
  }, [workspaceSlug, project?.id, fetchProjectAnalyze]);

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
      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="shrink-0 text-lg font-normal text-primary">项目概览</h1>
          <p className="min-w-0 truncate text-sm text-placeholder">
            {project.name} · {project.identifier}
          </p>
        </div>

        {/* KPI Cards */}
        <ProjectOverviewKpiCards workspaceSlug={workspaceSlug} project={project} analyticsData={analyticsData} />

        {/* Description + Announcements */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col px-4 pt-4 pb-2`}>
              <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-placeholder" />
                  <span className="text-sm font-medium text-primary">项目描述</span>
                  {projectDescriptionEditMeta !== null && (
                    <span className="text-xs text-placeholder">
                      {projectDescriptionEditMeta}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    aria-label="全屏查看项目描述"
                    title="全屏查看"
                    onClick={() => setIsDescriptionModalOpen(true)}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
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
            </div>
          </div>
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col`}>
              <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5 text-placeholder" />
                  <span className="text-sm font-medium text-primary">项目公告</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    aria-label="新增公告"
                    title="新增公告"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    onClick={() => setIsAnnouncementsFullscreenOpen(true)}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {announcementsListBody}
            </div>
          </div>
        </div>

        {/* Project members + Project activity */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col p-4`}>
              <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-placeholder" />
                  <span className="text-sm font-medium text-primary">项目成员</span>
                  {projectMemberIds !== null && (
                    <span className="shrink-0 text-xs text-placeholder">共 {projectMemberIds.length} 人</span>
                  )}
                </div>
                <button
                  type="button"
                  className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                  onClick={() => setIsMembersFullscreenOpen(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <OverviewMemberStats
                  workspaceSlug={workspaceSlug}
                  projectId={project.id}
                  analyticsData={analyticsData}
                  isAnalyticsLoading={isLoadingAnalytics}
                />
              </div>
            </div>
          </div>
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col p-4`}>
              <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-placeholder" />
                  <span className="text-sm font-medium text-primary">项目活动</span>
                </div>
                <button
                  type="button"
                  className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                  onClick={() => setIsActivityModalOpen(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ProjectActivity
                  workspaceSlug={workspaceSlug}
                  projectId={project.id}
                  showHeading={false}
                  containerClassName="h-full overflow-y-auto vertical-scrollbar scrollbar-sm"
                />
              </div>
            </div>
          </div>
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

      {/* 项目成员全屏 */}
      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <Users className="h-4 w-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">项目成员</span>
          </div>
        }
        open={isMembersFullscreenOpen}
        onCancel={() => setIsMembersFullscreenOpen(false)}
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
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
            <OverviewMemberStats
              workspaceSlug={workspaceSlug}
              projectId={project.id}
              analyticsData={analyticsData}
              isAnalyticsLoading={isLoadingAnalytics}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
});
