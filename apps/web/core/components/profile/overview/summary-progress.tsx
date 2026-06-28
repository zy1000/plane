/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import type { IUserProfileData } from "@plane/types";
import { Card, ECardVariant, LinearProgressIndicator, Loader } from "@plane/ui";

type Props = {
  userProfile: IUserProfileData | undefined;
};

export function ProfileSummaryProgress({ userProfile }: Props) {
  const { t } = useTranslation();

  if (!userProfile) {
    return (
      <div className="flex h-full flex-col space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.progress.title")}</h3>
        <Loader className="h-full min-h-[348px]">
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

  const pendingIssues = userProfile.pending_issues;
  const unscheduledIssues = Math.min(userProfile.unscheduled_pending_issues, pendingIssues);
  const scheduledIssues = Math.max(pendingIssues - unscheduledIssues, 0);
  const scheduleCoverage = pendingIssues > 0 ? Math.round((scheduledIssues / pendingIssues) * 100) : null;

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

  const scheduleData = [
    {
      color: "var(--background-color-accent-primary)",
      id: "scheduled",
      name: t("profile.stats.insights.schedule_coverage"),
      value: scheduledIssues,
    },
    {
      color: "var(--background-color-warning-primary)",
      id: "unscheduled",
      name: t("profile.stats.insights.unscheduled"),
      value: unscheduledIssues,
    },
  ];

  const summaryItems = [
    { label: t("profile.stats.progress.completed"), value: completedIssues },
    { label: t("profile.stats.progress.pending"), value: pendingIssues },
    { label: t("profile.stats.progress.overdue"), value: userProfile.overdue_issues },
  ];

  return (
    <div className="flex h-full flex-col space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.progress.title")}</h3>
      <Card variant={ECardVariant.WITHOUT_SHADOW} className="flex min-h-[348px] flex-1 justify-between gap-6">
        <div className="space-y-5">
          <div className="space-y-1">
            <p className="text-13 text-secondary">{t("profile.stats.progress.subtitle")}</p>
            <div className="flex items-end gap-2">
              <span className="text-32 font-semibold tracking-tight text-primary">
                {completionPercentage === null ? "--" : `${completionPercentage}%`}
              </span>
              <span className="pb-1 text-12 text-placeholder">
                {completedIssues}/{assignedIssues}
              </span>
            </div>
          </div>
          {assignedIssues > 0 ? (
            <LinearProgressIndicator data={completionData} noTooltip size="lg" barClassName="rounded-xs" />
          ) : (
            <div className="h-3.5 rounded-xs bg-surface-2" />
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-subtle rounded-lg border border-subtle bg-surface-2">
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0 p-3">
              <p className="truncate text-11 text-placeholder">{item.label}</p>
              <p className="mt-1 text-18 font-semibold text-primary">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-subtle pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-13 font-medium text-secondary">{t("profile.stats.insights.schedule_coverage")}</p>
              <p className="text-11 leading-4 text-placeholder">
                {t("profile.stats.insights.schedule_coverage_description")}
              </p>
            </div>
            <span className="shrink-0 text-20 font-semibold text-primary">
              {scheduleCoverage === null ? "--" : `${scheduleCoverage}%`}
            </span>
          </div>
          {pendingIssues > 0 ? (
            <LinearProgressIndicator data={scheduleData} noTooltip size="md" barClassName="rounded-xs" />
          ) : (
            <div className="h-3 rounded-xs bg-surface-2" />
          )}
        </div>
      </Card>
    </div>
  );
}
