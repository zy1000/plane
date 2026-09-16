import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Plus, Play, Send, Undo2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity, TStageReviewDetail } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn } from "@plane/utils";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { StageReviewResultBadge, StageReviewStatusBadge } from "../badges";
import type { TTimelineRowPosition } from "./stage-review-timeline-rail";
import { TimelineRow } from "./stage-review-timeline-rail";

const I18N = "stage_review";

/** 行上下各 10px，节点 28px：圆心离行顶 24px */
const MILESTONE_NODE_CENTER = 24;

type TTone = "neutral" | "warning" | "accent" | "success" | "danger";

const NODE_TONE: Record<TTone, string> = {
  neutral: "bg-layer-3 text-secondary",
  warning: "bg-warning-primary text-on-color",
  accent: "bg-accent-primary text-on-color",
  success: "bg-success-primary text-on-color",
  danger: "bg-danger-primary text-on-color",
};

type TQuoteTone = "warning" | "danger" | "success";

const QUOTE_TONE: Record<TQuoteTone, string> = {
  warning: "border-warning-strong bg-warning-subtle text-warning-primary",
  danger: "border-danger-strong bg-danger-subtle text-danger-primary",
  success: "border-success-strong bg-success-subtle text-success-primary",
};

const STATUSES = Object.values(EStageReviewStatus) as string[];
const RESULTS = Object.values(EStageReviewResult) as string[];
const asStatus = (value: unknown) =>
  typeof value === "string" && STATUSES.includes(value) ? (value as EStageReviewStatus) : null;
const asResult = (value: unknown) =>
  typeof value === "string" && RESULTS.includes(value) ? (value as EStageReviewResult) : null;
const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

const PILL_CLASS = "rounded-md px-2 py-0.5 text-12";

/** 状态节点外壳：彩色圆节点 + 一句 14px 的话 + 右侧时间，下面可挂一段引用（结论说明 / 退回理由 / 审核意见） */
const MilestoneShell = ({
  position,
  icon: Icon,
  tone,
  at,
  quote,
  children,
}: {
  position: TTimelineRowPosition;
  icon: LucideIcon;
  tone: TTone;
  at: string;
  quote?: { label: string; text: string; tone: TQuoteTone } | null;
  children: ReactNode;
}) => (
  <TimelineRow
    item={position.rail}
    isFirst={position.isFirst}
    isLast={position.isLast}
    nodeCenter={MILESTONE_NODE_CENTER}
    className="py-2.5"
    node={
      <span className={cn("grid size-7 place-items-center rounded-full shadow-[0_0_0_3px_var(--bg-surface-1)]", NODE_TONE[tone])}>
        <Icon className="size-3.5" strokeWidth={2.4} />
      </span>
    }
  >
    <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-14 text-secondary">
      {children}
      <HistoryTime value={at} className="ml-auto pl-2" />
    </div>
    {quote && (
      <p
        className={cn(
          "mt-1.5 max-w-[60ch] rounded-r-lg border-l-2 px-3 py-2 text-13 leading-relaxed break-words",
          QUOTE_TONE[quote.tone]
        )}
      >
        <b className="mr-1.5 font-semibold">{quote.label}</b>
        {quote.text}
      </p>
    )}
  </TimelineRow>
);

const Actor = ({ activity }: { activity: TStageReviewActivity }) => {
  const { t } = useTranslation();
  return (
    <span className="font-semibold text-primary">
      {activity.actor_detail?.display_name ?? t(`${I18N}.activity.system`)}
    </span>
  );
};

/**
 * 一条状态推进记录。动作看旧值 → 新值认，不靠后端写的文案：
 * 未评审 → 评审中 = 开始；评审中 → 往后 = 提交审核（老数据里直达已评审的是免审完成）；
 * 审核中 → 已评审 = 审核通过；往回走 = 退回。`field=result` 是「评审不通过」，状态原地不动。
 */
export const StageReviewMilestoneRow = ({
  activity,
  position,
}: {
  activity: TStageReviewActivity;
  position: TTimelineRowPosition;
}) => {
  const { t } = useTranslation();
  const shell = { position, at: activity.created_at };

  if (activity.field === "result") {
    const reason = asText(activity.extra?.conditional_reason);
    const result = asResult(activity.new_value);
    return (
      <MilestoneShell
        {...shell}
        icon={X}
        tone="danger"
        quote={reason ? { label: t(`${I18N}.activity.conclusion_reason`), text: reason, tone: "danger" } : null}
      >
        <Actor activity={activity} />
        <span>{t(`${I18N}.activity.rejected`)}</span>
        {result && (
          <StageReviewResultBadge result={result} className={PILL_CLASS} />
        )}
      </MilestoneShell>
    );
  }

  const from = asStatus(activity.old_value);
  const to = asStatus(activity.new_value);
  const order = STAGE_REVIEW_STATUS_ORDER;
  const toBadge = to && <StageReviewStatusBadge status={to} className={PILL_CLASS} />;

  // 退回：往回走一步，理由挂在下面
  if (from && to && order.indexOf(to) < order.indexOf(from)) {
    const reason = asText(activity.extra?.rollback_reason);
    return (
      <MilestoneShell
        {...shell}
        icon={Undo2}
        tone="warning"
        quote={reason ? { label: t(`${I18N}.activity.rollback_reason`), text: reason, tone: "warning" } : null}
      >
        <Actor activity={activity} />
        <span>{t(`${I18N}.activity.rollback_to`)}</span>
        {toBadge}
      </MilestoneShell>
    );
  }

  if (from === EStageReviewStatus.NOT_STARTED) {
    return (
      <MilestoneShell {...shell} icon={Play} tone="warning">
        <Actor activity={activity} />
        <span>{t(`${I18N}.activity.start`)}</span>
        {toBadge}
      </MilestoneShell>
    );
  }

  if (from === EStageReviewStatus.IN_REVIEW) {
    const result = asResult(activity.extra?.result);
    // 老数据：免审曾经直达已评审
    if (to === EStageReviewStatus.COMPLETED && result === EStageReviewResult.WAIVED) {
      return (
        <MilestoneShell {...shell} icon={Check} tone="success">
          <Actor activity={activity} />
          <span>{t(`${I18N}.activity.waive_done`)}</span>
          {toBadge}
        </MilestoneShell>
      );
    }
    const reason = asText(activity.extra?.conditional_reason);
    return (
      <MilestoneShell
        {...shell}
        icon={Send}
        tone="accent"
        quote={reason ? { label: t(`${I18N}.activity.conclusion_reason`), text: reason, tone: "warning" } : null}
      >
        <Actor activity={activity} />
        <span>{t(`${I18N}.activity.${result ? "submit_with_result" : "submit"}`)}</span>
        {result && (
          <StageReviewResultBadge result={result} className={PILL_CLASS} />
        )}
        {result && <ArrowRight className="size-3 text-placeholder" aria-hidden />}
        {toBadge}
      </MilestoneShell>
    );
  }

  if (from === EStageReviewStatus.IN_APPROVAL && to === EStageReviewStatus.COMPLETED) {
    const comment = asText(activity.extra?.approval_comment);
    return (
      <MilestoneShell
        {...shell}
        icon={Check}
        tone="success"
        quote={comment ? { label: t(`${I18N}.activity.approval_comment`), text: comment, tone: "success" } : null}
      >
        <Actor activity={activity} />
        <span>{t(`${I18N}.activity.approve`)}</span>
        {toBadge}
      </MilestoneShell>
    );
  }

  // 认不出的流转：照后端文案写
  return (
    <MilestoneShell {...shell} icon={Send} tone="neutral">
      <Actor activity={activity} />
      <span>{activity.comment}</span>
      {toBadge}
    </MilestoneShell>
  );
};

/**
 * 时间线的第一条「创建」。裁剪表生成的评审后端没有创建记录，所以前端按 created_at 补；
 * 文案按来源分，不写人 —— 裁剪生成是签批生效触发的，写成某个人反而不对。
 */
export const StageReviewCreatedRow = ({
  detail,
  position,
}: {
  detail: TStageReviewDetail;
  position: TTimelineRowPosition;
}) => {
  const { t } = useTranslation();
  return (
    <MilestoneShell position={position} icon={Plus} tone="neutral" at={detail.created_at}>
      <span>{t(`${I18N}.activity.${detail.is_manual ? "created_manual" : "created_tailoring"}`)}</span>
      <StageReviewStatusBadge status={EStageReviewStatus.NOT_STARTED} className={PILL_CLASS} />
    </MilestoneShell>
  );
};
