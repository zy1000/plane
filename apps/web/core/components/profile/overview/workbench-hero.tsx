/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { getWorkHealth, type TWorkHealthTone } from "./health";
import { WorkHealthRing } from "./health-ring";
import { getProfileWorkInsights, InsightPill } from "./work-insights";

type Props = {
  description: string;
  greeting: string;
  title: string;
  userProfile: IUserProfileData | undefined;
};

const healthToneClasses: Record<TWorkHealthTone, string> = {
  accent: "bg-accent-subtle text-accent-primary",
  danger: "bg-danger-subtle text-danger-primary",
  muted: "bg-surface-2 text-secondary",
  success: "bg-success-subtle text-success-primary",
  warning: "bg-warning-subtle text-warning-primary",
};

export function ProfileWorkbenchHero({ description, greeting, title, userProfile }: Props) {
  const { t } = useTranslation();

  if (!userProfile) {
    return (
      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface-1 p-6">
        <Loader className="space-y-5">
          <Loader.Item height="32px" />
          <Loader.Item height="154px" />
          <Loader.Item height="58px" />
        </Loader>
      </section>
    );
  }

  const health = getWorkHealth(userProfile);
  const insightItems = getProfileWorkInsights(userProfile, t).slice(0, 4);

  const dueItems = [
    {
      label: t("profile.stats.today_pending"),
      value: userProfile.today_pending_issues,
      description: t("profile.stats.workbench.today_due_hint"),
    },
    {
      label: t("profile.stats.week_pending"),
      value: userProfile.week_pending_issues,
      description: t("profile.stats.workbench.week_due_hint"),
    },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2">
      <div className="pointer-events-none absolute -top-24 right-10 size-64 rounded-full bg-accent-subtle blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-success-subtle blur-3xl" />

      <div className="relative z-1 grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col justify-between gap-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-13 font-medium text-accent-primary">{greeting}</p>
            <div className="space-y-2">
              <h2 className="text-28 font-semibold tracking-tight text-primary">{title}</h2>
              <p className="text-13 leading-5 text-secondary">{description}</p>
            </div>
          </div>

          <div className="grid max-w-3xl grid-cols-1 overflow-hidden rounded-xl border border-subtle bg-surface-1 md:grid-cols-2">
            {dueItems.map((item, index) => (
              <div key={item.label} className={cn("p-5", index > 0 && "border-t border-subtle md:border-t-0 md:border-l")}>
                <p className="text-12 font-medium text-secondary">{item.label}</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-40 font-semibold leading-none tracking-tight text-primary">{item.value}</span>
                  <span className="pb-1 text-12 text-placeholder">{t("profile.stats.workbench.items")}</span>
                </div>
                <p className="mt-3 text-12 leading-5 text-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface-1 p-5 shadow-sm">
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-12 font-medium text-secondary">{t("profile.stats.health.title")}</p>
                <div
                  className={cn("inline-flex rounded-full px-2 py-0.5 text-11 font-medium", healthToneClasses[health.tone])}
                >
                  {t(`profile.stats.health.levels.${health.level}`)}
                </div>
              </div>
              <WorkHealthRing score={health.score} tone={health.tone} />
            </div>
            <div className="space-y-2">
              <p className="text-20 font-semibold text-primary">{t("profile.stats.workbench.health_headline")}</p>
              <p className="text-12 leading-5 text-secondary">{t("profile.stats.workbench.health_description")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-1 border-t border-subtle bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-12 font-medium text-secondary">{t("profile.stats.workbench.focus_strip")}</p>
          <p className="hidden text-11 text-placeholder sm:block">{t("profile.stats.workbench.focus_strip_hint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {insightItems.map((item) => (
            <InsightPill key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}
