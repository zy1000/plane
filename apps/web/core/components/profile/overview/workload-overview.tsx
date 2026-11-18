/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { ChevronRight, ClipboardCheck, Rocket } from "lucide-react";
import { useParams } from "next/navigation";
import { useNavigate } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CycleIcon, DueDatePropertyIcon, RequirementIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Card, ECardVariant, LinearProgressIndicator, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useUserWorkSummary } from "@/hooks/use-user-work";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TQueueMetric = {
  icon: ComponentType<{ className?: string }>;
  key: string;
  title: string;
  value: number;
  warn: boolean;
  /** 都跳到待处理页对应的类型 / 范围，和上面今日焦点的卡片一致 */
  href: string;
};

export function ProfileWorkloadOverview({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { summary: workSummary } = useUserWorkSummary(String(workspaceSlug), String(userId));

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.workload_overview.title")}</h3>
        <Loader className="h-[300px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const assignedIssues = userProfile.assigned_issues;
  const completedIssues = userProfile.completed_issues;
  const remainingIssues = Math.max(assignedIssues - completedIssues, 0);
  const completionPercentage =
    assignedIssues > 0 ? Math.min(Math.round((completedIssues / assignedIssues) * 100), 100) : null;

  const completionData = [
    {
      color: "var(--background-color-success-primary)",
      id: "completed",
      name: t("profile.stats.progress.completed"),
      value: completedIssues,
    },
    {
      color: "var(--background-color-surface-2)",
      id: "remaining",
      name: t("profile.stats.progress.remaining"),
      value: remainingIssues,
    },
  ];

  // 待审批 / 待执行用例已并入摘要页「今日焦点」与待处理页；队列里每张卡都直达待处理页的对应类型
  const pendingBase = `/${workspaceSlug}/profile/${userId}/pending`;
  const reviewCount = (workSummary?.pending.by_type.review ?? 0) + (workSummary?.pending.by_type.review_activity ?? 0);
  const queueMetrics: TQueueMetric[] = [
    {
      icon: DueDatePropertyIcon,
      key: "unscheduled_pending_issues",
      title: t("profile.stats.insights.unscheduled"),
      value: userProfile.unscheduled_pending_issues,
      warn: userProfile.unscheduled_pending_issues > 0,
      href: `${pendingBase}?scope=issues&quick=unscheduled`,
    },
    {
      icon: CycleIcon,
      key: "responsible_cycles",
      title: t("profile.stats.responsible_cycles"),
      value: userProfile.responsible_cycles,
      warn: false,
      href: `${pendingBase}?type=cycle`,
    },
    {
      icon: Rocket,
      key: "responsible_releases",
      title: t("profile.stats.responsible_releases"),
      value: userProfile.responsible_releases,
      warn: false,
      href: `${pendingBase}?type=release`,
    },
    {
      icon: RequirementIcon,
      key: "open_assigned_requirements",
      title: t("profile.stats.open_assigned_requirements"),
      value: userProfile.open_assigned_requirements,
      warn: false,
      href: `${pendingBase}?type=requirement`,
    },
    {
      icon: ClipboardCheck,
      key: "stage_reviews",
      title: t("profile.work.summary.reviews_queue"),
      value: reviewCount,
      warn: false,
      href: `${pendingBase}?type=review`,
    },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.workload_overview.title")}</h3>
      <Card variant={ECardVariant.WITHOUT_SHADOW} className="overflow-hidden p-0">
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <section className="p-5 xl:col-span-7 xl:border-r xl:border-subtle">
            <h4 className="text-14 font-medium text-primary">{t("profile.stats.progress.title")}</h4>
            <p className="mt-1 text-11 leading-4 text-placeholder">{t("profile.stats.progress.subtitle")}</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-32 leading-none font-semibold tracking-tight text-primary tabular-nums">
                {completionPercentage === null ? "--" : `${completionPercentage}%`}
              </span>
              <span className="pb-0.5 text-12 text-placeholder">
                {completedIssues}/{assignedIssues}
              </span>
            </div>
            <div className="mt-3">
              {assignedIssues > 0 ? (
                <LinearProgressIndicator data={completionData} noTooltip size="lg" barClassName="rounded-xs" />
              ) : (
                <div className="h-3.5 rounded-xs bg-surface-2" />
              )}
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-subtle rounded-lg border border-subtle bg-surface-2">
              <div className="min-w-0 p-3">
                <p className="truncate text-11 text-placeholder">{t("profile.stats.workload_overview.today_done")}</p>
                <p className="mt-1 text-18 font-semibold text-primary tabular-nums">
                  {userProfile.completed_today_issues}
                </p>
              </div>
              <div className="min-w-0 p-3">
                <p className="truncate text-11 text-placeholder">{t("profile.stats.workload_overview.week_done")}</p>
                <p className="mt-1 text-18 font-semibold text-primary tabular-nums">
                  {userProfile.completed_this_week_issues}
                </p>
              </div>
              <div className="min-w-0 p-3">
                <p className="truncate text-11 text-placeholder">
                  {t("profile.stats.workload_overview.high_priority")}
                </p>
                <p className="mt-1 text-18 font-semibold text-primary tabular-nums">
                  {userProfile.high_priority_pending_issues}
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-subtle p-5 xl:col-span-5 xl:border-t-0">
            <h4 className="text-14 font-medium text-primary">
              {t("profile.stats.overview_sections.queue.title")}
            </h4>
            <p className="mt-1 text-11 leading-4 text-placeholder">
              {t("profile.stats.overview_sections.queue.description")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {queueMetrics.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => navigate(metric.href)}
                  className="focus-visible:ring-accent-primary rounded-md border border-subtle p-3 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-20 leading-none font-semibold tabular-nums",
                        metric.warn ? "text-warning-primary" : "text-primary"
                      )}
                    >
                      {metric.value}
                    </span>
                    <ChevronRight className="size-3.5 text-placeholder" />
                  </div>
                  <p className="mt-2 truncate text-11 text-secondary">{metric.title}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}
