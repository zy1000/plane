/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { UIEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, RequirementIcon } from "@plane/propel/icons";
import { REQUIREMENT_STATUSES } from "@plane/types";
import type {
  IProfileMetricRequirement,
  IUserProfileData,
  TProfileMetricKey,
  TRequirementApprovalState,
  TRequirementItemStatus,
} from "@plane/types";
import { Card, ECardVariant, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";
import { FILTER_URL_KEYS } from "@/components/projects/requirements/filters";
import { getRequirementStatusStyle } from "@/components/requirements/requirement-status-cell";
// hooks
import { useProfileAssignedRequirementList } from "@/hooks/use-profile-assigned-work-list";
// local
import { DueDateLabel } from "./due-date-label";
import { ProfileMetricDetailModal } from "./metric-detail-modal";
import { RequirementApprovalPill, RequirementStatusPill } from "./requirement-pills";

type Props = {
  userProfile: IUserProfileData | undefined;
};

/** 距离底部小于该值时预加载下一页 */
const LOAD_MORE_THRESHOLD = 80;
const LIST_METRIC: TProfileMetricKey = "open_assigned_requirements";
/** 「查看全部」跳需求 tab 时预选的状态：与列表的「未闭环」口径一致 */
const OPEN_REQUIREMENT_STATUSES: TRequirementItemStatus[] = ["not_started", "projected", "in_progress"];

/** 评审态汇总成四档展示：删除待审并入评审中 */
const APPROVAL_GROUPS: Array<{ key: TRequirementApprovalState; states: TRequirementApprovalState[] }> = [
  { key: "draft", states: ["draft"] },
  { key: "in_review", states: ["in_review", "pending_deletion"] },
  { key: "modified", states: ["modified"] },
  { key: "approved", states: ["approved"] },
];

function RequirementRow({ item, workspaceSlug }: { item: IProfileMetricRequirement; workspaceSlug: string }) {
  return (
    <li>
      <Link
        href={`/${workspaceSlug}/products/${item.product.id}/requirements/${item.id}`}
        className="flex items-center gap-3 border-b border-subtle px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
      >
        <PriorityIcon priority={item.priority} size={14} withContainer />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-13 font-medium text-primary">{item.title || item.display_id}</span>
          <span className="mt-0.5 block truncate text-11 text-placeholder">
            {item.display_id ?? item.product.identifier} · {item.product.name}
          </span>
        </span>
        <RequirementStatusPill status={item.status} />
        <RequirementApprovalPill state={item.approval_state} />
        <span className="w-24 shrink-0 text-right text-11">
          <DueDateLabel targetDate={item.target_date} />
        </span>
      </Link>
    </li>
  );
}

function RequirementDistribution({
  onSelectMetric,
  userProfile,
}: {
  onSelectMetric: (metric: TProfileMetricKey) => void;
  userProfile: IUserProfileData;
}) {
  const { t } = useTranslation();
  const statusDistribution = userProfile.requirement_status_distribution;
  const approvalDistribution = userProfile.requirement_approval_distribution;
  const total = userProfile.assigned_requirements;
  const completion = userProfile.requirement_issue_completion;
  const effectiveIssues = Math.max(completion.total - completion.cancelled, 0);
  const completionRate =
    effectiveIssues > 0 ? Math.min(Math.round((completion.completed / effectiveIssues) * 100), 100) : null;

  return (
    <section className="p-5 xl:col-span-5 xl:border-r xl:border-subtle">
      <h4 className="text-14 font-medium text-primary">{t("profile.stats.requirements.distribution_title")}</h4>
      <p className="mt-1 text-11 leading-4 text-placeholder">{t("profile.stats.requirements.distribution_subtitle")}</p>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-32 leading-none font-semibold tracking-tight text-primary tabular-nums">
          {userProfile.open_assigned_requirements}
        </span>
        <span className="pb-0.5 text-12 text-placeholder">
          {t("profile.stats.requirements.open_of_total", { total })}
        </span>
      </div>
      <div className="mt-3 flex h-3.5 gap-0.5 overflow-hidden rounded-xs">
        {total > 0 ? (
          REQUIREMENT_STATUSES.map(
            (status) =>
              statusDistribution[status] > 0 && (
                <span
                  key={status}
                  className={cn("h-full", getRequirementStatusStyle(status).dot)}
                  style={{ width: `${(statusDistribution[status] / total) * 100}%` }}
                  title={`${t(`requirement_fields.statuses.${status}`)} ${statusDistribution[status]}`}
                />
              )
          )
        ) : (
          <span className="h-full w-full bg-surface-2" />
        )}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {REQUIREMENT_STATUSES.map((status) => (
          <div key={status} className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-11 text-secondary">
              <span className={cn("size-2 shrink-0 rounded-full", getRequirementStatusStyle(status).dot)} />
              <span className="truncate">{t(`requirement_fields.statuses.${status}`)}</span>
            </p>
            <p className="mt-0.5 text-14 font-semibold text-primary tabular-nums">{statusDistribution[status]}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-subtle pt-4">
        <p className="text-11 text-placeholder">{t("profile.stats.requirements.approval_title")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {APPROVAL_GROUPS.map((group) => {
            const count = group.states.reduce((sum, state) => sum + (approvalDistribution[state] ?? 0), 0);
            return (
              <span
                key={group.key}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded px-2 text-12 font-medium",
                  REQUIREMENT_APPROVAL_PILL[group.key]
                )}
              >
                {t(`requirement_approval.state.${group.key}`)}
                <span className="font-semibold tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-subtle rounded-lg border border-subtle bg-surface-2">
        <button
          type="button"
          onClick={() => onSelectMetric("overdue_requirements")}
          className="focus-visible:ring-accent-primary min-w-0 rounded-l-lg p-3 text-left outline-none transition-colors hover:bg-layer-1 focus-visible:ring-2 focus-visible:ring-inset"
        >
          <p className="truncate text-11 text-placeholder">{t("profile.stats.requirements.overdue")}</p>
          <p
            className={cn(
              "mt-1 text-18 font-semibold tabular-nums",
              userProfile.overdue_requirements > 0 ? "text-danger-primary" : "text-primary"
            )}
          >
            {userProfile.overdue_requirements}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onSelectMetric("unscheduled_requirements")}
          className="focus-visible:ring-accent-primary min-w-0 p-3 text-left outline-none transition-colors hover:bg-layer-1 focus-visible:ring-2 focus-visible:ring-inset"
        >
          <p className="truncate text-11 text-placeholder">{t("profile.stats.requirements.unscheduled")}</p>
          <p className="mt-1 text-18 font-semibold text-primary tabular-nums">{userProfile.unscheduled_requirements}</p>
        </button>
        <div className="min-w-0 p-3">
          <p className="truncate text-11 text-placeholder">{t("profile.stats.requirements.issue_completion")}</p>
          <p className="mt-1 flex items-baseline gap-1.5 text-18 font-semibold text-primary tabular-nums">
            {completionRate === null ? "--" : `${completionRate}%`}
            <span className="text-11 font-normal text-placeholder">
              {completion.completed}/{effectiveIssues}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

export function ProfileRequirementsOverview({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const { t } = useTranslation();
  const [activeMetric, setActiveMetric] = useState<TProfileMetricKey | null>(null);

  const requirementList = useProfileAssignedRequirementList({
    metric: LIST_METRIC,
    userId: userId ? String(userId) : undefined,
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
  });

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.requirements.title")}</h3>
        <Loader className="h-[340px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD) requirementList.loadMore();
  };

  const metricTitles: Partial<Record<TProfileMetricKey, string>> = {
    overdue_requirements: t("profile.stats.requirements.overdue"),
    unscheduled_requirements: t("profile.stats.requirements.unscheduled"),
  };
  const totalCount = requirementList.items ? requirementList.count : userProfile.open_assigned_requirements;

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.requirements.title")}</h3>
      <Card variant={ECardVariant.WITHOUT_SHADOW} className="overflow-hidden p-0">
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <RequirementDistribution userProfile={userProfile} onSelectMetric={setActiveMetric} />

          <section className="flex min-h-0 flex-col border-t border-subtle xl:col-span-7 xl:border-t-0">
            <div className="flex items-center gap-2.5 border-b border-subtle px-5 pt-4 pb-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-primary">
                <RequirementIcon className="size-4" />
              </span>
              <h4 className="text-14 font-medium text-primary">{t("profile.stats.requirements.list_title")}</h4>
              <span className="text-11 text-placeholder">{t("profile.stats.requirements.list_hint")}</span>
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-11 font-semibold text-accent-primary tabular-nums">
                {totalCount}
              </span>
              <Link
                href={`/${workspaceSlug}/profile/${userId}/requirements/?${FILTER_URL_KEYS.status}=${OPEN_REQUIREMENT_STATUSES.join(",")}`}
                className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-12 font-medium text-accent-primary hover:bg-accent-subtle"
              >
                {t("profile.stats.assigned_lists.view_all")}
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            {!requirementList.items ? (
              <Loader className="h-[260px]">
                <Loader.Item width="100%" height="100%" />
              </Loader>
            ) : requirementList.items.length > 0 ? (
              <div
                className="vertical-scrollbar scrollbar-sm max-h-[420px] min-h-0 flex-1 overflow-y-auto"
                onScroll={handleScroll}
              >
                <ul>
                  {requirementList.items.map((item) => (
                    <RequirementRow key={item.id} item={item} workspaceSlug={String(workspaceSlug)} />
                  ))}
                </ul>
                {requirementList.isLoadingMore && (
                  <p className="px-5 py-2.5 text-center text-11 text-placeholder">
                    {t("profile.stats.assigned_lists.loading_more")}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid h-[260px] flex-1 place-items-center px-5">
                <p className="text-12 text-placeholder">{t("profile.stats.requirements.empty")}</p>
              </div>
            )}
          </section>
        </div>
      </Card>
      {activeMetric && (
        <ProfileMetricDetailModal
          metric={activeMetric}
          metricTitle={metricTitles[activeMetric] ?? ""}
          open
          onClose={() => setActiveMetric(null)}
          workspaceSlug={String(workspaceSlug)}
          userId={String(userId)}
        />
      )}
    </div>
  );
}
