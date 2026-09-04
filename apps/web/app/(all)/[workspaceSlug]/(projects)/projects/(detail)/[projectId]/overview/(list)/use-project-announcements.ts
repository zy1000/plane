import { useCallback, useEffect, useState } from "react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ProjectAnnouncementService } from "@/services/project";
import type { TProjectAnnouncement } from "./announcement-modals";

const announcementService = new ProjectAnnouncementService();

export const ANNOUNCEMENT_PAGE_SIZE = 5;

export type TProjectAnnouncementsData = {
  items: TProjectAnnouncement[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  setPage: (page: number) => void;
  removeAnnouncement: (id: string) => Promise<void>;
  /** 新建成功后回到第一页；已在第一页则原地重拉 */
  refreshFromFirstPage: () => void;
};

/** 概览页公告列表：分页拉取 + 删除；卡片与全屏弹窗共用同一份状态 */
export function useProjectAnnouncements(workspaceSlug: string, projectId: string): TProjectAnnouncementsData {
  const { t } = useTranslation();
  // useTranslation 每次渲染都重新 bind 一个 t，直接放进 deps 会让下面的 effect 无限重拉；
  // 文案字符串按值比较，先算出来再进 deps
  const loadFailedTitle = t("project_overview.announcements.load_failed_title");
  const loadFailedMessage = t("project_overview.announcements.load_failed_message");
  const deleteFailedTitle = t("project_overview.announcements.delete_failed_title");
  const deleteFailedMessage = t("project_overview.announcements.delete_failed_message");
  const permissionErrorTitle = t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title);
  const permissionErrorMessage = PROJECT_ERROR_MESSAGES.permissionError.i18n_message
    ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
    : undefined;
  const [items, setItems] = useState<TProjectAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchAnnouncements = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    try {
      const response = await announcementService.fetchAnnouncements(workspaceSlug, projectId, {
        page,
        page_size: ANNOUNCEMENT_PAGE_SIZE,
      });
      setItems(response?.data ?? []);
      setTotalCount(response?.count ?? 0);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: loadFailedTitle, message: loadFailedMessage });
    } finally {
      setIsLoading(false);
    }
  }, [page, projectId, workspaceSlug, loadFailedTitle, loadFailedMessage]);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  const removeAnnouncement = useCallback(
    async (id: string) => {
      if (!workspaceSlug || !projectId) return;
      try {
        await announcementService.deleteAnnouncements(workspaceSlug, projectId, [id]);
        if (items.length === 1 && page > 1) setPage(page - 1);
        else await fetchAnnouncements();
      } catch (error) {
        if (isProjectPermissionError(error)) {
          setToast({ type: TOAST_TYPE.ERROR, title: permissionErrorTitle, message: permissionErrorMessage });
        } else {
          setToast({ type: TOAST_TYPE.ERROR, title: deleteFailedTitle, message: deleteFailedMessage });
        }
      }
    },
    [
      fetchAnnouncements,
      items.length,
      page,
      projectId,
      workspaceSlug,
      permissionErrorTitle,
      permissionErrorMessage,
      deleteFailedTitle,
      deleteFailedMessage,
    ]
  );

  const refreshFromFirstPage = useCallback(() => {
    if (page !== 1) setPage(1);
    else void fetchAnnouncements();
  }, [fetchAnnouncements, page]);

  return {
    items,
    isLoading,
    page,
    pageSize: ANNOUNCEMENT_PAGE_SIZE,
    totalCount,
    setPage,
    removeAnnouncement,
    refreshFromFirstPage,
  };
}
