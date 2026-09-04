import type { FC } from "react";
import { observer } from "mobx-react";
import { Modal, Pagination } from "antd";
import { Maximize2, Megaphone, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CustomMenu } from "@plane/ui";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import type { TProjectAnnouncement } from "./announcement-modals";
import { OverviewCard, overviewIconButtonClass } from "./overview-card";
import type { TProjectAnnouncementsData } from "./use-project-announcements";

type ListProps = {
  announcements: TProjectAnnouncementsData;
  canDelete: boolean;
  onOpen: (announcement: TProjectAnnouncement) => void;
  /** 卡片内列表贴着卡片边距；全屏弹窗里留更宽的内边距 */
  className?: string;
};

const useCreatorLabel = () => {
  const { getUserDetails } = useMember();
  return (createdBy: TProjectAnnouncement["created_by"]) => {
    if (!createdBy) return "-";
    if (typeof createdBy === "string") {
      const details = getUserDetails(createdBy);
      return details?.display_name || details?.email || createdBy;
    }
    return createdBy.display_name || createdBy.email || createdBy.id || "-";
  };
};

/** 公告列表主体：卡片与全屏弹窗共用 */
export const OverviewAnnouncementsList: FC<ListProps> = observer(({ announcements, canDelete, onOpen, className }) => {
  const { t } = useTranslation();
  const creatorLabel = useCreatorLabel();
  const { items, isLoading, page, pageSize, totalCount, setPage, removeAnnouncement } = announcements;

  const confirmDelete = (id: string) => {
    Modal.confirm({
      title: t("project_overview.announcements.delete_confirm_title"),
      content: t("project_overview.announcements.delete_confirm_description"),
      okText: t("project_overview.announcements.delete"),
      cancelText: t("project_overview.announcements.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        await removeAnnouncement(id);
      },
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          <p className="py-6 text-center text-12 text-placeholder">{t("project_overview.announcements.loading")}</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-12 text-placeholder">{t("project_overview.announcements.empty")}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="group relative border-t border-subtle first:border-t-0">
              <button
                type="button"
                className="flex w-full items-start gap-3 py-2.5 pr-9 text-left transition-colors hover:bg-layer-transparent-hover"
                title={item.name}
                onClick={() => onOpen(item)}
              >
                <span className="w-[72px] flex-shrink-0 pt-0.5 text-11 tabular-nums text-tertiary">
                  {item.created_at ? renderFormattedDate(getDate(item.created_at), "yyyy-MM-dd") : "-"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-medium text-primary">{item.name}</span>
                  <span className="mt-0.5 block truncate text-11 text-tertiary">{creatorLabel(item.created_by)}</span>
                </span>
              </button>
              <div className="absolute top-1/2 right-0 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
                <CustomMenu
                  customButton={
                    <button
                      type="button"
                      className="grid size-7 cursor-pointer place-items-center rounded-md text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                      aria-label={t("project_overview.announcements.actions")}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  }
                  placement="bottom-end"
                  closeOnSelect
                >
                  <CustomMenu.MenuItem
                    className={cn("flex items-center gap-2", canDelete ? "text-danger-primary" : "text-placeholder")}
                    disabled={!canDelete}
                    onClick={() => {
                      if (canDelete) confirmDelete(item.id);
                    }}
                  >
                    <Trash2 className="size-3 flex-shrink-0" />
                    <span>{t("project_overview.announcements.delete")}</span>
                  </CustomMenu.MenuItem>
                </CustomMenu>
              </div>
            </div>
          ))
        )}
      </div>

      {totalCount > pageSize && (
        <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle pt-2">
          <span className="text-11 tabular-nums text-placeholder">
            {t("project_overview.announcements.pagination", {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, totalCount),
              total: totalCount,
            })}
          </span>
          <Pagination simple current={page} pageSize={pageSize} total={totalCount} onChange={setPage} size="small" />
        </div>
      )}
    </div>
  );
});

type CardProps = {
  announcements: TProjectAnnouncementsData;
  canCreate: boolean;
  canDelete: boolean;
  onCreate: () => void;
  onOpen: (announcement: TProjectAnnouncement) => void;
  onFullscreen: () => void;
};

/** 概览「项目公告」卡 */
export const OverviewAnnouncementsCard: FC<CardProps> = observer(
  ({ announcements, canCreate, canDelete, onCreate, onOpen, onFullscreen }) => {
    const { t } = useTranslation();
    return (
      <OverviewCard
        title={t("project_overview.announcements.title")}
        icon={Megaphone}
        meta={announcements.totalCount > 0 ? String(announcements.totalCount) : undefined}
        action={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-12 font-medium text-accent-primary transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-placeholder"
              disabled={!canCreate}
              onClick={onCreate}
            >
              <Plus className="size-3.5" />
              {t("project_overview.announcements.create")}
            </button>
            <button
              type="button"
              className={overviewIconButtonClass}
              aria-label={t("project_overview.announcements.fullscreen")}
              title={t("project_overview.announcements.fullscreen")}
              onClick={onFullscreen}
            >
              <Maximize2 className="size-3.5" />
            </button>
          </>
        }
        className="h-full"
        bodyClassName="flex flex-col"
      >
        <OverviewAnnouncementsList
          announcements={announcements}
          canDelete={canDelete}
          onOpen={onOpen}
          className="px-4 pb-4"
        />
      </OverviewCard>
    );
  }
);
