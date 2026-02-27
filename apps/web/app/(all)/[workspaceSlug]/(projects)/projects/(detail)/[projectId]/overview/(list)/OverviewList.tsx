import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Modal, Pagination } from "antd";
import { Plus, Trash2 } from "lucide-react";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { ProjectActivity } from "@/components/project/project-activity";
import { ProjectProperties } from "@/components/project/project-properties";
import { WorkItemStats } from "@/components/project/work-item-stats";
import { useMember } from "@/hooks/store/use-member";
import { ProjectAnnouncementService } from "@/services/project";
import {
  AnnouncementDetailModal,
  CreateAnnouncementModal,
  type TProjectAnnouncement,
} from "./announcement-modals";

const announcementService = new ProjectAnnouncementService();

type TPageView = {
  children: React.ReactNode;
  project: IProject;
  workspaceSlug: string;
};

export const OverviewListView: React.FC<TPageView> = observer((props) => {
  const { project, workspaceSlug } = props;
  const [isSubmitting, setIsSubmitting] = useState<TNameDescriptionLoader>("submitted");
  const [announcements, setAnnouncements] = useState<TProjectAnnouncement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<TProjectAnnouncement | null>(null);
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
    } catch (error) {
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
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: "删除公告失败，请稍后重试。",
      });
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
    <div className="w-full p-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
          <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 h-[340px] flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <ProjectProperties workspaceSlug={workspaceSlug} projectId={project.id} />
            </div>
            <div className="mt-4 pt-4 border-t border-custom-border-200 flex-shrink-0">
              <div className="overflow-x-auto">
                <WorkItemStats workspaceSlug={workspaceSlug} projectId={project.id} />
              </div>
            </div>
          </div>

          <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 h-[560px] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-medium text-custom-text-200">项目描述</h4>
              {isSubmitting === "submitting" && <div className="text-xs text-custom-text-400">保存中...</div>}
            </div>
            <div className="flex-1 min-h-0">
              <ProjectDescriptionInput
                workspaceSlug={workspaceSlug}
                projectId={project.id}
                initialValue={project?.description_html}
                setIsSubmitting={setIsSubmitting}
                swrProjectDescription={project?.description_html}
                containerClassName="h-full vertical-scrollbar scrollbar-sm overflow-y-auto"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
                    <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 min-h-[300px] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-medium text-custom-text-200">项目公告</h4>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                新增公告
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2/5 text-left">标题</TableHead>
                    <TableHead className="w-1/5 text-left">创建人</TableHead>
                    <TableHead className="w-1/4 text-left">创建时间</TableHead>
                    <TableHead className="w-16 text-left">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingAnnouncements ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                      </TableCell>
                    </TableRow>
                  ) : announcements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无公告</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    announcements.map((item) => (
                      <TableRow key={item.id} className="hover:bg-[#f7f7f7]">
                        <TableCell
                          className="max-w-[320px] truncate cursor-pointer text-custom-text-200"
                          title={item.name}
                          onClick={() => {
                            setActiveAnnouncement(item);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          {item.name}
                        </TableCell>
                        <TableCell>{creatorLabel(item.created_by)}</TableCell>
                        <TableCell>
                          {item.created_at ? renderFormattedDate(getDate(item.created_at), "yyyy-MM-dd") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="neutral-primary"
                            size="sm"
                            className="p-1 rounded-md border-none !bg-transparent shadow-none hover:!bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteAnnouncement(item.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-custom-text-300" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-custom-text-300">
                  {totalCount > 0
                    ? `第 ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)} 条，共 ${totalCount} 条`
                    : ""}
                </span>
              </div>
              <Pagination
                simple
                current={page}
                pageSize={pageSize}
                total={totalCount}
                showQuickJumper
                onChange={(p) => {
                  setPage(p);
                }}
                size="small"
              />
            </div>
          </div>
          
          <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 h-[560px] flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h4 className="text-lg font-medium text-custom-text-200">活动</h4>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
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
        announcement={activeAnnouncement}
      />
    </div>
  );
});
