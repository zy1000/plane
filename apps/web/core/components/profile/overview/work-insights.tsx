/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import {
  CheckIcon,
  CreateIcon,
  DueDatePropertyIcon,
  LayerStackIcon,
  OverdueDatePropertyIcon,
  UserCirclePropertyIcon,
} from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  userProfile: IUserProfileData | undefined;
};

export type TInsightTone = "accent" | "danger" | "success" | "warning" | "muted";

export type TInsightItem = {
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: TInsightTone;
  title: string;
  value: number | string;
};

const toneClasses: Record<TInsightTone, string> = {
  accent: "bg-accent-subtle text-accent-primary",
  danger: "bg-danger-subtle text-danger-primary",
  muted: "bg-surface-2 text-secondary",
  success: "bg-success-subtle text-success-primary",
  warning: "bg-warning-subtle text-warning-primary",
};

export function InsightPill({ description, icon: Icon, title, tone, value }: TInsightItem) {
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 transition-colors hover:bg-surface-2">
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-md", toneClasses[tone])}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-18 font-semibold tracking-tight text-primary">{value}</span>
          <span className="truncate text-12 font-medium text-secondary">{title}</span>
        </div>
        <p className="truncate text-11 text-placeholder">{description}</p>
      </div>
    </div>
  );
}

export const getProfileWorkInsights = (
  userProfile: IUserProfileData,
  t: (key: string) => string
): TInsightItem[] => {
  const scheduledPendingIssues = Math.max(userProfile.pending_issues - userProfile.unscheduled_pending_issues, 0);
  const scheduleCoverage =
    userProfile.pending_issues === 0 ? "--" : `${Math.round((scheduledPendingIssues / userProfile.pending_issues) * 100)}%`;

  return [
    {
      description: t("profile.stats.insights.overdue_description"),
      icon: OverdueDatePropertyIcon,
      title: t("profile.stats.insights.overdue"),
      tone: userProfile.overdue_issues > 0 ? "danger" : "success",
      value: userProfile.overdue_issues,
    },
    {
      description: t("profile.stats.insights.high_priority_description"),
      icon: LayerStackIcon,
      title: t("profile.stats.insights.high_priority"),
      tone: userProfile.high_priority_pending_issues > 0 ? "warning" : "success",
      value: userProfile.high_priority_pending_issues,
    },
    {
      description: t("profile.stats.insights.completed_today_description"),
      icon: CheckIcon,
      title: t("profile.stats.insights.completed_today"),
      tone: userProfile.completed_today_issues > 0 ? "success" : "muted",
      value: userProfile.completed_today_issues,
    },
    {
      description: t("profile.stats.insights.completed_this_week_description"),
      icon: CreateIcon,
      title: t("profile.stats.insights.completed_this_week"),
      tone: userProfile.completed_this_week_issues > 0 ? "success" : "muted",
      value: userProfile.completed_this_week_issues,
    },
    {
      description: t("profile.stats.insights.unscheduled_description"),
      icon: DueDatePropertyIcon,
      title: t("profile.stats.insights.unscheduled"),
      tone: userProfile.unscheduled_pending_issues > 0 ? "warning" : "success",
      value: userProfile.unscheduled_pending_issues,
    },
    {
      description: t("profile.stats.insights.schedule_coverage_description"),
      icon: UserCirclePropertyIcon,
      title: t("profile.stats.insights.schedule_coverage"),
      tone: scheduleCoverage === "--" ? "muted" : "accent",
      value: scheduleCoverage,
    },
  ];
};

export function ProfileWorkInsights({ userProfile }: Props) {
  const { t } = useTranslation();

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.insights.title")}</h3>
        <Loader className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Loader.Item height="58px" />
          <Loader.Item height="58px" />
          <Loader.Item height="58px" />
          <Loader.Item height="58px" />
          <Loader.Item height="58px" />
          <Loader.Item height="58px" />
        </Loader>
      </div>
    );
  }

  const insightCards = getProfileWorkInsights(userProfile, t);

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.insights.title")}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insightCards.map((card) => (
          <InsightPill key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
