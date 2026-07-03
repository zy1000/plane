/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ChevronRight, ClipboardCheck, Rocket } from "lucide-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import {
  UserCirclePropertyIcon,
  CreateIcon,
  CycleIcon,
  DueDatePropertyIcon,
  LayerStackIcon,
  OverdueDatePropertyIcon,
  TestManagementIcon,
  WorkflowsPropertyIcon,
} from "@plane/propel/icons";
import type { IUserProfileData, TProfileMetricKey } from "@plane/types";
import { Card, ECardVariant, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { ProfileMetricDetailModal } from "./metric-detail-modal";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TTone = "accent" | "danger" | "neutral" | "warning";

type TOverviewMetric = {
  description?: string;
  icon: ComponentType<{ className?: string }>;
  key: TProfileMetricKey;
  title: string;
  tone: TTone;
  value: number;
};

const toneClasses: Record<TTone, { badge: string; icon: string; value: string }> = {
  accent: {
    badge: "bg-accent-subtle text-accent-primary",
    icon: "bg-accent-subtle text-accent-primary",
    value: "text-accent-primary",
  },
  danger: {
    badge: "bg-danger-subtle text-danger-primary",
    icon: "bg-danger-subtle text-danger-primary",
    value: "text-danger-primary",
  },
  neutral: {
    badge: "bg-surface-2 text-primary",
    icon: "bg-surface-2 text-secondary",
    value: "text-primary",
  },
  warning: {
    badge: "bg-warning-subtle text-warning-primary",
    icon: "bg-warning-subtle text-warning-primary",
    value: "text-warning-primary",
  },
};

function MetricContainer({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-visible:ring-accent-primary w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </button>
  );
}

function MetricIcon({ metric, className }: { metric: TOverviewMetric; className?: string }) {
  const Icon = metric.icon;

  return (
    <span
      className={cn("grid size-9 shrink-0 place-items-center rounded-md", toneClasses[metric.tone].icon, className)}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function ProfileStats({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const { t } = useTranslation();
  const [activeMetric, setActiveMetric] = useState<TProfileMetricKey | null>(null);

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.overview")}</h3>
        <Loader className="h-[420px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const deadlineMetrics: TOverviewMetric[] = [
    {
      description: t("profile.stats.today_pending_description"),
      icon: DueDatePropertyIcon,
      key: "today_pending_issues",
      title: t("profile.stats.today_pending"),
      tone: userProfile.today_pending_issues > 0 ? "danger" : "neutral",
      value: userProfile.today_pending_issues,
    },
    {
      description: t("profile.stats.week_pending_description"),
      icon: DueDatePropertyIcon,
      key: "week_pending_issues",
      title: t("profile.stats.week_pending"),
      tone: userProfile.week_pending_issues > 0 ? "warning" : "neutral",
      value: userProfile.week_pending_issues,
    },
    {
      description: t("profile.stats.overdue_description"),
      icon: OverdueDatePropertyIcon,
      key: "overdue_issues",
      title: t("profile.stats.overdue"),
      tone: userProfile.overdue_issues > 0 ? "danger" : "neutral",
      value: userProfile.overdue_issues,
    },
  ];

  const queueMetrics: TOverviewMetric[] = [
    {
      icon: DueDatePropertyIcon,
      key: "unscheduled_pending_issues",
      title: t("profile.stats.insights.unscheduled"),
      tone: userProfile.unscheduled_pending_issues > 0 ? "warning" : "neutral",
      value: userProfile.unscheduled_pending_issues,
    },
    {
      icon: WorkflowsPropertyIcon,
      key: "pending_approval_issues",
      title: t("profile.stats.pending_approval"),
      tone: userProfile.pending_approval_issues > 0 ? "warning" : "neutral",
      value: userProfile.pending_approval_issues,
    },
    {
      icon: TestManagementIcon,
      key: "pending_execution_cases",
      title: t("profile.stats.pending_execution_cases"),
      tone: userProfile.pending_execution_cases > 0 ? "warning" : "neutral",
      value: userProfile.pending_execution_cases,
    },
    {
      icon: ClipboardCheck,
      key: "pending_review_cases",
      title: t("profile.stats.pending_review_cases"),
      tone: userProfile.pending_review_cases > 0 ? "warning" : "neutral",
      value: userProfile.pending_review_cases,
    },
  ];

  const responsibilityMetrics: TOverviewMetric[] = [
    {
      icon: CycleIcon,
      key: "responsible_cycles",
      title: t("profile.stats.responsible_cycles"),
      tone: "neutral",
      value: userProfile.responsible_cycles,
    },
    {
      icon: Rocket,
      key: "responsible_releases",
      title: t("profile.stats.responsible_releases"),
      tone: "neutral",
      value: userProfile.responsible_releases,
    },
  ];

  const coverageMetrics: TOverviewMetric[] = [
    {
      icon: UserCirclePropertyIcon,
      key: "open_assigned_issues",
      title: t("profile.stats.assigned"),
      tone: "accent",
      value: userProfile.open_assigned_issues,
    },
    {
      icon: CreateIcon,
      key: "open_created_issues",
      title: t("profile.stats.created"),
      tone: "neutral",
      value: userProfile.open_created_issues,
    },
    {
      icon: LayerStackIcon,
      key: "open_subscribed_issues",
      title: t("profile.stats.subscribed"),
      tone: "neutral",
      value: userProfile.open_subscribed_issues,
    },
  ];

  const activeMetricTitle = [...deadlineMetrics, ...queueMetrics, ...responsibilityMetrics, ...coverageMetrics].find(
    (metric) => metric.key === activeMetric
  )?.title;

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.overview")}</h3>
      <Card variant={ECardVariant.WITHOUT_SHADOW} className="overflow-hidden p-0">
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <section className="p-5 xl:col-span-7 xl:border-r xl:border-strong">
            <div>
              <h4 className="text-14 font-medium text-primary">
                {t("profile.stats.overview_sections.deadlines.title")}
              </h4>
            </div>
            <div className="mt-5 grid grid-cols-1 divide-y divide-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {deadlineMetrics.map((metric) => (
                <MetricContainer
                  key={metric.title}
                  onClick={() => setActiveMetric(metric.key)}
                  className="min-w-0 px-0 py-4 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MetricIcon metric={metric} />
                    <span className="min-w-0 truncate text-12 font-medium text-secondary">{metric.title}</span>
                    <ChevronRight className="ml-auto size-3.5 shrink-0 text-secondary" />
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <span
                      className={cn("text-28 leading-none font-semibold tabular-nums", toneClasses[metric.tone].value)}
                    >
                      {metric.value}
                    </span>
                    <span className="pb-0.5 text-11 text-secondary">{t("profile.stats.workbench.items")}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-8 text-11 leading-4 text-secondary">{metric.description}</p>
                </MetricContainer>
              ))}
            </div>
          </section>

          <section className="border-t border-strong p-5 xl:col-span-5 xl:border-t-0">
            <div>
              <h4 className="text-14 font-medium text-primary">{t("profile.stats.overview_sections.queue.title")}</h4>
            </div>
            <div className="mt-4 divide-y divide-subtle">
              {queueMetrics.map((metric) => (
                <MetricContainer
                  key={metric.title}
                  onClick={() => setActiveMetric(metric.key)}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <MetricIcon metric={metric} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-12 font-medium text-primary">{metric.title}</p>
                  </div>
                  <span
                    className={cn(
                      "min-w-10 shrink-0 rounded-md px-2 py-1 text-center text-16 font-semibold tabular-nums",
                      toneClasses[metric.tone].badge
                    )}
                  >
                    {metric.value}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-secondary" />
                </MetricContainer>
              ))}
            </div>
          </section>

          <section className="border-t border-strong p-5 xl:col-span-5 xl:border-r">
            <div>
              <h4 className="text-14 font-medium text-primary">
                {t("profile.stats.overview_sections.responsibility.title")}
              </h4>
              <p className="mt-1 text-11 leading-4 text-secondary">
                {t("profile.stats.overview_sections.responsibility.description")}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 divide-y divide-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {responsibilityMetrics.map((metric) => (
                <MetricContainer
                  key={metric.title}
                  onClick={() => setActiveMetric(metric.key)}
                  className="min-w-0 py-4 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <MetricIcon metric={metric} className="size-10" />
                    <span className="flex items-center gap-2">
                      <span className="text-24 leading-none font-semibold text-primary tabular-nums">
                        {metric.value}
                      </span>
                      <ChevronRight className="size-3.5 text-secondary" />
                    </span>
                  </div>
                  <p className="mt-3 text-12 font-medium text-primary">{metric.title}</p>
                </MetricContainer>
              ))}
            </div>
          </section>

          <section className="border-t border-subtle p-5 xl:col-span-7">
            <div>
              <h4 className="text-14 font-medium text-primary">
                {t("profile.stats.overview_sections.coverage.title")}
              </h4>
              <p className="mt-1 text-11 leading-4 text-secondary">
                {t("profile.stats.overview_sections.coverage.description")}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 divide-y divide-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {coverageMetrics.map((metric) => (
                <MetricContainer
                  key={metric.title}
                  onClick={() => setActiveMetric(metric.key)}
                  className="min-w-0 py-4 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MetricIcon metric={metric} />
                    <span className="truncate text-12 font-medium text-secondary">{metric.title}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={cn("text-24 font-semibold tabular-nums", toneClasses[metric.tone].value)}>
                      {metric.value}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-secondary" />
                  </div>
                </MetricContainer>
              ))}
            </div>
          </section>
        </div>
      </Card>
      {activeMetric && activeMetricTitle && (
        <ProfileMetricDetailModal
          metric={activeMetric}
          metricTitle={activeMetricTitle}
          open
          onClose={() => setActiveMetric(null)}
          workspaceSlug={String(workspaceSlug)}
          userId={String(userId)}
        />
      )}
    </div>
  );
}
