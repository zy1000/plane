/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import type { IUserProfileData } from "@plane/types";
import { LinearProgressIndicator, Loader } from "@plane/ui";

type Props = {
  userProfile: IUserProfileData | undefined;
};

export function ProfileWorkProgress({ userProfile }: Props) {
  const { t } = useTranslation();

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <Loader>
          <Loader.Item height="260px" />
        </Loader>
      </div>
    );
  }

  const assignedIssues = userProfile.assigned_issues;
  const completedIssues = userProfile.completed_issues;
  const remainingIssues = Math.max(assignedIssues - completedIssues, 0);
  const completionPercentage =
    assignedIssues === 0 ? 0 : Math.min(Math.round((completedIssues / assignedIssues) * 100), 100);

  const progressData = [
    {
      color: "#16a34a",
      id: "completed",
      name: t("profile.stats.progress.completed"),
      value: completedIssues,
    },
    {
      color: "#e5e7eb",
      id: "remaining",
      name: t("profile.stats.progress.remaining"),
      value: remainingIssues,
    },
  ];

  const summaryItems = [
    {
      label: t("profile.stats.progress.completed"),
      value: completedIssues,
    },
    {
      label: t("profile.stats.progress.pending"),
      value: userProfile.pending_issues,
    },
    {
      label: t("profile.stats.progress.overdue"),
      value: userProfile.overdue_issues,
    },
  ];

  return (
    <section className="flex h-full min-h-[260px] flex-col justify-between gap-8 rounded-2xl border border-subtle bg-surface-1 p-5">
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.progress.title")}</h3>
        <p className="text-13 text-secondary">{t("profile.stats.progress.subtitle")}</p>
      </div>
      <div className="space-y-6">
        <div>
          <div className="flex items-end gap-2">
            <span className="text-40 font-semibold tracking-tight text-primary">{completionPercentage}%</span>
            <span className="pb-2 text-13 text-secondary">
              {completedIssues}/{assignedIssues}
            </span>
          </div>
        </div>
        {assignedIssues > 0 ? (
          <LinearProgressIndicator data={progressData} noTooltip size="lg" barClassName="rounded-xs" />
        ) : (
          <div className="h-3.5 rounded-xs bg-surface-2" />
        )}
      </div>
      <div className="grid grid-cols-3 divide-x divide-subtle rounded-xl border border-subtle bg-surface-2">
        {summaryItems.map((item) => (
          <div key={item.label} className="p-3">
            <p className="text-11 text-placeholder">{item.label}</p>
            <p className="mt-1 text-18 font-semibold text-primary">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
