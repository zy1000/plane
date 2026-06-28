/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, CreateIcon, DueDatePropertyIcon, PriorityPropertyIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Card, ECardDirection, ECardSpacing, ECardVariant, Loader } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TSignal = {
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  tone: "neutral" | "success" | "warning";
  value: number;
};

const toneClasses: Record<TSignal["tone"], string> = {
  neutral: "bg-surface-2 text-secondary",
  success: "bg-success-subtle text-success-primary",
  warning: "bg-warning-subtle text-warning-primary",
};

export function ProfileSummarySignals({ userProfile }: Props) {
  const { t } = useTranslation();

  const signals: TSignal[] = userProfile
    ? [
        {
          description: t("profile.stats.insights.high_priority_description"),
          icon: PriorityPropertyIcon,
          title: t("profile.stats.insights.high_priority"),
          tone: userProfile.high_priority_pending_issues > 0 ? "warning" : "neutral",
          value: userProfile.high_priority_pending_issues,
        },
        {
          description: t("profile.stats.insights.completed_today_description"),
          icon: CheckIcon,
          title: t("profile.stats.insights.completed_today"),
          tone: userProfile.completed_today_issues > 0 ? "success" : "neutral",
          value: userProfile.completed_today_issues,
        },
        {
          description: t("profile.stats.insights.completed_this_week_description"),
          icon: CreateIcon,
          title: t("profile.stats.insights.completed_this_week"),
          tone: userProfile.completed_this_week_issues > 0 ? "success" : "neutral",
          value: userProfile.completed_this_week_issues,
        },
        {
          description: t("profile.stats.insights.unscheduled_description"),
          icon: DueDatePropertyIcon,
          title: t("profile.stats.insights.unscheduled"),
          tone: userProfile.unscheduled_pending_issues > 0 ? "warning" : "neutral",
          value: userProfile.unscheduled_pending_issues,
        },
      ]
    : [];

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.insights.title")}</h3>
      {userProfile ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {signals.map((signal) => (
            <Card
              key={signal.title}
              direction={ECardDirection.ROW}
              spacing={ECardSpacing.SM}
              variant={ECardVariant.WITHOUT_SHADOW}
              className="h-full min-h-28 items-start"
            >
              <div className={cn("grid size-9 shrink-0 place-items-center rounded-md", toneClasses[signal.tone])}>
                <signal.icon className="size-4" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-24 font-semibold tracking-tight text-primary">{signal.value}</span>
                  <span className="truncate text-12 font-medium text-secondary">{signal.title}</span>
                </div>
                <p className="text-11 leading-4 text-placeholder">{signal.description}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Loader className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Loader.Item height="112px" />
          <Loader.Item height="112px" />
          <Loader.Item height="112px" />
          <Loader.Item height="112px" />
        </Loader>
      )}
    </div>
  );
}
