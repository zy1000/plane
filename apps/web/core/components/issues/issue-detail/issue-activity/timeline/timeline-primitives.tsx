"use client";

/**
 * 工作项活动时间线的原语：轨道行、日期分隔、三种节点、时间列、值的几种写法。
 *
 * 三类记录三种视觉重量：流转是 24px 彩色圆节点 + 14px 句子，评论是头像坐在轨道上 + 气泡，
 * 修改是 8px 灰点 + 13px 灰字。轨道在节点圆心处断成上下两段，首行不画上半段、末行不画下半段。
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon } from "@plane/propel/icons";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedDateTime } from "@plane/utils";
import { useProjectState } from "@/hooks/store/use-project-state";

/** 行上下各 6px、节点盒 28px：圆心离行顶 20px */
const NODE_CENTER = 20;

export const TimelineRow = ({
  node,
  isFirst,
  isLast,
  className,
  children,
}: {
  node: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <li className={cn("relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 py-1.5", className)}>
    {!isFirst && (
      <span aria-hidden className="absolute top-0 left-[13px] w-0 border-l-2 border-subtle" style={{ height: NODE_CENTER }} />
    )}
    {!isLast && (
      <span aria-hidden className="absolute bottom-0 left-[13px] w-0 border-l-2 border-subtle" style={{ top: NODE_CENTER }} />
    )}
    <span className="relative z-[1] grid size-7 place-items-center self-start">{node}</span>
    <div className="min-w-0">{children}</div>
  </li>
);

/** 日期分隔：一行 12px 灰字，与正文对齐；轨道从后面穿过，第一天上面没有轨道 */
export const TimelineDaySeparator = ({ label, isFirst }: { label: string; isFirst: boolean }) => (
  <li className={cn("relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 pb-0.5", isFirst ? "pt-1.5" : "pt-[18px]")}>
    {!isFirst && <span aria-hidden className="absolute top-0 bottom-0 left-[13px] w-0 border-l-2 border-subtle" />}
    <span className="col-start-2 text-12 leading-5 text-placeholder">{label}</span>
  </li>
);

/** 日期药丸文案：今天 / 昨天 / 中文「9月5日」（跨年带年），其它语言走 renderFormattedDate */
export const useTimelineDayLabel = () => {
  const { t, currentLocale } = useTranslation();
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const yesterday = format(subDays(now, 1), "yyyy-MM-dd");
  return (dayKey: string) => {
    if (dayKey === today) return t("issue_activity.day.today");
    if (dayKey === yesterday) return t("issue_activity.day.yesterday");
    const date = parseISO(dayKey);
    if (Number.isNaN(date.getTime())) return dayKey;
    if (currentLocale.toLowerCase().startsWith("zh")) {
      return format(date, date.getFullYear() === now.getFullYear() ? "M月d日" : "yyyy年M月d日");
    }
    return renderFormattedDate(dayKey) ?? dayKey;
  };
};

/** 右对齐的时分，悬停看精确到秒的完整时间 */
export const ActivityTime = ({ value, className }: { value: string; className?: string }) => {
  const parsed = parseISO(value);
  const label = Number.isNaN(parsed.getTime()) ? "" : format(parsed, "HH:mm");
  return (
    <time
      dateTime={value}
      title={renderFormattedDateTime(value)}
      className={cn("ml-auto shrink-0 pl-3 text-12 text-placeholder tabular-nums", className)}
    >
      {label}
    </time>
  );
};

type TTone = "neutral" | "warning" | "accent" | "success" | "danger";

const NODE_TONE: Record<TTone, string> = {
  neutral: "bg-layer-3 text-secondary",
  warning: "bg-warning-primary text-on-color",
  accent: "bg-accent-primary text-on-color",
  success: "bg-success-primary text-on-color",
  danger: "bg-danger-primary text-on-color",
};

const HOLLOW_TONE: Record<TTone, string> = {
  neutral: "border-strong text-tertiary",
  warning: "border-warning-strong text-warning-primary",
  accent: "border-accent-strong text-accent-primary",
  success: "border-success-strong text-success-primary",
  danger: "border-danger-strong text-danger-primary",
};

const RING = "shadow-[0_0_0_3px_var(--bg-surface-1)]";

/** 流转节点：20px 彩色圆 + 白图标；hollow 是空心描边（审批中） */
export const StatusNode = ({ icon: Icon, tone, hollow = false }: { icon: LucideIcon; tone: TTone; hollow?: boolean }) => (
  <span
    className={cn(
      "grid size-5 place-items-center rounded-full",
      RING,
      hollow ? cn("border-2 bg-surface-1", HOLLOW_TONE[tone]) : NODE_TONE[tone]
    )}
  >
    <Icon className="size-2.5" strokeWidth={2.8} />
  </span>
);

/** 修改节点：6px 灰点 */
export const DotNode = () => <span className={cn("size-1.5 rounded-full bg-(--text-color-placeholder)", RING)} />;

/** 创建 / 评论节点：头像直接坐在轨道上 */
export const AvatarNode = ({ name, src }: { name: string; src?: string }) => (
  <span className={cn("grid place-items-center rounded-full", RING)}>
    <Avatar size={20} name={name} src={getFileURL(src ?? "")} showTooltip={false} />
  </span>
);

/** 操作人：14px 时跟句子一样大，13px 的修改行里也用它 */
export const ActorName = ({
  name,
  userId,
  workspaceSlug,
}: {
  name: string;
  userId?: string;
  workspaceSlug?: string;
}) =>
  userId && workspaceSlug ? (
    <Link href={`/${workspaceSlug}/profile/${userId}`} className="font-medium text-primary hover:underline">
      {name}
    </Link>
  ) : (
    <span className="font-medium text-primary">{name}</span>
  );

/** 句子里的值：新值深色常规字重（一行里只有人名加粗），旧值划线；太长截断，悬停看全 */
export const Value = ({ children, old = false, className }: { children: string; old?: boolean; className?: string }) => (
  <span
    title={children}
    className={cn(
      "inline-block max-w-[280px] truncate align-bottom",
      old ? "text-placeholder line-through" : "text-primary",
      className
    )}
  >
    {children}
  </span>
);

export const Arrow = () => <ArrowRight className="size-3 shrink-0 text-placeholder" aria-hidden />;

/** 人：16px 头像 + 名字；旧值灰掉、头像变淡 */
export const PersonChip = ({ name, avatarUrl, old = false }: { name: string; avatarUrl?: string; old?: boolean }) => (
  <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", old ? "text-placeholder" : "text-primary")}>
    <span className={cn(old && "opacity-60")}>
      <Avatar size={16} name={name} src={getFileURL(avatarUrl ?? "")} showTooltip={false} />
    </span>
    {name}
  </span>
);

/** 状态：组图标（颜色跟状态走）+ 名字，不带底色；旧状态灰字 */
export const StateValue = ({ name, stateId, old = false }: { name: string; stateId?: string; old?: boolean }) => {
  const { getStateById } = useProjectState();
  const state = stateId ? getStateById(stateId) : undefined;
  return (
    <span
      className={cn("inline-flex max-w-[220px] items-center gap-1.5", old ? "text-tertiary" : "font-medium text-primary")}
    >
      <StateGroupIcon stateGroup={state?.group ?? "backlog"} color={state?.color} className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
};

/** 标签：色点 + 名字 */
export const LabelChip = ({ name, color, old = false }: { name: string; color?: string; old?: boolean }) => (
  <span
    className={cn(
      "inline-flex max-w-[200px] items-center gap-1.5 rounded-full border border-subtle px-2 text-12 leading-5",
      old ? "text-placeholder line-through" : "text-primary"
    )}
  >
    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--text-color-placeholder)" }} aria-hidden />
    <span className="truncate">{name}</span>
  </span>
);

