import { type FC, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Bug, CircleCheck, Clock, Loader2 } from "lucide-react";
import { InfoIcon } from "@plane/propel/icons";
import { Popover } from "@plane/propel/popover";
import type { TProjectOverviewData } from "./use-project-overview";

type Props = {
  overview: TProjectOverviewData;
  children?: ReactNode;
  /** 左侧 Hero 区域内的附加内容，如项目静态信息 */
  leftExtra?: ReactNode;
  onOverdueClick?: () => void;
  onPendingDefectsClick?: () => void;
};

/** 数字 count-up 动画（easeOutCubic） */
function useCountUp(target: number, duration = 900): number {
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

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RadialGauge: FC<{ value: number; color: string }> = ({ value, color }) => {
  const animated = useCountUp(value);
  const offset = CIRCUMFERENCE * (1 - Math.min(Math.max(value, 0), 100) / 100);

  return (
    <div className="relative grid h-[140px] w-[140px] place-items-center">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-layer-2" />
        <circle
          cx="60"
          cy="60"
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
        <span className="text-[28px] font-semibold leading-none tabular-nums text-primary">{animated}%</span>
        <span className="mt-1 text-xs text-placeholder">完成率</span>
      </div>
    </div>
  );
};

type TStatChip = {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
  onActionClick?: () => void;
  onValueClick?: () => void;
};

const TONE_CLASSES: Record<TStatChip["tone"], { icon: string; value: string }> = {
  neutral: { icon: "text-placeholder", value: "text-primary" },
  accent: { icon: "text-[#3f76ff]", value: "text-primary" },
  success: { icon: "text-success-primary", value: "text-primary" },
  warning: { icon: "text-warning-primary", value: "text-warning-primary" },
  danger: { icon: "text-danger-primary", value: "text-danger-primary" },
};

const HEALTH_RULE_LEVELS = [
  { label: "健康", color: "#16a34a", rule: "逾期 < 10% 且完成率 ≥ 50%" },
  { label: "需关注", color: "#f59e0b", rule: "逾期 ≥ 10% 或完成率 < 50%" },
  { label: "有风险", color: "#ef4444", rule: "逾期 ≥ 25% 或有未完成且完成率 < 20%" },
] as const;

const ProjectHealthRulesHint: FC = () => (
  <Popover>
    <Popover.Button
      type="button"
      className="inline-flex cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
      aria-label="查看项目健康度判定规则"
    >
      <InfoIcon className="h-3.5 w-3.5" />
    </Popover.Button>
    <Popover.Panel side="bottom" align="start" className="z-50 w-[240px] rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200">
      <p className="text-xs font-medium text-primary">判定规则</p>
      <p className="mt-1.5 text-xs leading-relaxed text-secondary">综合完成率与逾期占比判定，取最严重等级。</p>
      <div className="mt-2 space-y-1 text-xs leading-relaxed text-secondary">
        <p>完成率 = 已完成 ÷ (总数 − 已取消)</p>
        <p>逾期占比 = 逾期未完成 ÷ 未完成数</p>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {HEALTH_RULE_LEVELS.map((item) => (
          <li key={item.label} className="flex items-start gap-1.5 text-xs leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-secondary">
              <span className="font-medium text-primary">{item.label}</span>
              <span className="text-placeholder"> — </span>
              {item.rule}
            </span>
          </li>
        ))}
      </ul>
    </Popover.Panel>
  </Popover>
);

const StatChip: FC<{ chip: TStatChip }> = ({ chip }) => {
  const Icon = chip.icon;
  const tone = TONE_CLASSES[chip.tone];
  const animated = useCountUp(chip.value);

  return (
    <div className="relative flex h-full items-center gap-3 rounded-lg border border-subtle bg-layer-1 px-3.5 py-4 text-left transition-colors hover:bg-layer-1-hover">
      {(chip.onActionClick || chip.onValueClick) && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
          {chip.onActionClick && (
            <button
              type="button"
              className="cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
              aria-label={`查看${chip.label}详情`}
              title={`查看${chip.label}详情`}
              onClick={(e) => {
                e.stopPropagation();
                chip.onActionClick?.();
              }}
            >
              <InfoIcon className="h-3 w-3" />
            </button>
          )}
          {chip.onValueClick && (
            <button
              type="button"
              className="cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
              aria-label={`跳转到${chip.label}`}
              title={`跳转到${chip.label}`}
              onClick={(e) => {
                e.stopPropagation();
                chip.onValueClick?.();
              }}
            >
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <Icon className={`h-4 w-4 flex-shrink-0 ${tone.icon}`} />
      <div className="min-w-0">
        {chip.onValueClick ? (
          <button
            type="button"
            className={`cursor-pointer rounded text-16 font-semibold leading-tight tabular-nums transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong ${tone.value}`}
            aria-label={`查看${chip.label}`}
            onClick={(e) => {
              e.stopPropagation();
              chip.onValueClick?.();
            }}
          >
            {animated}
          </button>
        ) : (
          <div className={`text-16 font-semibold leading-tight tabular-nums ${tone.value}`}>{animated}</div>
        )}
        <div className="truncate text-xs text-placeholder">{chip.label}</div>
      </div>
    </div>
  );
};

export const ProjectHealthHero: FC<Props> = ({ overview, children, leftExtra, onOverdueClick, onPendingDefectsClick }) => {
  const { isLoading, completionRate, health, counts, openCount, overdue, dueSoon, pendingDefects } = overview;

  const chips = useMemo<TStatChip[]>(
    () => [
      { label: "已完成", value: counts.completed, icon: CircleCheck, tone: "success" },
      { label: "进行中", value: openCount, icon: Loader2, tone: "accent" },
      { label: "延期", value: overdue, icon: AlertTriangle, tone: overdue > 0 ? "danger" : "neutral", onActionClick: onOverdueClick },
      { label: "临期 7 天", value: dueSoon, icon: Clock, tone: dueSoon > 0 ? "warning" : "neutral" },
      {
        label: "待处理缺陷",
        value: pendingDefects,
        icon: Bug,
        tone: pendingDefects > 0 ? "danger" : "neutral",
        onValueClick: onPendingDefectsClick,
      },
    ],
    [counts.completed, openCount, overdue, onOverdueClick, dueSoon, pendingDefects, onPendingDefectsClick]
  );

  if (isLoading) {
    return <div className="h-[220px] w-full animate-pulse rounded-2xl border border-subtle bg-surface-1" />;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-surface-1 to-layer-1 p-5 shadow-sm">
      {/* 健康色氛围光晕 */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.14] blur-2xl"
        style={{ backgroundColor: health.color }}
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-7">
        {/* 项目信息 + 仪表 + 健康判定 */}
        <div className="flex w-full flex-shrink-0 flex-col gap-4 lg:w-[540px] lg:flex-row lg:items-center lg:gap-5">
          {leftExtra && (
            <div className="flex border-b border-dashed border-subtle pb-3 lg:w-[210px] lg:flex-shrink-0 lg:self-stretch lg:border-r lg:border-b-0 lg:pb-0 lg:pr-4">
              {leftExtra}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-4">
            <RadialGauge value={completionRate} color={health.color} />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-placeholder">项目健康度</span>
                <ProjectHealthRulesHint />
              </div>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
                style={{ color: health.color, backgroundColor: `${health.color}1a` }}
              >
                <Activity className="h-3.5 w-3.5" />
                {health.label}
              </span>
              <span className="max-w-[180px] text-xs leading-relaxed text-secondary">{health.description}</span>
            </div>
          </div>
        </div>

        {/* 关键指标 chips + 项目事实 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="grid w-full flex-1 auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {chips.map((chip) => (
              <StatChip key={chip.label} chip={chip} />
            ))}
          </div>
          {children && <div className="flex w-full min-h-0 flex-1">{children}</div>}
        </div>
      </div>
    </div>
  );
};
