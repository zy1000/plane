"use client";

/**
 * 历史区共用的时间线原语，变更轨迹与版本历史都由它渲染。
 *
 * 两块讲的是同一条时间上的事，此前却是两套几何（6rem / 4rem 左栏、两种元信息写法），
 * 上下并排却对不齐。收成一个组件后，改一次两处同时生效。
 *
 * 节点用**形状 + 颜色**双重编码，不让颜色单独承载语义：
 * 实心圆=已通过、空心圆=审批中、红环=已驳回、方块=版本、齿轮=需求类型级结构变更。
 */
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn, renderFormattedDate, renderFormattedDateTime } from "@plane/utils";

export type THistoryNode = "approved" | "pending" | "rejected" | "version" | "schema";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间。
 *
 * 不用 @plane/utils 的 calculateTimeAgo —— 它走 date-fns 的 formatDistanceToNow 且没接 locale，
 * 中文界面下会吐英文。超过两天就回落到绝对日期：活动流里「37 天前」不如「7月1日」好用。
 */
const formatRelative = (iso: string, t: ReturnType<typeof useTranslation>["t"]) => {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return "";
  const diff = Date.now() - parsed;
  if (diff < MINUTE) return t("relative_time.just_now");
  if (diff < HOUR) return t("relative_time.minutes_ago", { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t("relative_time.hours_ago", { count: Math.floor(diff / HOUR) });
  if (diff < 2 * DAY) return t("relative_time.yesterday");
  return renderFormattedDate(iso);
};

/** 右对齐的时间列。hover 出精确到秒的绝对时间 */
export const HistoryTime = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  return (
    <time
      dateTime={value}
      title={renderFormattedDateTime(value)}
      className="shrink-0 cursor-help pt-0.5 text-11 text-placeholder tabular-nums"
    >
      {formatRelative(value, t)}
    </time>
  );
};

type TPillTone = "neutral" | "version" | "pending" | "rejected" | "added" | "removed";

const PILL_TONE: Record<TPillTone, string> = {
  neutral: "bg-layer-1 text-tertiary",
  version: "bg-accent-subtle text-accent-primary font-semibold",
  pending: "bg-accent-subtle text-accent-primary",
  rejected: "bg-danger-subtle text-danger-primary",
  added: "bg-success-subtle text-success-primary",
  removed: "bg-danger-subtle text-danger-primary",
};

export const HistoryPill = ({
  tone = "neutral",
  children,
  onClick,
  title,
}: {
  tone?: TPillTone;
  children: ReactNode;
  /** 传了就渲染成按钮 —— 轨迹里的版本号靠它跳到下面的版本节点 */
  onClick?: () => void;
  title?: string;
}) => {
  const className = cn(
    "inline-flex h-[17px] shrink-0 items-center gap-1 rounded px-1.5 text-10 font-medium tabular-nums whitespace-nowrap",
    PILL_TONE[tone]
  );
  if (!onClick) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(className, "cursor-pointer transition-opacity hover:opacity-80 focus-visible:opacity-80")}
    >
      {children}
    </button>
  );
};

const NODE_SHAPE: Record<THistoryNode, string> = {
  // 实心：这一版已经定下来了
  approved: "size-[11px] rounded-full bg-accent-primary",
  // 空心：还在流程里
  pending: "size-[11px] rounded-full border-2 border-accent-primary bg-surface-1",
  rejected: "size-[11px] rounded-full border-2 border-danger-primary bg-surface-1",
  // 方块：里程碑，和圆形的「事件」区分开。尺寸与圆点一致，否则轴心差半像素
  version: "size-[11px] rounded-[2px] bg-accent-primary",
  schema: "",
};

export const HistoryTimeline = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col">{children}</div>
);

export const HistoryEntry = ({
  node,
  occurredAt,
  isFirst,
  isLast,
  isHighlighted,
  id,
  onClick,
  leading,
  children,
  expanded,
}: {
  node: THistoryNode;
  occurredAt: string;
  isFirst: boolean;
  isLast: boolean;
  isHighlighted?: boolean;
  id?: string;
  onClick?: () => void;
  /** 展开箭头之类的前缀 */
  leading?: ReactNode;
  children: ReactNode;
  expanded?: ReactNode;
}) => {
  // 展开区里还有回滚按钮，所以可点区域只包住主体，不能把整行做成 button 再嵌一个
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-col gap-0.5">{children}</span>
    </>
  );
  return (
    <div
      id={id}
      className={cn(
        "relative grid scroll-mt-24 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md py-1.5 pr-2 transition-colors duration-150 motion-reduce:transition-none",
        isHighlighted ? "bg-accent-subtle" : "hover:bg-layer-1"
      )}
    >
      {/* 轨道：首尾各截半段，让线正好收在端点节点上 */}
      <span className="relative h-full">
        <span
          className={cn(
            "absolute left-[9px] w-px border-l border-subtle",
            isFirst && isLast && "hidden",
            isFirst && !isLast && "top-[9px] bottom-0",
            isLast && !isFirst && "top-0 h-[9px]",
            !isFirst && !isLast && "inset-y-0"
          )}
        />
        {node === "schema" ? (
          <SlidersHorizontal className="absolute top-[3px] left-[3px] size-3.5 text-placeholder" />
        ) : (
          <span className={cn("absolute top-1 left-1 box-border", NODE_SHAPE[node])} />
        )}
      </span>

      {onClick ? (
        <button type="button" onClick={onClick} className="flex min-w-0 cursor-pointer items-start gap-2 text-left">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 gap-2">{body}</div>
      )}

      <HistoryTime value={occurredAt} />

      {expanded && <div className="col-start-2 col-end-4 mt-2">{expanded}</div>}
    </div>
  );
};

/** 主句：谁 + 做了什么。actor 是唯一的 primary，其余降一级 */
export const HistoryLine = ({
  actor,
  children,
  muted,
}: {
  actor: string;
  children: ReactNode;
  muted?: boolean;
}) => (
  <span className={cn("text-13 leading-snug break-words", muted ? "text-tertiary" : "text-secondary")}>
    <span className={cn(muted ? "text-secondary" : "font-medium text-primary")}>{actor}</span> {children}
  </span>
);

/** 副行：徽章组 + 补充说明，统一降到 placeholder */
export const HistorySub = ({ children }: { children: ReactNode }) => (
  <span className="flex flex-wrap items-center gap-1.5 text-11 text-placeholder">{children}</span>
);

/** 空态：一句陈述 + 一句「什么时候会有东西」 */
export const HistoryEmpty = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col gap-0.5 py-3 pl-7">
    <span className="text-12 text-tertiary">{title}</span>
    <span className="text-11 text-placeholder">{description}</span>
  </div>
);
