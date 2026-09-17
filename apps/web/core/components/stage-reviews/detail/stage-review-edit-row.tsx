import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlignLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ListOrdered,
  Package,
  Paperclip,
  PencilLine,
  Type,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity } from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import type { TTimelineRowPosition } from "./stage-review-timeline-rail";
import { TimelineRow } from "./stage-review-timeline-rail";

const I18N = "stage_review";

/** 行上下各 2px，节点盒 28px：圆心离行顶 16px */
const EDIT_NODE_CENTER = 16;

/** 轨迹记的是模型列名，展示要走人读的字段 key */
const ACTIVITY_FIELD_I18N: Record<string, string> = {
  description_html: "description",
};

const FIELD_ICON: Record<string, LucideIcon> = {
  title: Type,
  description_html: AlignLeft,
  work_instruction: ListOrdered,
  leader: UserRound,
  auditor: UserRoundCheck,
  start_date: CalendarDays,
  end_date: CalendarDays,
  attachment: Paperclip,
  akf_code: Package,
  production_quantity: Package,
  product_config: Package,
  baseline_archive_code: Package,
  components: Package,
  component_version: Package,
};

/** 只记「改了」的长文本字段：不存值，只写「更新了」 */
const TEXT_ONLY_FIELDS = ["description_html", "work_instruction"];
const MEMBER_FIELDS = ["leader", "auditor"];
const DATE_FIELDS = ["start_date", "end_date"];

const useFieldLabel = () => {
  const { t } = useTranslation();
  return (field: string) => {
    const key = ACTIVITY_FIELD_I18N[field] ?? field;
    return field === "attachment"
      ? t(`${I18N}.detail.attachments_title`)
      : t(`${I18N}.fields.${key}`, { defaultValue: key });
  };
};

const display = (field: string, value: string) =>
  DATE_FIELDS.includes(field) ? (renderFormattedPayloadDate(value) ?? value) : value;

/** 老的负责人 / 审核者记录值是「用户名 <邮箱>」且没有 identifier，不露那串值 */
const isValueHidden = (activity: TStageReviewActivity) =>
  TEXT_ONLY_FIELDS.includes(activity.field ?? "") ||
  (MEMBER_FIELDS.includes(activity.field ?? "") &&
    !activity.old_identifier &&
    !activity.new_identifier &&
    !!activity.new_value);

/** 句子里的值：新值加深，旧值划线；太长截断，悬停看全 */
const Value = ({ children, old = false }: { children: string; old?: boolean }) => (
  <span
    title={children}
    className={cn(
      "inline-block max-w-[240px] truncate align-bottom",
      old ? "text-placeholder line-through" : "font-medium text-primary"
    )}
  >
    {children}
  </span>
);

const Arrow = () => <ArrowRight className="size-3 shrink-0 text-placeholder" aria-hidden />;

/** 一条修改写成一句话（单条时用）：「把结束日期从 A → B」「上传了附件 X」「更新了描述」 */
const EditSentence = ({ activity }: { activity: TStageReviewActivity }) => {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel();
  const field = activity.field ?? "";

  if (field === "attachment") {
    const isDeleted = activity.verb === "deleted";
    const name = (isDeleted ? activity.old_value : activity.new_value) ?? "";
    return (
      <>
        <span>{t(`${I18N}.activity.${isDeleted ? "attachment_deleted" : "attachment_created"}`)}</span>
        {name && <Value old={isDeleted}>{name}</Value>}
      </>
    );
  }

  const label = fieldLabel(field);
  const { old_value: oldValue, new_value: newValue } = activity;
  if (isValueHidden(activity) || (!oldValue && !newValue)) {
    return <span>{t(`${I18N}.activity.updated_plain`, { field: label })}</span>;
  }
  if (oldValue && newValue) {
    return (
      <>
        <span>{t(`${I18N}.activity.change_from`, { field: label })}</span>
        <Value old>{display(field, oldValue)}</Value>
        <Arrow />
        <Value>{display(field, newValue)}</Value>
      </>
    );
  }
  if (newValue) {
    return (
      <>
        <span>{t(`${I18N}.activity.set_to`, { field: label })}</span>
        <Value>{display(field, newValue)}</Value>
      </>
    );
  }
  return (
    <>
      <span>{t(`${I18N}.activity.cleared`, { field: label })}</span>
      <Value old>{display(field, oldValue ?? "")}</Value>
    </>
  );
};

/** 展开后的一项：图标 + 字段名 | 旧值划线 → 新值 */
const EditDetailItem = ({ activity }: { activity: TStageReviewActivity }) => {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel();
  const field = activity.field ?? "";
  const Icon = FIELD_ICON[field] ?? PencilLine;
  const { old_value: oldValue, new_value: newValue } = activity;

  let value: ReactNode;
  if (field === "attachment") {
    value =
      activity.verb === "deleted" ? (
        <Value old>{oldValue ?? ""}</Value>
      ) : (
        <Value>{`+ ${newValue ?? ""}`}</Value>
      );
  } else if (isValueHidden(activity) || (!oldValue && !newValue)) {
    value = <span className="text-tertiary">{t(`${I18N}.activity.content_updated`)}</span>;
  } else {
    value = (
      <>
        {oldValue && <Value old>{display(field, oldValue)}</Value>}
        {oldValue && <Arrow />}
        {newValue ? <Value>{display(field, newValue)}</Value> : <span className="text-placeholder">—</span>}
      </>
    );
  }

  return (
    <li className="grid min-h-6.5 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-13 text-tertiary">
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-placeholder" />
        <span className="truncate">{fieldLabel(field)}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">{value}</span>
    </li>
  );
};

/**
 * 修改轨迹的一行：8px 灰点 + 13px 灰字，视觉上让位给状态节点和评论。
 *
 * 连续修改（同一人、相邻不超过 10 分钟，分组在 hook 里做）合成一条：
 * - 只有一条 → 直接一句话；
 * - 全是同一种附件动作（一次传了几个）→ 一句话列出文件名；
 * - 其余 → 「修改了 N 项」+ 字段名标签，点开逐项看旧值 → 新值。
 */
export const StageReviewEditRow = ({
  activities,
  position,
}: {
  activities: TStageReviewActivity[];
  position: TTimelineRowPosition;
}) => {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel();
  const [isOpen, setIsOpen] = useState(false);
  const first = activities[0];
  const last = activities[activities.length - 1];

  const isSameAttachmentAction =
    activities.length > 1 && activities.every((item) => item.field === "attachment" && item.verb === first.verb);
  const isGroup = activities.length > 1 && !isSameAttachmentAction;
  const fieldLabels = Array.from(new Set(activities.map((item) => fieldLabel(item.field ?? ""))));

  let sentence: ReactNode;
  if (isSameAttachmentAction) {
    const isDeleted = first.verb === "deleted";
    sentence = (
      <>
        <span>{t(`${I18N}.activity.${isDeleted ? "attachment_deleted" : "attachment_created"}`)}</span>
        {activities.map((item) => {
          const name = (isDeleted ? item.old_value : item.new_value) ?? "";
          return name ? (
            <Value key={item.id} old={isDeleted}>
              {name}
            </Value>
          ) : null;
        })}
      </>
    );
  } else if (isGroup) {
    sentence = (
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="-mx-1 flex min-w-0 flex-wrap items-center gap-1.5 rounded-md px-1 text-left transition hover:bg-layer-1"
      >
        <span>{t(`${I18N}.activity.edits_count`, { count: activities.length })}</span>
        {!isOpen &&
          fieldLabels.map((label) => (
            <span key={label} className="rounded-md bg-layer-1 px-1.5 text-12 leading-5 text-secondary">
              {label}
            </span>
          ))}
        <ChevronRight className={cn("size-3.5 text-placeholder transition-transform", isOpen && "rotate-90")} />
      </button>
    );
  } else {
    sentence = <EditSentence activity={first} />;
  }

  return (
    <TimelineRow
      item={position.rail}
      isFirst={position.isFirst}
      isLast={position.isLast}
      nodeCenter={EDIT_NODE_CENTER}
      className="py-0.5"
      node={<span className="size-2 rounded-full bg-(--text-color-placeholder) shadow-[0_0_0_3px_var(--bg-surface-1)]" />}
    >
      <div className="flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-13 text-tertiary">
        <span className="font-medium text-primary">
          {first.actor_detail?.display_name ?? t(`${I18N}.activity.system`)}
        </span>
        {sentence}
        <HistoryTime value={last.created_at} className="ml-auto pl-2" />
      </div>
      {isGroup && isOpen && (
        <ul className="mt-0.5 mb-1.5 flex flex-col border-l-2 border-subtle pl-3">
          {activities.map((item) => (
            <EditDetailItem key={item.id} activity={item} />
          ))}
        </ul>
      )}
    </TimelineRow>
  );
};
