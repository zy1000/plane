import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { InfoIcon } from "@plane/propel/icons";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
import type { IOverviewTrendPoint } from "./overview-analytics.types";
import type { THealthLevel, TProjectOverviewData } from "./use-project-overview";

type Props = {
  overview: TProjectOverviewData;
  onOverdueClick?: () => void;
  onDueSoonClick?: () => void;
  onPendingDefectsClick?: () => void;
  /** Hero 底部的事实条 */
  children?: ReactNode;
};

/** 数字 count-up 动画（easeOutCubic） */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}

const RADIUS = 47;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RadialGauge: FC<{ value: number; color: string }> = ({ value, color }) => {
  const { t } = useTranslation();
  const animated = useCountUp(value);
  const offset = CIRCUMFERENCE * (1 - Math.min(Math.max(value, 0), 100) / 100);

  return (
    <div className="relative grid size-[112px] flex-shrink-0 place-items-center">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx="56" cy="56" r={RADIUS} fill="none" strokeWidth="10" className="stroke-layer-2" />
        <circle
          cx="56"
          cy="56"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[26px] leading-none font-bold tabular-nums text-primary">{animated}%</span>
        <span className="mt-1 text-11 text-tertiary">{t("project_overview.hero.completion")}</span>
      </div>
    </div>
  );
};

const HEALTH_LEVELS: THealthLevel[] = ["healthy", "watch", "risk"];
const HEALTH_DOT_CLASS: Record<THealthLevel, string> = {
  healthy: "bg-success-primary",
  watch: "bg-warning-primary",
  risk: "bg-danger-primary",
};

const HealthRulesHint: FC = () => {
  const { t } = useTranslation();
  return (
    <Popover>
      <Popover.Button
        type="button"
        className="inline-flex cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
        aria-label={t("project_overview.hero.rules_aria")}
      >
        <InfoIcon className="size-3.5" />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        className="z-50 w-[260px] rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200"
      >
        <p className="text-12 font-medium text-primary">{t("project_overview.hero.rules_title")}</p>
        <p className="mt-1.5 text-12 leading-relaxed text-secondary">{t("project_overview.hero.rules_description")}</p>
        <div className="mt-2 space-y-1 text-12 leading-relaxed text-secondary">
          <p>{t("project_overview.hero.rules_completion")}</p>
          <p>{t("project_overview.hero.rules_overdue")}</p>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {HEALTH_LEVELS.map((level) => (
            <li key={level} className="flex items-start gap-1.5 text-12 leading-relaxed">
              <span className={cn("mt-1.5 size-1.5 flex-shrink-0 rounded-full", HEALTH_DOT_CLASS[level])} />
              <span className="text-secondary">
                <span className="font-medium text-primary">{t(`project_overview.hero.levels.${level}.label`)}</span>
                <span className="text-placeholder"> — </span>
                {t(`project_overview.hero.levels.${level}.rule`)}
              </span>
            </li>
          ))}
        </ul>
      </Popover.Panel>
    </Popover>
  );
};

/** 近 6 月完成数的小柱迹：只做趋势提示，不承担读数 */
const CompletedSparkline: FC<{ trend: IOverviewTrendPoint[] }> = ({ trend }) => {
  const { t } = useTranslation();
  if (trend.length === 0) return null;
  const max = Math.max(1, ...trend.map((point) => point.completed));
  const slotWidth = 50;
  const barWidth = 40;
  const height = 34;
  const recent = trend.slice(-3);

  return (
    <div className="mt-4 flex items-center gap-3.5 border-t border-dashed border-subtle pt-3.5">
      <span className="whitespace-nowrap text-12 text-tertiary">{t("project_overview.hero.recent_completed")}</span>
      <svg viewBox={`0 0 ${trend.length * slotWidth} ${height}`} preserveAspectRatio="none" className="h-8 min-w-0 flex-1">
        {trend.map((point, index) => {
          const barHeight = Math.max(3, (point.completed / max) * (height - 2));
          return (
            <rect
              key={point.month}
              x={index * slotWidth + (slotWidth - barWidth) / 2}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx="1.5"
              fill="var(--bg-success-primary)"
              opacity="0.85"
            >
              <title>{`${point.month} · ${point.completed}`}</title>
            </rect>
          );
        })}
      </svg>
      <span className="whitespace-nowrap text-12 tabular-nums text-secondary">
        {recent.map((point, index) => (
          <span key={point.month}>
            {index > 0 && <span className="text-placeholder"> · </span>}
            {t("project_overview.hero.month_label", { month: Number(point.month.slice(5)) })}{" "}
            <span className="font-semibold text-primary">{point.completed}</span>
          </span>
        ))}
      </span>
    </div>
  );
};

const StateDistribution: FC<{ overview: TProjectOverviewData }> = ({ overview }) => {
  const { t } = useTranslation();
  const { counts, distribution, trend } = overview;
  const effectiveTotal = Math.max(counts.total - counts.cancelled, 0);
  const denominator = Math.max(effectiveTotal, 1);
  const barSlices = distribution.filter((slice) => slice.key !== "cancelled" && slice.value > 0);

  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 text-12 text-tertiary">
        <span>{t("project_overview.hero.distribution")}</span>
        <span className="font-medium tabular-nums text-primary">
          {t("project_overview.hero.distribution_meta", { total: effectiveTotal })}
        </span>
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-md bg-layer-2">
        {barSlices.map((slice) => (
          <div
            key={slice.key}
            title={`${slice.label} ${slice.value}`}
            style={{ width: `${(slice.value / denominator) * 100}%`, backgroundColor: slice.color }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-12 text-secondary">
        {distribution.map((slice) => (
          <span key={slice.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ backgroundColor: slice.color }} />
            {slice.label} <span className="font-semibold tabular-nums text-primary">{slice.value}</span>
          </span>
        ))}
      </div>
      <CompletedSparkline trend={trend} />
    </div>
  );
};

type TRiskTone = "danger" | "warning" | "neutral";

const RISK_VALUE_CLASS: Record<TRiskTone, string> = {
  danger: "text-danger-primary",
  warning: "text-warning-primary",
  neutral: "text-tertiary",
};

const RiskTile: FC<{ value: number; label: string; action: string; tone: TRiskTone; onClick?: () => void }> = ({
  value,
  label,
  action,
  tone,
  onClick,
}) => {
  const animated = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex min-h-[112px] flex-col gap-1 rounded-xl border border-subtle bg-surface-1 px-3.5 py-3 text-left transition-colors hover:bg-layer-1-hover disabled:cursor-default disabled:hover:bg-surface-1"
      // 在 srgb 里混色：oklch 的色相插值会把红 + 灰混成紫
      style={
        tone === "danger"
          ? { borderColor: "color-mix(in srgb, var(--border-danger-strong) 35%, var(--border-subtle))" }
          : undefined
      }
    >
      {/* 字号不走 cn：tailwind-merge 会把任意值字号 text-[26px] 与自定义文字色当同组互斥 */}
      <span className={`text-[26px] leading-none font-bold tabular-nums ${RISK_VALUE_CLASS[tone]}`}>{animated}</span>
      <span className="text-12 text-tertiary">{label}</span>
      {onClick && <span className="mt-auto text-12 font-medium text-accent-primary">{action} →</span>}
    </button>
  );
};

export const OverviewHero: FC<Props> = ({
  overview,
  onOverdueClick,
  onDueSoonClick,
  onPendingDefectsClick,
  children,
}) => {
  const { t } = useTranslation();
  const { isLoading, completionRate, health, counts, overdue, dueSoon, pendingDefects } = overview;

  if (isLoading) {
    return <div className="h-[260px] w-full animate-pulse rounded-2xl border border-subtle bg-surface-1" />;
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-surface-1 via-surface-1 to-layer-1">
      <div className="grid grid-cols-1 items-start gap-6 px-6 pt-5 pb-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <div className="flex items-center gap-4">
          <RadialGauge value={completionRate} color={health.color} />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-1 text-12 text-tertiary">
              <span>{t("project_overview.hero.health")}</span>
              <HealthRulesHint />
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-13 font-medium",
                health.pillClassName
              )}
            >
              <Activity className="size-3.5" />
              {health.label}
            </span>
            <span className="text-12 leading-relaxed text-secondary">
              {health.description}
              <br />
              <span className="tabular-nums text-tertiary">
                {t("project_overview.hero.completed_of", {
                  completed: counts.completed,
                  total: Math.max(counts.total - counts.cancelled, 0),
                })}
              </span>
            </span>
          </div>
        </div>

        <StateDistribution overview={overview} />

        <div className="grid grid-cols-3 gap-2.5 lg:col-span-2 xl:col-span-1">
          <RiskTile
            value={dueSoon}
            label={t("project_overview.risks.due_soon")}
            action={t("project_overview.risks.view")}
            tone={dueSoon > 0 ? "warning" : "neutral"}
            onClick={onDueSoonClick}
          />
          <RiskTile
            value={overdue}
            label={t("project_overview.risks.overdue")}
            action={t("project_overview.risks.view")}
            tone={overdue > 0 ? "danger" : "neutral"}
            onClick={onOverdueClick}
          />
          <RiskTile
            value={pendingDefects}
            label={t("project_overview.risks.pending_defects")}
            action={t("project_overview.risks.go_defects")}
            tone={pendingDefects > 0 ? "danger" : "neutral"}
            onClick={onPendingDefectsClick}
          />
        </div>
      </div>
      {children && <div className="border-t border-subtle">{children}</div>}
    </section>
  );
};
