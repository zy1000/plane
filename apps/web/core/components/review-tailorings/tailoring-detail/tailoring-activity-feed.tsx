import { useState } from "react";
import type { ReactNode } from "react";
import { format, isValid, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, MessageSquareText, PencilLine, Plus, Scissors, Send, Undo2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringActivity, TReviewTailoringProduct } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { HistoryEmpty } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { TimelineRailRow } from "@/components/stage-reviews/detail/stage-review-timeline-rail";
import { ReviewTailoringStatusBadge } from "../status-badge";
import { buildActivityMessage } from "./tailoring-activity-message";
import type { TTimelineEntry, TTimelineFilter } from "./tailoring-timeline-model";
import { buildTailoringTimeline, filterTimeline } from "./tailoring-timeline-model";

const I18N = "review_tailoring.activity";

/** 轨道随表的状态变色：草稿与修订中灰、签批中蓝、已生效绿 */
const RAIL_TONE: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "border-subtle",
  [EReviewTailoringStatus.PENDING]: "border-accent-subtle",
  [EReviewTailoringStatus.APPROVED]: "border-success-subtle",
  [EReviewTailoringStatus.REVISING]: "border-subtle",
};

type TTone = "neutral" | "warning" | "accent" | "success" | "danger";

const NODE_TONE: Record<TTone, string> = {
  neutral: "bg-(--text-color-placeholder) text-on-color",
  warning: "bg-warning-primary text-on-color",
  accent: "bg-accent-primary text-on-color",
  success: "bg-success-primary text-on-color",
  danger: "bg-danger-primary text-on-color",
};

const QUOTE_TONE: Record<TTone, string> = {
  neutral: "border-strong bg-layer-1 text-secondary",
  warning: "border-warning-strong bg-warning-subtle text-warning-primary",
  accent: "border-accent-strong bg-accent-subtle text-secondary",
  success: "border-success-strong bg-success-subtle text-success-primary",
  danger: "border-danger-strong bg-danger-subtle text-danger-primary",
};

/** 状态行上下各 10px、节点 28px：圆心离行顶 24px；修改行上下各 2px：16px */
const MILESTONE_NODE_CENTER = 24;
const EDIT_NODE_CENTER = 16;

const isTrue = (value: string | null) => value === "True" || value === "true";
const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

/** 绝对时间：今年的写「09-16 10:12」，跨年的带上年份；悬停看完整时间 */
const ActivityTime = ({ value }: { value: string }) => {
  const parsed = parseISO(value);
  if (!isValid(parsed)) return null;
  const pattern = parsed.getFullYear() === new Date().getFullYear() ? "MM-dd HH:mm" : "yyyy-MM-dd HH:mm";
  return (
    <time
      dateTime={value}
      title={renderFormattedDateTime(value)}
      className="ml-auto shrink-0 pl-2 text-12 whitespace-nowrap text-placeholder tabular-nums"
    >
      {format(parsed, pattern)}
    </time>
  );
};

const Actor = ({ activity }: { activity: TReviewTailoringActivity }) => {
  const { t } = useTranslation();
  return <span className="font-medium text-primary">{activity.actor_detail?.display_name ?? t(`${I18N}.system`)}</span>;
};

/** 句子里的名字：加深，太长截断，悬停看全 */
const Value = ({ children }: { children: string }) => (
  <span title={children} className="inline-block max-w-[320px] truncate align-bottom font-medium text-primary">
    {children}
  </span>
);

const Quote = ({ text, tone }: { text: string; tone: TTone }) => (
  <p
    className={cn(
      "mt-1.5 max-w-[60ch] rounded-r-lg border-l-2 px-3 py-1.5 text-13 leading-relaxed break-words whitespace-pre-wrap",
      QUOTE_TONE[tone]
    )}
  >
    {text}
  </p>
);

type TRowPosition = { entry: TTimelineEntry; isFirst: boolean; isLast: boolean };

const railProps = ({ entry, isFirst, isLast }: TRowPosition) => ({
  railBefore: RAIL_TONE[entry.phaseBefore],
  railAfter: RAIL_TONE[entry.phaseAfter],
  isFirst,
  isLast,
});

/* ---------------- 状态推进 ---------------- */

const MilestoneRow = ({ position }: { position: TRowPosition }) => {
  const { t } = useTranslation();
  const activity = position.entry.activities[0];
  const extra = (activity.extra ?? {}) as Record<string, unknown>;
  const comment = asText(activity.comment);
  const toStatus = Object.values(EReviewTailoringStatus).find((status) => status === activity.new_value);

  let icon: LucideIcon = PencilLine;
  let tone: TTone = "neutral";
  let sentence = t(`${I18N}.fallback`);
  let badge: EReviewTailoringStatus | undefined = toStatus;
  let note: string | null = null;

  if (activity.field === "tailoring") {
    icon = Plus;
    sentence = t(`${I18N}.created`);
    badge = EReviewTailoringStatus.DRAFT;
  } else if (activity.field === "approval") {
    // 多人签批里的一票：状态没变，不带药丸
    icon = Check;
    tone = "success";
    sentence = t(`${I18N}.approved_partial`, { value: activity.new_value ?? "" });
    badge = undefined;
  } else {
    switch (activity.verb) {
      case "submitted":
        icon = Send;
        tone = "accent";
        sentence = t(`${I18N}.submitted`, { round: extra.round ?? 1 });
        break;
      case "approved":
        icon = Check;
        tone = "success";
        sentence = t(`${I18N}.applied`);
        note = t(`${I18N}.applied_counts`, { created: extra.created_count ?? 0, deleted: extra.deleted_count ?? 0 });
        break;
      case "rejected":
        icon = X;
        tone = "danger";
        sentence = t(`${I18N}.rejected`);
        break;
      case "withdrawn":
        icon = Undo2;
        tone = "warning";
        sentence = t(`${I18N}.withdrawn`);
        break;
      case "revising":
        icon = PencilLine;
        sentence = t(`${I18N}.revising`);
        break;
      case "revision_cancelled":
        icon = Undo2;
        tone = "warning";
        sentence = t(`${I18N}.revision_cancelled`);
        break;
    }
  }

  const Icon = icon;
  return (
    <TimelineRailRow
      {...railProps(position)}
      nodeCenter={MILESTONE_NODE_CENTER}
      className="py-2.5"
      node={
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full shadow-[0_0_0_3px_var(--bg-surface-1)]",
            NODE_TONE[tone]
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.6} />
        </span>
      }
    >
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-14 text-secondary">
        <Actor activity={activity} />
        <span>{sentence}</span>
        {badge && <ReviewTailoringStatusBadge status={badge} showDot />}
        {note && <span className="text-13 text-tertiary">{note}</span>}
        <ActivityTime value={activity.created_at} />
      </div>
      {comment && <Quote text={comment} tone={tone === "neutral" ? "accent" : tone} />}
    </TimelineRailRow>
  );
};

/* ---------------- 修改（小灰点） ---------------- */

const EditShell = ({ position, children }: { position: TRowPosition; children: ReactNode }) => (
  <TimelineRailRow
    {...railProps(position)}
    nodeCenter={EDIT_NODE_CENTER}
    className="py-0.5"
    node={<span className="size-2 rounded-full bg-(--text-color-placeholder) shadow-[0_0_0_3px_var(--bg-surface-1)]" />}
  >
    {children}
  </TimelineRailRow>
);

const EditLine = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-13 text-tertiary">{children}</div>
);

/** 加减轴、改标题描述、同步矩阵：一句话；加评审 / 加产品把名字跟在后面 */
const EditRow = ({ position, products }: { position: TRowPosition; products: TReviewTailoringProduct[] }) => {
  const { t } = useTranslation();
  const activity = position.entry.activities[0];
  const extra = (activity.extra ?? {}) as Record<string, unknown>;

  let names: string[] = [];
  if (activity.field === "reviews" && activity.new_value && Array.isArray(extra.titles)) {
    names = extra.titles.filter((title): title is string => typeof title === "string");
  } else if (activity.field === "reviews" && !activity.new_value && asText(extra.title)) {
    names = [String(extra.title)];
  } else if (activity.field === "products" && activity.new_value && Array.isArray(extra.product_ids)) {
    names = extra.product_ids
      .map((id) => products.find((product) => product.id === id)?.name)
      .filter((name): name is string => Boolean(name));
  }
  const shown = names.slice(0, 3);

  return (
    <EditShell position={position}>
      <EditLine>
        <Actor activity={activity} />
        <span>{buildActivityMessage(activity, t)}</span>
        {shown.map((name, index) => (
          <Value key={`${name}-${index}`}>{name}</Value>
        ))}
        {names.length > shown.length && <span>{t(`${I18N}.and_more`, { count: names.length - shown.length })}</span>}
        <ActivityTime value={activity.created_at} />
      </EditLine>
    </EditShell>
  );
};

/* ---------------- 格子改动 ---------------- */

type TCellAction = "keep" | "cut" | "reason";

const cellAction = (activity: TReviewTailoringActivity): TCellAction =>
  activity.field === "cell_reason" ? "reason" : isTrue(activity.new_value) ? "keep" : "cut";

/** 这一格要跟一段什么原因：裁掉时记下的原因，或改原因时的新原因 */
const cellReason = (activity: TReviewTailoringActivity) =>
  activity.field === "cell_reason" ? asText(activity.new_value) : asText(activity.extra?.reason);

const cellTitle = (activity: TReviewTailoringActivity) => String(activity.extra?.title ?? "");

/** 同一个评审在 o-1、o-2 下各有一格，光看名字分不清改的是哪一格。老数据没这一项就不显示 */
const cellStage = (activity: TReviewTailoringActivity) => String(activity.extra?.stage_label ?? "");

const ACTION_ICON: Record<TCellAction, LucideIcon> = { keep: Check, cut: Scissors, reason: MessageSquareText };
const ACTION_TONE: Record<TCellAction, string> = {
  keep: "text-success-primary",
  cut: "text-tertiary",
  reason: "text-tertiary",
};

/** 展开后的一格：动作 | 评审名，下面挂原因 */
const CellItem = ({ activity }: { activity: TReviewTailoringActivity }) => {
  const { t } = useTranslation();
  const action = cellAction(activity);
  const Icon = ACTION_ICON[action];
  const reason = cellReason(activity);
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-2 py-1 text-13">
      <span className={cn("flex h-5 items-center gap-1.5 font-medium", ACTION_TONE[action])}>
        <Icon className="size-3.5 shrink-0" strokeWidth={2.4} />
        {t(`${I18N}.action_${action}`)}
      </span>
      <div className="min-w-0">
        <span className="block truncate leading-5 font-medium text-primary" title={cellTitle(activity)}>
          {cellStage(activity) && <span className="font-normal text-placeholder">{cellStage(activity)} · </span>}
          {cellTitle(activity)}
        </span>
        {reason && <Quote text={reason} tone="neutral" />}
        {action === "reason" && !reason && <span className="text-12 text-placeholder">{t(`${I18N}.reason_cleared`)}</span>}
      </div>
    </li>
  );
};

const CellsRow = ({ position }: { position: TRowPosition }) => {
  const { t } = useTranslation();
  const { activities } = position.entry;
  // 少量格子直接摊开，一次改了很多格先收起
  const [isOpen, setIsOpen] = useState(activities.length <= 5);
  const first = activities[0];
  const last = activities[activities.length - 1];

  if (activities.length === 1) {
    const action = cellAction(first);
    const reason = cellReason(first);
    return (
      <EditShell position={position}>
        <EditLine>
          <Actor activity={first} />
          <span>{t(`${I18N}.cell_${action}`)}</span>
          <Value>{cellTitle(first)}</Value>
          <ActivityTime value={first.created_at} />
        </EditLine>
        {reason && <div className="mb-1.5"><Quote text={reason} tone="neutral" /></div>}
      </EditShell>
    );
  }

  const counts = activities.reduce(
    (acc, activity) => ({ ...acc, [cellAction(activity)]: acc[cellAction(activity)] + 1 }),
    { keep: 0, cut: 0, reason: 0 } as Record<TCellAction, number>
  );

  return (
    <EditShell position={position}>
      <EditLine>
        <Actor activity={first} />
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="-mx-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md px-1 text-left transition hover:bg-layer-1"
        >
          <span>{t(`${I18N}.cells_changed`, { count: activities.length })}</span>
          {counts.keep > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-[2px] bg-accent-primary" />
              {t(`${I18N}.count_keep`, { count: counts.keep })}
            </span>
          )}
          {counts.cut > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-[2px] bg-(--text-color-placeholder)" />
              {t(`${I18N}.count_cut`, { count: counts.cut })}
            </span>
          )}
          {counts.reason > 0 && <span>{t(`${I18N}.count_reason`, { count: counts.reason })}</span>}
          <ChevronDown className={cn("size-3.5 text-placeholder transition-transform", !isOpen && "-rotate-90")} />
        </button>
        <ActivityTime value={last.created_at} />
      </EditLine>
      {isOpen && (
        <ul className="mt-0.5 mb-2 flex flex-col border-l-2 border-subtle pl-3">
          {activities.map((activity) => (
            <CellItem key={activity.id} activity={activity} />
          ))}
        </ul>
      )}
    </EditShell>
  );
};

/* ---------------- 时间线 ---------------- */

/**
 * 变更历史：状态推进是彩色节点、轨道随表的状态变色；格子改动按一次保存合并成一条；
 * 其余修改是一句灰字。轨道颜色按全量记录算好再筛选，只看「状态」时轨道颜色不跟着乱。
 */
export const TailoringActivityFeed = ({
  activities,
  products,
  filter,
}: {
  activities: TReviewTailoringActivity[];
  products: TReviewTailoringProduct[];
  filter: TTimelineFilter;
}) => {
  const { t } = useTranslation();
  const entries = filterTimeline(buildTailoringTimeline(activities), filter);

  if (entries.length === 0) {
    return <HistoryEmpty title={t(`${I18N}.empty_title`)} description={t(`${I18N}.empty_description`)} />;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => {
        const position = { entry, isFirst: index === 0, isLast: index === entries.length - 1 };
        if (entry.kind === "milestone") return <MilestoneRow key={entry.key} position={position} />;
        if (entry.kind === "cells") return <CellsRow key={entry.key} position={position} />;
        return <EditRow key={entry.key} position={position} products={products} />;
      })}
    </ol>
  );
};
