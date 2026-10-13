import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  ERiskCategory,
  ERiskLevel,
  ERiskStatus,
  ERiskStrategy,
  TRiskActivity,
  TRiskLinkedIssue,
  TRiskScale,
} from "@plane/types";
import { RISK_LEVELS, RISK_STATUSES } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { useMember } from "@/hooks/store/use-member";
import { TimelineRailRow } from "../../stage-reviews/detail/stage-review-timeline-rail";
import { RiskLevelBadge, RiskStatusBadge } from "../badges";
import type { TRiskScaleField } from "../constants";
import { getRiskScaleLabel, RISK_I18N, riskCategoryLabelKey, riskStrategyLabelKey } from "../constants";

/**
 * 时间线上的一行：左边 28px 轨道放节点，右边正文。风险没有阶段概念，轨道一律灰色；
 * 底座复用阶段评审那套 `TimelineRailRow`（它不绑定状态类型）。
 */
export const RiskTimelineRow = (props: {
  isFirst: boolean;
  isLast: boolean;
  node: ReactNode;
  nodeCenter: number;
  className?: string;
  children: ReactNode;
}) => <TimelineRailRow {...props} railBefore="border-subtle" railAfter="border-subtle" />;

/** 行上下各 4px，节点盒 28px：圆心离行顶 18px */
const ACTIVITY_NODE_CENTER = 18;

/** 轨迹记的是模型列名，展示要走人读的字段 key */
const FIELD_I18N: Record<string, string> = {
  description_html: "description",
  impact_description_html: "impact_description",
  response_measures_html: "response_measures",
};

/** 只记「改了」的富文本字段：不存值，只写「修改了 xx」 */
const RICH_TEXT_FIELDS = ["description_html", "impact_description_html", "response_measures_html"];
const MEMBER_FIELDS = ["proposer", "owner"];
const DATE_FIELDS = ["proposed_date", "planned_handle_date", "actual_close_date"];
const SCALE_FIELDS = ["impact_level", "probability"];

const asStatus = (value: string | null) =>
  value && (RISK_STATUSES as string[]).includes(value) ? (value as ERiskStatus) : null;
const asLevel = (value: string | null) =>
  value && (RISK_LEVELS as string[]).includes(value) ? (value as ERiskLevel) : null;

/**
 * 一条轨迹里的值怎么显示：枚举翻文案（状态 / 等级画成徽章）、人员 id 翻名字、
 * 日期按本地格式、布尔翻 是 / 否，其余原样。
 */
const useDisplayValue = () => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  return (field: string, value: string): ReactNode => {
    if (field === "status") {
      const status = asStatus(value);
      return status ? <RiskStatusBadge status={status} /> : value;
    }
    if (field === "risk_level") {
      const level = asLevel(value);
      return level ? <RiskLevelBadge level={level} /> : value;
    }
    if (field === "category") return t(riskCategoryLabelKey(value as ERiskCategory), { defaultValue: value });
    if (field === "strategy") return t(riskStrategyLabelKey(value as ERiskStrategy), { defaultValue: value });
    if (SCALE_FIELDS.includes(field)) {
      const scale = Number(value);
      return scale >= 1 && scale <= 5 ? getRiskScaleLabel(t, field as TRiskScaleField, scale as TRiskScale) : value;
    }
    if (field === "is_in_risk_production") {
      return t(`${RISK_I18N}.yes_no.${value.toLowerCase() === "true" ? "yes" : "no"}`);
    }
    if (MEMBER_FIELDS.includes(field)) {
      return getUserDetails(value)?.display_name ?? t(`${RISK_I18N}.activity.unknown_user`);
    }
    if (DATE_FIELDS.includes(field)) return renderFormattedDate(value) ?? value;
    return value;
  };
};

const Value = ({ children, muted = false }: { children: ReactNode; muted?: boolean }) => (
  <span className={cn("inline-flex min-w-0 items-center font-medium break-all", muted ? "text-tertiary" : "text-primary")}>
    {children}
  </span>
);

/** 「旧 → 新」：有旧值才画箭头 */
const Transition = ({ from, to }: { from: ReactNode | null; to: ReactNode }) => (
  <>
    {from !== null && (
      <>
        <Value muted>{from}</Value>
        <ArrowRight className="size-3 shrink-0 text-placeholder" aria-hidden />
      </>
    )}
    <Value>{to}</Value>
  </>
);

/**
 * 变更历史的一条：灰点 + 一句 13px 的话 + 右侧时间。句式按 `TRiskActivity` 的注释来：
 * 普通字段「把{字段}从 旧 → 新」（没旧值是「设为」、没新值是「清空了」）；等级自动重算
 * 「风险等级随之从 中 → 高」；富文本「修改了{字段}」；干系人 / 缺陷 / 附件各自一句加对象。
 */
export const RiskActivityRow = ({
  activity,
  issues,
  isFirst,
  isLast,
}: {
  activity: TRiskActivity;
  /** 关联 / 解除缺陷的记录只存了工作项 id，还在名单里的能补出编号 + 标题 */
  issues: TRiskLinkedIssue[];
  isFirst: boolean;
  isLast: boolean;
}) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const displayValue = useDisplayValue();
  const field = activity.field ?? "";
  const fieldLabel = t(`${RISK_I18N}.fields.${FIELD_I18N[field] ?? field}`, { defaultValue: field });
  const isAutoLevel = field === "risk_level" && activity.extra?.auto === true;
  const actor = (
    <span className="font-medium text-primary">
      {activity.actor_detail?.display_name ?? t(`${RISK_I18N}.activity.unknown_user`)}
    </span>
  );

  const memberName = (userId: string | null) =>
    (userId && getUserDetails(userId)?.display_name) || t(`${RISK_I18N}.activity.unknown_user`);
  const issueLabel = (issueId: string | null) => {
    const issue = issues.find((item) => item.id === issueId);
    return issue ? (
      <Value>
        <span className="mr-1.5 font-mono text-12 text-secondary tabular-nums">
          {issue.project_identifier}-{issue.sequence_id}
        </span>
        <span className="truncate">{issue.name}</span>
      </Value>
    ) : null;
  };

  let body: ReactNode;
  if (isAutoLevel) {
    // 等级是影响程度 / 发生概率改动带出来的，不写人，紧跟在触发它的那条后面
    body = (
      <>
        <span>{t(`${RISK_I18N}.activity.level_auto`)}</span>
        <Transition
          from={activity.old_value ? displayValue(field, activity.old_value) : null}
          to={activity.new_value ? displayValue(field, activity.new_value) : "—"}
        />
      </>
    );
  } else if (activity.verb === "created" && !activity.field) {
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.created`)}</span>
      </>
    );
  } else if (field === "stakeholders") {
    const added = activity.verb === "added";
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.${added ? "added_stakeholder" : "removed_stakeholder"}`)}</span>
        <Value>{memberName(added ? activity.new_identifier : activity.old_identifier)}</Value>
      </>
    );
  } else if (field === "issues") {
    const added = activity.verb === "added";
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.${added ? "added_issue" : "removed_issue"}`)}</span>
        {issueLabel(added ? activity.new_identifier : activity.old_identifier)}
      </>
    );
  } else if (field === "attachment") {
    const removed = activity.verb === "deleted";
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.${removed ? "removed_attachment" : "added_attachment"}`)}</span>
        <Value>{activity.new_value || activity.old_value || ""}</Value>
      </>
    );
  } else if (RICH_TEXT_FIELDS.includes(field)) {
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.edited`, { field: fieldLabel })}</span>
      </>
    );
  } else if (activity.old_value && activity.new_value) {
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.changed`, { field: fieldLabel })}</span>
        <Transition from={displayValue(field, activity.old_value)} to={displayValue(field, activity.new_value)} />
      </>
    );
  } else if (activity.new_value) {
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.set`, { field: fieldLabel })}</span>
        <Value>{displayValue(field, activity.new_value)}</Value>
      </>
    );
  } else if (activity.old_value) {
    body = (
      <>
        {actor}
        <span>{t(`${RISK_I18N}.activity.cleared`, { field: fieldLabel })}</span>
      </>
    );
  } else {
    // 认不出的记录：照后端文案写
    body = (
      <>
        {actor}
        <span>{activity.comment}</span>
      </>
    );
  }

  return (
    <RiskTimelineRow
      isFirst={isFirst}
      isLast={isLast}
      nodeCenter={ACTIVITY_NODE_CENTER}
      className="py-1"
      node={
        <span className="grid size-7 place-items-center">
          <span
            className={cn(
              "size-2 rounded-full shadow-[0_0_0_3px_var(--bg-surface-1)]",
              isAutoLevel ? "bg-orange-400" : "bg-layer-3"
            )}
          />
        </span>
      }
    >
      <div className="flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-secondary">
        {body}
        <HistoryTime value={activity.created_at} className="ml-auto pl-2" />
      </div>
    </RiskTimelineRow>
  );
};
