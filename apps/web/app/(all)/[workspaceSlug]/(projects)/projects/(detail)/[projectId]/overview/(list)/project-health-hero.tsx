import { type FC, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Bug, CircleCheck, Clock, Loader2 } from "lucide-react";
import { InfoIcon } from "@plane/propel/icons";
import type { TProjectOverviewData } from "./use-project-overview";

type Props = {
  overview: TProjectOverviewData;
  children?: ReactNode;
  /** 左侧区域（仪表 + 健康判定）下方的附加内容，如项目静态信息 */
  leftExtra?: ReactNode;
  onOverdueClick?: () => void;
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
};

const TONE_CLASSES: Record<TStatChip["tone"], { icon: string; value: string }> = {
  neutral: { icon: "text-placeholder", value: "text-primary" },
  accent: { icon: "text-[#3f76ff]", value: "text-primary" },
  success: { icon: "text-success-primary", value: "text-primary" },
  warning: { icon: "text-warning-primary", value: "text-warning-primary" },
  danger: { icon: "text-danger-primary", value: "text-danger-primary" },
};

const StatChip: FC<{ chip: TStatChip }> = ({ chip }) => {
  const Icon = chip.icon;
  const tone = TONE_CLASSES[chip.tone];
  const animated = useCountUp(chip.value);

  return (
    <div className="relative flex h-full items-center gap-3 rounded-lg border border-subtle bg-layer-1 px-3.5 py-4 text-left transition-colors hover:bg-layer-1-hover">
      {chip.onActionClick && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
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
      <Icon className={`h-4 w-4 flex-shrink-0 ${tone.icon}`} />
      <div className="min-w-0">
        <div className={`text-16 font-semibold leading-tight tabular-nums ${tone.value}`}>{animated}</div>
        <div className="truncate text-xs text-placeholder">{chip.label}</div>
      </div>
    </div>
  );
};

export const ProjectHealthHero: FC<Props> = ({ overview, children, leftExtra, onOverdueClick }) => {
  const { isLoading, completionRate, health, counts, openCount, overdue, dueSoon, pendingDefects } = overview;

  const chips = useMemo<TStatChip[]>(
    () => [
      { label: "已完成", value: counts.completed, icon: CircleCheck, tone: "success" },
      { label: "进行中", value: openCount, icon: Loader2, tone: "accent" },
      { label: "延期", value: overdue, icon: AlertTriangle, tone: overdue > 0 ? "danger" : "neutral", onActionClick: onOverdueClick },
      { label: "临期 7 天", value: dueSoon, icon: Clock, tone: dueSoon > 0 ? "warning" : "neutral" },
      { label: "待处理缺陷", value: pendingDefects, icon: Bug, tone: pendingDefects > 0 ? "danger" : "neutral" },
    ],
    [counts.completed, openCount, overdue, onOverdueClick, dueSoon, pendingDefects]
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
        {/* 仪表 + 健康判定 + 项目信息 */}
        <div className="flex flex-shrink-0 flex-col gap-4">
          <div className="flex items-center gap-5">
            <RadialGauge value={completionRate} color={health.color} />
            <div className="flex flex-col gap-2">
              <span className="text-xs text-placeholder">项目健康度</span>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
                style={{ color: health.color, backgroundColor: `${health.color}1a` }}
              >
                <Activity className="h-3.5 w-3.5" />
                {health.label}
              </span>
              <span className="max-w-[180px] text-xs leading-relaxed text-secondary">{health.description}</span>
              <span className="text-xs text-placeholder tabular-nums">
                共 {counts.total} 个工作项 · {openCount} 个进行中
              </span>
            </div>
          </div>
          {leftExtra && <div className="border-t border-dashed border-subtle pt-3">{leftExtra}</div>}
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
