/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, DueDatePropertyIcon, OverdueDatePropertyIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Card, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { getWorkHealth, type TWorkHealthTone } from "./health";
import { WorkHealthRing } from "./health-ring";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TMetricTone = "danger" | "warning" | "success";

type TMetricCard = {
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: TMetricTone;
  title: string;
  value: number | string;
};

const metricToneClasses: Record<TMetricTone, { icon: string; shell: string }> = {
  danger: {
    icon: "bg-danger-subtle text-danger-primary",
    shell: "from-danger-subtle",
  },
  success: {
    icon: "bg-success-subtle text-success-primary",
    shell: "from-success-subtle",
  },
  warning: {
    icon: "bg-warning-subtle text-warning-primary",
    shell: "from-warning-subtle",
  },
};

const healthToneClasses: Record<TWorkHealthTone, string> = {
  accent: "bg-accent-subtle text-accent-primary",
  danger: "bg-danger-subtle text-danger-primary",
  muted: "bg-surface-2 text-secondary",
  success: "bg-success-subtle text-success-primary",
  warning: "bg-warning-subtle text-warning-primary",
};

function MetricCard({ description, icon: Icon, title, tone, value }: TMetricCard) {
  const toneClass = metricToneClasses[tone];

  return (
    <Card className={cn("relative min-h-[164px] overflow-hidden", "bg-gradient-to-br to-transparent", toneClass.shell)}>
      <div className="relative z-1 flex h-full flex-col justify-between gap-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-13 font-medium text-secondary">{title}</p>
            <p className="text-32 font-semibold tracking-tight text-primary">{value}</p>
          </div>
          <div className={cn("grid size-10 shrink-0 place-items-center rounded-lg", toneClass.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
        <p className="text-12 leading-5 text-secondary">{description}</p>
      </div>
      <div className="pointer-events-none absolute -right-10 -bottom-12 size-32 rounded-full bg-surface-1 blur-2xl" />
    </Card>
  );
}

export function ProfileKeyMetrics({ userProfile }: Props) {
  const { t } = useTranslation();
  const health = getWorkHealth(userProfile);

  if (!userProfile) {
    return (
      <Loader className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Loader.Item height="164px" />
        <Loader.Item height="164px" />
        <Loader.Item height="164px" />
      </Loader>
    );
  }

  const metricCards: TMetricCard[] = [
    {
      description: t("profile.stats.today_pending_description"),
      icon: DueDatePropertyIcon,
      tone: userProfile.today_pending_issues > 0 ? "danger" : "success",
      title: t("profile.stats.today_pending"),
      value: userProfile.today_pending_issues,
    },
    {
      description: t("profile.stats.week_pending_description"),
      icon: OverdueDatePropertyIcon,
      tone: userProfile.week_pending_issues > 0 ? "warning" : "success",
      title: t("profile.stats.week_pending"),
      value: userProfile.week_pending_issues,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {metricCards.map((metric) => (
        <MetricCard key={metric.title} {...metric} />
      ))}
      <Card className="relative min-h-[164px] overflow-hidden bg-gradient-to-br from-accent-subtle to-transparent">
        <div className="relative z-1 flex h-full items-center justify-between gap-5">
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <p className="text-13 font-medium text-secondary">{t("profile.stats.health.title")}</p>
              <div className={cn("inline-flex rounded-full px-2 py-0.5 text-11 font-medium", healthToneClasses[health.tone])}>
                {t(`profile.stats.health.levels.${health.level}`)}
              </div>
            </div>
            <p className="text-12 leading-5 text-secondary">{t("profile.stats.health.desc")}</p>
          </div>
          <div className="shrink-0">
            <WorkHealthRing score={health.score} tone={health.tone} />
          </div>
        </div>
        <CheckIcon className="pointer-events-none absolute right-5 bottom-4 size-16 text-accent-primary opacity-10" />
      </Card>
    </div>
  );
}
