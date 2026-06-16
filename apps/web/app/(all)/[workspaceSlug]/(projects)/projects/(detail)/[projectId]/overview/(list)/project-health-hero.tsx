import { type FC, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Bug, CircleCheck, Clock, Loader2 } from "lucide-react";
import type { TProjectOverviewData } from "./use-project-overview";

type Props = {
  overview: TProjectOverviewData;
  children?: ReactNode;
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
    <div className="flex items-center gap-2.5 rounded-lg border border-subtle bg-layer-1 px-3 py-2.5 transition-colors hover:bg-layer-1-hover">
      <Icon className={`h-4 w-4 flex-shrink-0 ${tone.icon}`} />
      <div className="min-w-0">
        <div className={`text-16 font-semibold leading-tight tabular-nums ${tone.value}`}>{animated}</div>
        <div className="truncate text-xs text-placeholder">{chip.label}</div>
      </div>
    </div>
  );
};

export const ProjectHealthHero: FC<Props> = ({ overview, children }) => {
  const { isLoading, completionRate, health, counts, openCount, overdue, dueSoon, pendingDefects } = overview;

  const chips = useMemo<TStatChip[]>(
    () => [
      { label: "已完成", value: counts.completed, icon: CircleCheck, tone: "success" },
      { label: "进行中", value: openCount, icon: Loader2, tone: "accent" },
      { label: "逾期", value: overdue, icon: AlertTriangle, tone: overdue > 0 ? "danger" : "neutral" },
      { label: "临期 7 天", value: dueSoon, icon: Clock, tone: dueSoon > 0 ? "warning" : "neutral" },
      { label: "待处理缺陷", value: pendingDefects, icon: Bug, tone: pendingDefects > 0 ? "danger" : "neutral" },
    ],
    [counts.completed, openCount, overdue, dueSoon, pendingDefects]
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
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-7">
        {/* 仪表 + 健康判定 */}
        <div className="flex flex-shrink-0 items-center gap-5">
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

        {/* 关键指标 chips + 项目事实 */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {chips.map((chip) => (
              <StatChip key={chip.label} chip={chip} />
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};
