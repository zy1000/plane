import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Modal, Pagination } from "antd";
import { BookOpen, Expand, FolderKanban, History, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { ProjectActivity } from "@/components/project/project-activity";
import { useMember } from "@/hooks/store/use-member";
import { ProjectAnnouncementService } from "@/services/project";
import {
  AnnouncementDetailModal,
  CreateAnnouncementModal,
  type TProjectAnnouncement,
} from "./announcement-modals";
import { OverviewDescriptionModal } from "./overview-description-modal";
import { ProjectOverviewKpiCards } from "./overview-kpi-cards";
import { OverviewProgressCard } from "./overview-progress-card";
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
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const { getUserDetails } = useMember();

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

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-normal text-primary">项目概览</h1>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-placeholder">
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            <p>{project.name} · {project.identifier}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <ProjectOverviewKpiCards workspaceSlug={workspaceSlug} project={project} />

        {/* Progress */}
        <OverviewProgressCard workspaceSlug={workspaceSlug} projectId={project.id} />

        {/* Description + Announcements */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col p-4`}>
              <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-placeholder" />
                  <span className="text-sm font-medium text-primary">项目背景</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    onClick={() => {
                      setIsDescriptionEditing(true);
                      setIsDescriptionModalOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    onClick={() => {
                      setIsDescriptionEditing(false);
                      setIsDescriptionModalOpen(true);
                    }}
                  >
                    <Expand className="h-3.5 w-3.5" />
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
                  containerClassName="h-full vertical-scrollbar scrollbar-sm overflow-y-auto"
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
                <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="size-3.5 shrink-0" />
                  新增公告
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                <Table>
                  <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
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
            </div>
          </div>
        </div>

        {/* Project members + Project activity */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className={`${sectionCard} flex h-[380px] flex-col p-4`}>
              <div className="mb-3 flex flex-shrink-0 items-center gap-2">
                <Users className="h-3.5 w-3.5 text-placeholder" />
                <span className="text-sm font-medium text-primary">项目成员</span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm">
                  <OverviewMemberStats workspaceSlug={workspaceSlug} projectId={project.id} />
                </div>
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
                  <Expand className="h-3.5 w-3.5" />
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
        initialEditing={isDescriptionEditing}
      />

      {/* 项目活动 Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-placeholder" />
            <span>项目活动</span>
          </div>
        }
        open={isActivityModalOpen}
        onCancel={() => setIsActivityModalOpen(false)}
        footer={null}
        width={960}
        styles={{ body: { height: 640, padding: 0 } }}
        destroyOnClose
      >
        <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm">
          <ProjectActivity
            workspaceSlug={workspaceSlug}
            projectId={project.id}
            showHeading={false}
            containerClassName="h-full"
          />
        </div>
      </Modal>
    </div>
  );
});
