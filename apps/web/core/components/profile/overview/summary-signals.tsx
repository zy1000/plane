/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { InfoIcon } from "@plane/propel/icons";
import { Popover } from "@plane/propel/popover";
import type { IUserProfileData } from "@plane/types";
import { Card, ECardVariant, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type THealthLevel = "excellent" | "healthy" | "watch" | "risk" | "critical";
type TTone = "danger" | "neutral" | "success" | "warning";

type THealthMetric = {
  description: string;
  detail: string;
  icon: LucideIcon;
  title: string;
  tone: TTone;
  value: string;
};

const HEALTH_LEVELS: Record<THealthLevel, { color: string; icon: LucideIcon }> = {
  excellent: { color: "#0d9488", icon: ShieldCheck },
  healthy: { color: "#16a34a", icon: CheckCircle2 },
  watch: { color: "#f59e0b", icon: Activity },
  risk: { color: "#ef4444", icon: AlertTriangle },
  critical: { color: "#dc2626", icon: AlertTriangle },
};

const toneClasses: Record<TTone, { ring: string; text: string }> = {
  danger: { ring: "bg-danger-subtle text-danger-primary", text: "text-danger-primary" },
  neutral: { ring: "bg-surface-2 text-secondary", text: "text-primary" },
  success: { ring: "bg-success-subtle text-success-primary", text: "text-success-primary" },
  warning: { ring: "bg-warning-subtle text-warning-primary", text: "text-warning-primary" },
};

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function HealthGauge({ color, score }: { color: string; score: number }) {
  const { t } = useTranslation();
  const normalizedScore = clamp(score, 0, 100);
  const offset = CIRCUMFERENCE * (1 - normalizedScore / 100);

  return (
    <div className="relative grid size-[132px] shrink-0 place-items-center">
      <svg viewBox="0 0 112 112" className="size-full -rotate-90">
        <circle cx="56" cy="56" r={RADIUS} fill="none" strokeWidth="10" className="stroke-layer-2" />
        <circle
          cx="56"
          cy="56"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="10"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[30px] leading-none font-semibold text-primary tabular-nums">{normalizedScore}</span>
        <span className="mt-1 text-xs text-placeholder">{t("profile.stats.health_check.score_unit")}</span>
      </div>
    </div>
  );
}

function HealthRulesHint() {
  const { t } = useTranslation();

  return (
    <Popover>
      <Popover.Button
        type="button"
        className="inline-flex cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
        aria-label={t("profile.stats.health_check.rules_aria")}
      >
        <InfoIcon className="size-3.5" />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        className="z-50 w-[280px] rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200"
      >
        <p className="text-xs font-medium text-primary">{t("profile.stats.health_check.rules_title")}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-secondary">
          {t("profile.stats.health_check.rules_description")}
        </p>
        <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-secondary">
          <li>{t("profile.stats.health_check.rules.completion")}</li>
          <li>{t("profile.stats.health_check.rules.overdue")}</li>
          <li>{t("profile.stats.health_check.rules.schedule")}</li>
          <li>{t("profile.stats.health_check.rules.pressure")}</li>
        </ul>
      </Popover.Panel>
    </Popover>
  );
}

function resolveMetricTone(value: number, warning: number, danger: number, lowerIsBetter = false): TTone {
  if (lowerIsBetter) {
    if (value >= danger) return "danger";
    if (value >= warning) return "warning";
    return "success";
  }
  if (value <= danger) return "danger";
  if (value <= warning) return "warning";
  return "success";
}

export function ProfileSummarySignals({ userProfile }: Props) {
  const { t } = useTranslation();

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.health_check.title")}</h3>
        <Loader className="h-[220px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const assignedIssues = userProfile.assigned_issues;
  const completedIssues = userProfile.completed_issues;
  const pendingIssues = userProfile.pending_issues;
  const overdueIssues = userProfile.overdue_issues;
  const unscheduledIssues = Math.min(userProfile.unscheduled_pending_issues, pendingIssues);
  const scheduledIssues = Math.max(pendingIssues - unscheduledIssues, 0);
  const highPriorityIssues = userProfile.high_priority_pending_issues;
  const completedThisWeekIssues = userProfile.completed_this_week_issues;

  if (assignedIssues === 0 && pendingIssues === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.health_check.title")}</h3>
        <Card variant={ECardVariant.WITHOUT_SHADOW} className="h-[220px]">
          <EmptyStateCompact
            assetKey="work-item"
            assetClassName="size-20"
            title={t("profile.stats.health_check.no_data_title")}
            description={t("profile.stats.health_check.no_data_description")}
          />
        </Card>
      </div>
    );
  }

  const completionRate = assignedIssues > 0 ? Math.round((completedIssues / assignedIssues) * 100) : 0;
  const overdueRate = pendingIssues > 0 ? Math.round((overdueIssues / pendingIssues) * 100) : 0;
  const scheduleCoverage = pendingIssues > 0 ? Math.round((scheduledIssues / pendingIssues) * 100) : 100;
  const highPriorityRate = pendingIssues > 0 ? Math.round((highPriorityIssues / pendingIssues) * 100) : 0;

  const completionPenalty = assignedIssues > 0 ? Math.min(15, Math.max(0, 60 - completionRate) * 0.4) : 0;
  const overduePenalty = Math.min(35, overdueRate * 0.7);
  const schedulePenalty = Math.min(20, (100 - scheduleCoverage) * 0.25);
  const priorityPenalty = Math.min(20, highPriorityRate * 0.4);
  const weeklyOutputPenalty = pendingIssues > 0 && completedThisWeekIssues === 0 ? 10 : 0;
  const healthScore = clamp(
    Math.round(100 - completionPenalty - overduePenalty - schedulePenalty - priorityPenalty - weeklyOutputPenalty),
    0,
    100
  );

  let healthLevel: THealthLevel = "excellent";
  if (healthScore < 45 || overdueRate >= 35) {
    healthLevel = "critical";
  } else if (healthScore < 60 || overdueRate >= 25) {
    healthLevel = "risk";
  } else if (healthScore < 75 || overdueRate >= 15 || scheduleCoverage < 60) {
    healthLevel = "watch";
  } else if (healthScore < 90 || overdueRate >= 5 || scheduleCoverage < 80) {
    healthLevel = "healthy";
  }

  const health = HEALTH_LEVELS[healthLevel];
  const HealthIcon = health.icon;
  const healthCopy: Record<THealthLevel, { description: string; label: string }> = {
    excellent: {
      description: t("profile.stats.health_check.levels.excellent.description"),
      label: t("profile.stats.health_check.levels.excellent.label"),
    },
    healthy: {
      description: t("profile.stats.health_check.levels.healthy.description"),
      label: t("profile.stats.health_check.levels.healthy.label"),
    },
    watch: {
      description: t("profile.stats.health_check.levels.watch.description"),
      label: t("profile.stats.health_check.levels.watch.label"),
    },
    risk: {
      description: t("profile.stats.health_check.levels.risk.description"),
      label: t("profile.stats.health_check.levels.risk.label"),
    },
    critical: {
      description: t("profile.stats.health_check.levels.critical.description"),
      label: t("profile.stats.health_check.levels.critical.label"),
    },
  };
  const metrics: THealthMetric[] = [
    {
      description: t("profile.stats.health_check.metrics.completion.description"),
      detail: `${completedIssues}/${assignedIssues}`,
      icon: CheckCircle2,
      title: t("profile.stats.health_check.metrics.completion.title"),
      tone: resolveMetricTone(completionRate, 60, 40),
      value: `${completionRate}%`,
    },
    {
      description: t("profile.stats.health_check.metrics.overdue.description"),
      detail: `${overdueIssues}/${pendingIssues}`,
      icon: AlertTriangle,
      title: t("profile.stats.health_check.metrics.overdue.title"),
      tone: resolveMetricTone(overdueRate, 10, 25, true),
      value: `${overdueRate}%`,
    },
    {
      description: t("profile.stats.health_check.metrics.schedule.description"),
      detail: `${scheduledIssues}/${pendingIssues}`,
      icon: CalendarCheck2,
      title: t("profile.stats.health_check.metrics.schedule.title"),
      tone: resolveMetricTone(scheduleCoverage, 60, 40),
      value: `${scheduleCoverage}%`,
    },
    {
      description: t("profile.stats.health_check.metrics.priority.description"),
      detail: `${highPriorityIssues}/${pendingIssues}`,
      icon: TrendingUp,
      title: t("profile.stats.health_check.metrics.priority.title"),
      tone: resolveMetricTone(highPriorityRate, 20, 40, true),
      value: `${highPriorityRate}%`,
    },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.health_check.title")}</h3>
      <Card
        variant={ECardVariant.WITHOUT_SHADOW}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-1 to-layer-1 p-5"
      >
        <div
          className="pointer-events-none absolute -top-16 -right-14 size-48 rounded-full opacity-[0.14] blur-2xl"
          style={{ backgroundColor: health.color }}
        />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-stretch">
          <div className="flex flex-col gap-4 border-b border-dashed border-subtle pb-5 sm:flex-row sm:items-center xl:w-[360px] xl:shrink-0 xl:border-r xl:border-b-0 xl:pr-5 xl:pb-0">
            <HealthGauge color={health.color} score={healthScore} />
            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-placeholder">{t("profile.stats.health_check.score_label")}</span>
                  <HealthRulesHint />
                </div>
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
                  style={{ color: health.color, backgroundColor: `${health.color}1a` }}
                >
                  <HealthIcon className="size-3.5" />
                  {healthCopy[healthLevel].label}
                </span>
              </div>
              <p className="max-w-[220px] text-xs leading-relaxed text-secondary">
                {healthCopy[healthLevel].description}
              </p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.title}
                className="flex min-h-28 flex-col justify-between rounded-lg border border-subtle bg-layer-1 px-3.5 py-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn("grid size-8 shrink-0 place-items-center rounded-md", toneClasses[metric.tone].ring)}
                  >
                    <metric.icon className="size-4" />
                  </div>
                  <span className="text-11 text-placeholder">{metric.detail}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn("text-22 font-semibold tracking-tight tabular-nums", toneClasses[metric.tone].text)}
                    >
                      {metric.value}
                    </span>
                    <span className="truncate text-12 font-medium text-secondary">{metric.title}</span>
                  </div>
                  <p className="line-clamp-2 text-11 leading-4 text-placeholder">{metric.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
