"use client";

/**
 * 历史区共用的时间线原语。
 *
 * 节点用**形状 + 颜色**双重编码，不让颜色单独承载语义：
 * 带号方块 = 版本（通过审批的改动，当前版实心、历史版描边）；
 * 圆点 = 没成为版本的改动（琥珀空心审批中、红空心已驳回、灰空心已撤回、实心绿通过但无版本）；
 * 齿轮 = 需求类型级结构变更。
 */
import type { ComponentType, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedDateTime } from "@plane/utils";
import { SECTION_ACTION_BUTTON } from "./requirement-detail-section";

export type THistoryNode =
  | { kind: "dot"; tone: "approved" | "pending" | "rejected" | "cancelled" }
  | { kind: "version"; label: string; isCurrent: boolean }
  | { kind: "schema" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间。
 *
 * 不用 @plane/utils 的 calculateTimeAgo —— 它走 date-fns 的 formatDistanceToNow 且没接 locale，
 * 中文界面下会吐英文。超过两天就回落到绝对日期：活动流里「37 天前」不如「7月1日」好用。
 */
const formatRelative = (iso: string, locale: string, t: ReturnType<typeof useTranslation>["t"]) => {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return "";
  const diff = Date.now() - parsed;
  if (diff < MINUTE) return t("relative_time.just_now");
  if (diff < HOUR) return t("relative_time.minutes_ago", { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t("relative_time.hours_ago", { count: Math.floor(diff / HOUR) });
  if (diff < 2 * DAY) return t("relative_time.yesterday");
  return formatHistoryDate(iso, locale);
};

/**
 * 历史里的短日期：中文界面「8月28日」（跨年才带年份），其它语言沿用 renderFormattedDate。
 * 默认的「Aug 28, 2026」在中文界面里既是英文又太长，窄列里会折成两行。
 */
export const formatHistoryDate = (iso: string, locale: string) => {
  if (!locale.toLowerCase().startsWith("zh")) return renderFormattedDate(iso) ?? "";
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return renderFormattedDate(iso, sameYear ? "M月d日" : "yyyy年M月d日") ?? "";
};

/** 右对齐的时间列。hover 出精确到秒的绝对时间 */
export const HistoryTime = ({ value, className }: { value: string; className?: string }) => {
  const { t, currentLocale } = useTranslation();
  return (
    <time
      dateTime={value}
      title={renderFormattedDateTime(value)}
      className={cn("shrink-0 cursor-help text-caption-md-regular text-placeholder tabular-nums", className)}
    >
      {formatRelative(value, currentLocale, t)}
    </time>
  );
};

const DOT_TONE: Record<Extract<THistoryNode, { kind: "dot" }>["tone"], string> = {
  // 通过了但没形成版本（删除审批通过后行已软删）：实心绿
  approved: "border-success-strong bg-success-primary",
  pending: "border-warning-strong",
  rejected: "border-danger-strong",
  cancelled: "border-strong",
};

const HistoryNode = ({ node }: { node: THistoryNode }) => {
  if (node.kind === "version") {
    return (
      <span
        className={cn(
          "relative z-[1] inline-flex h-[22px] min-w-7 items-center justify-center rounded-md px-1 text-caption-md-medium tabular-nums",
          node.isCurrent
            ? "bg-accent-primary text-on-color"
            : "border border-accent-strong bg-surface-1 text-accent-primary"
        )}
      >
        {node.label}
      </span>
    );
  }
  if (node.kind === "schema") {
    return (
      <span className="relative z-[1] grid size-7 place-items-center rounded-full bg-layer-1 text-placeholder">
        <SlidersHorizontal className="size-3.5" />
      </span>
    );
  }
  return <span className={cn("relative z-[1] size-[11px] rounded-full border-2 bg-surface-1", DOT_TONE[node.tone])} />;
};

export const HistoryTimeline = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col pt-1">{children}</div>
);

/**
 * 一行：左边 2rem 轨道放节点，右边正文自己排（头行 / 说明 / 面板）。
 * 节点盒高 28px、行上下各 10px 内边距，所以轨道线在首行从 24px 起、末行到 24px 止。
 */
export const HistoryEntry = ({
  node,
  isFirst,
  isLast,
  children,
  className,
}: {
  node: THistoryNode;
  isFirst: boolean;
  isLast: boolean;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5 py-2.5", className)}>
    <span
      className={cn(
        "absolute left-[15.5px] w-px border-l border-subtle",
        isFirst && isLast && "hidden",
        isFirst && !isLast && "top-6 bottom-0",
        isLast && !isFirst && "top-0 h-6",
        !isFirst && !isLast && "inset-y-0"
      )}
    />
    <span className="relative flex h-7 items-center justify-center">
      <HistoryNode node={node} />
    </span>
    <div className="flex min-w-0 flex-col gap-2">{children}</div>
  </div>
);

/** 头行：头像 + 人名 + 一句动作 + 徽章组，时间靠右 */
export const HistoryHeader = ({ children, time }: { children: ReactNode; time?: string }) => (
  <div className="flex min-h-7 flex-wrap items-center gap-2">
    {children}
    {time && <HistoryTime value={time} className="ml-auto" />}
  </div>
);

/** 头像 + 人名；actor_detail 自带头像，不用再查成员 store */
export const HistoryActor = ({ user }: { user: IUserLite | null }) => (
  <span className="inline-flex items-center gap-2">
    <Avatar size={22} name={user?.display_name ?? "?"} src={getFileURL(user?.avatar_url ?? "")} showTooltip={false} />
    <span className="text-body-xs-medium text-primary">{user?.display_name ?? "—"}</span>
  </span>
);

/** 头行里的一句动作，数字加重 */
export const HistoryText = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("text-body-xs-regular text-secondary", className)}>{children}</span>
);

/** 头行下面的说明行（变更原因 / 审批结果）。默认左缩进对齐头像后面的文字 */
export const HistoryNote = ({
  children,
  tone = "default",
  indent = true,
  className,
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "danger";
  indent?: boolean;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs-regular",
      tone === "default" && "text-secondary",
      tone === "muted" && "text-tertiary",
      tone === "danger" && "text-danger-secondary",
      indent && "pl-[30px]",
      className
    )}
  >
    {children}
  </div>
);

type TPillTone = "neutral" | "ghost" | "version" | "added" | "removed";

const PILL_TONE: Record<TPillTone, string> = {
  neutral: "bg-layer-1 text-tertiary",
  ghost: "border border-subtle-1 text-tertiary",
  version: "bg-accent-subtle text-accent-primary font-semibold",
  added: "bg-success-subtle text-success-primary",
  removed: "bg-danger-subtle text-danger-primary",
};

/** 徽章。状态色由调用方传 className（CHANGE_STATUS_PILL），这里只管几何 */
export const HistoryPill = ({
  tone = "neutral",
  className,
  title,
  children,
}: {
  tone?: TPillTone;
  className?: string;
  title?: string;
  children: ReactNode;
}) => (
  <span
    title={title}
    className={cn(
      "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-caption-md-medium whitespace-nowrap tabular-nums",
      PILL_TONE[tone],
      className
    )}
  >
    {children}
  </span>
);

/** 版本节点行内的动作（查看这一版 / 并排对比 / 回滚）：与区块标题行的文字按钮同一套 */
export const HistoryActionButton = ({
  icon: Icon,
  active,
  onClick,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(SECTION_ACTION_BUTTON, "h-[26px]", active && "text-accent-primary hover:text-accent-primary", className)}
  >
    <Icon className="size-3.5" />
    {children}
  </button>
);

/** 空态：一句陈述 + 一句「什么时候会有东西」 */
export const HistoryEmpty = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col gap-0.5 py-3 pl-8">
    <span className="text-body-xs-regular text-tertiary">{title}</span>
    <span className="text-caption-md-regular text-placeholder">{description}</span>
  </div>
);
