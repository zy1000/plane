/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { UIEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bug, ChevronRight, ClipboardList } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon } from "@plane/propel/icons";
import type { IProfileMetricWorkItem, IUserProfileData, TProfileMetricKey } from "@plane/types";
import { Card, ECardVariant, Loader } from "@plane/ui";
import { cn, generateWorkItemLink, getDate, renderFormattedDate } from "@plane/utils";
// hooks
import { useProfileAssignedWorkList } from "@/hooks/use-profile-assigned-work-list";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TListVariant = "defects" | "work_items";

/** 距离底部小于该值时预加载下一页 */
const LOAD_MORE_THRESHOLD = 80;

const VARIANT_TO_METRIC: Record<TListVariant, TProfileMetricKey> = {
  defects: "open_defect_issues",
  work_items: "open_assigned_non_defect_issues",
};

function DueDateLabel({ targetDate }: { targetDate: string | null }) {
  const { t } = useTranslation();
  const dueDate = getDate(targetDate);

  if (!dueDate) {
    return <span className="text-placeholder">{t("profile.stats.assigned_lists.unscheduled")}</span>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const formatted = renderFormattedDate(dueDay, "yyyy/MM/dd");

  if (dueDay.getTime() < today.getTime()) {
    return (
      <span className="font-medium text-danger-primary">
        {t("profile.stats.assigned_lists.overdue_prefix")} {formatted}
      </span>
    );
  }
  if (dueDay.getTime() === today.getTime()) {
    return <span className="font-medium text-warning-primary">{t("profile.stats.assigned_lists.due_today")}</span>;
  }
  return <span className="text-secondary">{formatted}</span>;
}

function WorkItemRow({ item, workspaceSlug }: { item: IProfileMetricWorkItem; workspaceSlug: string }) {
  const href = generateWorkItemLink({
    workspaceSlug,
    projectId: item.project.id,
    issueId: item.id,
    projectIdentifier: item.project.identifier,
    sequenceId: item.sequence_id,
  });

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-subtle px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
      >
        <PriorityIcon priority={item.priority} size={14} withContainer />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-13 font-medium text-primary">{item.title}</span>
          <span className="mt-0.5 block truncate text-11 text-placeholder">
            {item.project.identifier}-{item.sequence_id} · {item.project.name}
          </span>
        </span>
        {item.state && (
          <span className="inline-flex max-w-28 shrink-0 items-center gap-1.5 rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.state.color }} />
            <span className="truncate">{item.state.name}</span>
          </span>
        )}
        <span className="w-24 shrink-0 text-right text-11">
          <DueDateLabel targetDate={item.target_date} />
        </span>
      </Link>
    </li>
  );
}

function WorkListCard({
  emptyText,
  excludeHint,
  isLoadingMore,
  items,
  onLoadMore,
  title,
  totalCount,
  userId,
  variant,
  workspaceSlug,
}: {
  emptyText: string;
  excludeHint?: string;
  isLoadingMore: boolean;
  items: IProfileMetricWorkItem[] | undefined;
  onLoadMore: () => void;
  title: string;
  totalCount: number;
  userId: string;
  variant: TListVariant;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const isDefects = variant === "defects";
  const HeaderIcon = isDefects ? Bug : ClipboardList;

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD) onLoadMore();
  };

  return (
    <Card variant={ECardVariant.WITHOUT_SHADOW} className="flex flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-subtle px-5 pt-4 pb-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md",
            isDefects ? "bg-danger-subtle text-danger-primary" : "bg-accent-subtle text-accent-primary"
          )}
        >
          <HeaderIcon className="size-4" />
        </span>
        <h4 className="text-14 font-medium text-primary">{title}</h4>
        {excludeHint && <span className="text-11 text-placeholder">{excludeHint}</span>}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-11 font-semibold tabular-nums",
            isDefects ? "bg-danger-subtle text-danger-primary" : "bg-accent-subtle text-accent-primary"
          )}
        >
          {totalCount}
        </span>
        <Link
          href={`/${workspaceSlug}/profile/${userId}/${variant === "defects" ? "defects" : "work_items"}/`}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-12 font-medium text-accent-primary hover:bg-accent-subtle"
        >
          {t("profile.stats.assigned_lists.view_all")}
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {!items ? (
        <Loader className="h-[260px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      ) : items.length > 0 ? (
        <div
          className="vertical-scrollbar scrollbar-sm max-h-[420px] min-h-0 flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <ul>
            {items.map((item) => (
              <WorkItemRow key={item.id} item={item} workspaceSlug={workspaceSlug} />
            ))}
          </ul>
          {isLoadingMore && (
            <p className="px-5 py-2.5 text-center text-11 text-placeholder">
              {t("profile.stats.assigned_lists.loading_more")}
            </p>
          )}
        </div>
      ) : (
        <div className="grid h-[260px] flex-1 place-items-center px-5">
          <p className="text-12 text-placeholder">{emptyText}</p>
        </div>
      )}
    </Card>
  );
}

export function ProfileAssignedWorkLists({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const { t } = useTranslation();

  const defectList = useProfileAssignedWorkList({
    metric: VARIANT_TO_METRIC.defects,
    userId: userId ? String(userId) : undefined,
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
  });
  const workItemList = useProfileAssignedWorkList({
    metric: VARIANT_TO_METRIC.work_items,
    userId: userId ? String(userId) : undefined,
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
  });

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.assigned_lists.title")}</h3>
        <Loader className="h-[340px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.assigned_lists.title")}</h3>
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
        <WorkListCard
          emptyText={t("profile.stats.assigned_lists.empty_defects")}
          isLoadingMore={defectList.isLoadingMore}
          items={defectList.items}
          onLoadMore={defectList.loadMore}
          title={t("profile.stats.assigned_lists.defects_title")}
          totalCount={defectList.items ? defectList.count : userProfile.open_defect_issues}
          userId={String(userId)}
          variant="defects"
          workspaceSlug={String(workspaceSlug)}
        />
        <WorkListCard
          emptyText={t("profile.stats.assigned_lists.empty_work_items")}
          excludeHint={t("profile.stats.assigned_lists.work_items_exclude_hint")}
          isLoadingMore={workItemList.isLoadingMore}
          items={workItemList.items}
          onLoadMore={workItemList.loadMore}
          title={t("profile.stats.assigned_lists.work_items_title")}
          totalCount={workItemList.items ? workItemList.count : userProfile.open_assigned_non_defect_issues}
          userId={String(userId)}
          variant="work_items"
          workspaceSlug={String(workspaceSlug)}
        />
      </div>
    </div>
  );
}
