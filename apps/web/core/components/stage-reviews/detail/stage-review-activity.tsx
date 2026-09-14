import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlignLeft,
  ArrowRight,
  CalendarDays,
  CircleDot,
  CircleX,
  ClipboardCheck,
  FilePlus2,
  ListOrdered,
  Package,
  Paperclip,
  Type,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity, TStageReviewDetail } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { StageReviewStatusIcon } from "../status-icon";

const I18N = "stage_review";

/** 轨迹记的是模型列名，展示要走人读的字段 key */
const ACTIVITY_FIELD_I18N: Record<string, string> = {
  description_html: "description",
};

const FIELD_ICON: Record<string, LucideIcon> = {
  status: CircleDot,
  result: ClipboardCheck,
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

/** 只记「改了」的长文本字段：时间线也只写「更新了描述」，同工作项 */
const TEXT_ONLY_FIELDS = ["description_html", "work_instruction"];
const MEMBER_FIELDS = ["leader", "auditor"];
const DATE_FIELDS = ["start_date", "end_date"];
const STATUSES = Object.values(EStageReviewStatus) as string[];

/** 单条外壳：竖线 + 28px 图标方块 + 一行文字 + 相对时间，与工作项活动的一条同一个结构 */
const RowShell = ({
  icon: Icon,
  iconClassName,
  actor,
  at,
  children,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  actor?: string;
  at: string;
  children: ReactNode;
}) => (
  <li className="relative flex items-start gap-3 py-2">
    <span className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
    <span
      className={cn(
        "relative z-[3] grid size-7 shrink-0 place-items-center rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100",
        iconClassName
      )}
    >
      <Icon className="size-3.5" />
    </span>
    <div className="flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-13 text-secondary">
      {actor && <span className="font-medium text-primary">{actor}</span>}
      {children}
      <HistoryTime value={at} className="ml-1" />
    </div>
  </li>
);

/** 句子里加粗的值；太长截断，悬停看全 */
const Value = ({ children }: { children: string }) => (
  <span className="inline-block max-w-[240px] truncate align-bottom font-medium text-primary" title={children}>
    {children}
  </span>
);

const StatusValue = ({ status }: { status: string | null }) => {
  const { t } = useTranslation();
  if (!status || !STATUSES.includes(status)) return <Value>{status ?? "—"}</Value>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-primary">
      <StageReviewStatusIcon status={status as EStageReviewStatus} className="size-3.5" />
      {t(`${I18N}.status.${status}`)}
    </span>
  );
};

/**
 * 一条轨迹翻成一句话，旧值与新值直接写进句子：「把负责人从 A 改为 B」。
 *
 * 老记录（这次改版前写的）没有旧值，退化成「把 X 设为 新值」；老的负责人 / 审核者记录
 * 值是「用户名 <邮箱>」且没有 identifier，只写「更新了负责人」不露那串值。
 */
const useActivitySentence = () => {
  const { t } = useTranslation();

  const fieldLabel = (field: string) => {
    const key = ACTIVITY_FIELD_I18N[field] ?? field;
    return t(`${I18N}.fields.${key}`, { defaultValue: key });
  };
  const display = (field: string, value: string) => (DATE_FIELDS.includes(field) ? renderFormattedDate(value) : value);

  return (activity: TStageReviewActivity): ReactNode => {
    const field = activity.field ?? "";

    if (field === "status") {
      return (
        <>
          <span>{activity.comment}</span>
          <StatusValue status={activity.old_value} />
          <ArrowRight className="size-3 text-placeholder" aria-hidden />
          <StatusValue status={activity.new_value} />
        </>
      );
    }

    if (field === "result") {
      const reason = activity.extra?.conditional_reason;
      return (
        <>
          <span className="font-medium text-danger-primary">{activity.comment}</span>
          {typeof reason === "string" && reason && <span className="min-w-0 break-words">{reason}</span>}
        </>
      );
    }

    if (field === "attachment") {
      const isDeleted = activity.verb === "deleted";
      const name = (isDeleted ? activity.old_value : activity.new_value) ?? "";
      return (
        <>
          <span>{t(`${I18N}.activity.${isDeleted ? "attachment_deleted" : "attachment_created"}`)}</span>
          {name && <Value>{name}</Value>}
        </>
      );
    }

    const label = fieldLabel(field);
    const isLegacyMember =
      MEMBER_FIELDS.includes(field) && !activity.old_identifier && !activity.new_identifier && activity.new_value;
    if (TEXT_ONLY_FIELDS.includes(field) || isLegacyMember) {
      return <span>{t(`${I18N}.activity.updated_plain`, { field: label })}</span>;
    }

    const { old_value: oldValue, new_value: newValue } = activity;
    if (oldValue && newValue) {
      return (
        <>
          <span>{t(`${I18N}.activity.change_from`, { field: label })}</span>
          <Value>{display(field, oldValue)}</Value>
          <span>{t(`${I18N}.activity.change_to`)}</span>
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
    if (oldValue) {
      return (
        <>
          <span>{t(`${I18N}.activity.cleared`, { field: label })}</span>
          <span>
            （{t(`${I18N}.activity.was`)} <Value>{display(field, oldValue)}</Value>）
          </span>
        </>
      );
    }
    return <span>{t(`${I18N}.activity.updated_plain`, { field: label })}</span>;
  };
};

/** 时间线上的一条变更记录 */
export const StageReviewActivityRow = ({ activity }: { activity: TStageReviewActivity }) => {
  const { t } = useTranslation();
  const buildSentence = useActivitySentence();
  const isRejected = activity.field === "result" && activity.new_value === EStageReviewResult.REJECTED;

  return (
    <RowShell
      icon={isRejected ? CircleX : (FIELD_ICON[activity.field ?? ""] ?? Activity)}
      iconClassName={isRejected ? "text-danger-primary" : undefined}
      actor={activity.actor_detail?.display_name ?? t(`${I18N}.activity.system`)}
      at={activity.created_at}
    >
      {buildSentence(activity)}
    </RowShell>
  );
};

/**
 * 时间线的第一条「创建」。裁剪表生成的评审后端没有创建记录，所以前端按 created_at 补；
 * 文案按来源分，不写人 —— 裁剪生成是签批生效触发的，写成某个人反而不对。
 */
export const StageReviewCreatedRow = ({ detail }: { detail: TStageReviewDetail }) => {
  const { t } = useTranslation();
  return (
    <RowShell icon={FilePlus2} at={detail.created_at}>
      <span>{t(`${I18N}.activity.${detail.is_manual ? "created_manual" : "created_tailoring"}`)}</span>
    </RowShell>
  );
};
