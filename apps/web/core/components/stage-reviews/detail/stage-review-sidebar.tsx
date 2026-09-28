import type { LucideIcon } from "lucide-react";
import { Box, CalendarDays, ClipboardCheck, Flag, Layers, Package, UserRound, UserRoundCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewDetail, TUpdateStageReviewPayload } from "@plane/types";
import { EStageReviewKind, EStageReviewResult, STAGE_REVIEW_ACTIVITY_KINDS } from "@plane/types";
import { cn, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { StageReviewResultBadge } from "../badges";
import { RoleMemberSelect } from "./role-member-select";
import { INLINE_FIELD_CLASS } from "./stage-review-content";
import { StageSelect } from "./stage-select";

const I18N = "stage_review";

/** 生产方式与出货评估两种 O 阶段类型都有（成品与组件版本是正文里的两张表） */
const O_STAGE_KINDS: EStageReviewKind[] = [EStageReviewKind.O_STAGE_REVIEW, EStageReviewKind.O_STAGE_ACTIVITY];

const Group = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="flex flex-col border-b border-subtle pb-3 last:border-b-0">
    {title && <h5 className="flex h-7 items-center text-12 font-semibold tracking-wide text-tertiary">{title}</h5>}
    {children}
  </div>
);

/** 一行一项：图标 + 标签固定 96px，值靠左成一列，行高 32 —— 标签 13 号灰、值 14 号黑，与正文同一把尺子 */
const Row = ({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) => (
  <div className="grid min-h-8 grid-cols-[96px_minmax(0,1fr)] items-center">
    <span className="flex items-center gap-2 text-13 text-tertiary">
      <Icon className="size-3.75 shrink-0 text-placeholder" strokeWidth={1.8} />
      {label}
    </span>
    <div className="min-w-0 text-14 text-primary">{children}</div>
  </div>
);

/** 计划日期的一格：能改就是日期下拉，空值显示灰字「设置日期」；不能改就是纯文本 */
const PlanDate = ({
  value,
  minDate,
  maxDate,
  editable,
  placeholder,
  onChange,
}: {
  value: string | null;
  minDate?: string | null;
  maxDate?: string | null;
  editable: boolean;
  placeholder: string;
  onChange: (next: string | null) => void;
}) => {
  if (!editable) {
    return <span className={cn("tabular-nums", !value && "text-placeholder")}>{value ? renderFormattedDate(value) : "—"}</span>;
  }
  return (
    <DateDropdown
      value={getDate(value)}
      minDate={getDate(minDate)}
      maxDate={getDate(maxDate)}
      onChange={(next) => onChange(next ? renderFormattedPayloadDate(next) : null)}
      placeholder={placeholder}
      buttonVariant="transparent-with-text"
      // 外层按钮不给宽度会收缩到比文字还窄，里面的 truncate 就把日期截成一半（工作项侧栏同样要传 w-full）
      buttonContainerClassName="w-full text-left"
      buttonClassName={cn(INLINE_FIELD_CLASS, !value && "text-placeholder")}
      hideIcon
      isClearable
    />
  );
};

/**
 * 抽屉右栏：「要查的东西」——属性与结论，底下两行小字是来源。
 *
 * 和正文分开的理由很简单：产品、阶段、负责人、日期这些是**查**的，描述与工作指引是
 * **读**的。空值是灰字动词（指定负责人 / 设置日期），悬停才出底色，不画成空输入框。
 *
 * 状态与结论都不在这里改：状态只能由标题行的按钮一步步推进，结论只在「提交审核」那一刻
 * 写入（见 utils/stage_review.py）。这里只显示。
 */
export const StageReviewSidebar = ({
  workspaceSlug,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  workspaceSlug: string;
  projectId: string;
  detail: TStageReviewDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const isOStage = O_STAGE_KINDS.includes(detail.kind);

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-3 overflow-y-auto bg-layer-1 px-5 py-4",
        // 窄屏时属性栏落到正文下面，分隔线跟着从左边转到上边
        "border-t border-subtle lg:w-[312px] lg:border-t-0 lg:border-l"
      )}
    >
      <Group>
        <Row icon={Box} label={t(`${I18N}.fields.product`)}>
          <span className="block truncate">{detail.product_detail?.name ?? "—"}</span>
        </Row>
        <Row icon={Flag} label={t(`${I18N}.fields.stage`)}>
          {/* 只有手工评审的评审活动能在这里挪阶段；裁剪表生成的要走裁剪表修订 */}
          <StageSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            value={detail.stage_id}
            label={detail.stage_detail?.name ?? ""}
            editable={editable}
            lockReason={
              detail.template_id ? "tailoring" : STAGE_REVIEW_ACTIVITY_KINDS.includes(detail.kind) ? null : "summary"
            }
            onChange={(stageId) => onUpdate({ stage_id: stageId })}
          />
        </Row>
        <Row icon={UserRound} label={t(`${I18N}.fields.leader`)}>
          <RoleMemberSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            reviewId={detail.id}
            role="leader"
            value={detail.leader_ids}
            valueDetail={detail.leader_details}
            disabled={!editable}
            onChange={(userIds) => onUpdate({ leader_ids: userIds })}
          />
        </Row>
        <Row icon={UserRoundCheck} label={t(`${I18N}.fields.auditor`)}>
          <RoleMemberSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            reviewId={detail.id}
            role="auditor"
            value={detail.auditor_ids}
            valueDetail={detail.auditor_details}
            disabled={!editable}
            onChange={(userIds) => onUpdate({ auditor_ids: userIds })}
          />
        </Row>
        {/* 开始 / 结束各占一行；开始不能晚于结束，反过来同理 —— 后端 clean() 也会拦，这里先挡住 */}
        <Row icon={CalendarDays} label={t(`${I18N}.fields.start_date`)}>
          <PlanDate
            value={detail.start_date}
            maxDate={detail.end_date}
            editable={editable}
            placeholder={t(`${I18N}.detail.set_date`)}
            onChange={(next) => onUpdate({ start_date: next })}
          />
        </Row>
        <Row icon={CalendarDays} label={t(`${I18N}.fields.end_date`)}>
          <PlanDate
            value={detail.end_date}
            minDate={detail.start_date}
            editable={editable}
            placeholder={t(`${I18N}.detail.set_date`)}
            onChange={(next) => onUpdate({ end_date: next })}
          />
        </Row>
      </Group>

      <Group title={t(`${I18N}.detail.conclusion`)}>
        <Row icon={ClipboardCheck} label={t(`${I18N}.table.result`)}>
          {detail.result ? (
            <StageReviewResultBadge result={detail.result} />
          ) : (
            <span className="text-placeholder">{t(`${I18N}.detail.result_pending`)}</span>
          )}
        </Row>
        {/* 结论说明：四种结论都可能有（通过是选填），不通过标红、条件通过标琥珀，其余中性 */}
        {detail.conditional_reason && (
          <p
            className={cn(
              "mt-1.5 mb-1 rounded-r-lg border-l-2 px-3 py-2 text-13 leading-relaxed break-words",
              "border-subtle bg-layer-2 text-secondary",
              detail.result === EStageReviewResult.REJECTED &&
                "border-danger-strong bg-danger-subtle text-danger-primary",
              detail.result === EStageReviewResult.CONDITIONAL &&
                "border-warning-strong bg-warning-subtle text-warning-primary"
            )}
          >
            <b className="block font-semibold">{t(`${I18N}.fields.conditional_reason`)}</b>
            {detail.conditional_reason}
          </p>
        )}
        {isOStage && detail.production_mode && (
          <Row icon={Layers} label={t(`${I18N}.submit.production_mode`)}>
            {t(`${I18N}.production_mode.${detail.production_mode}`)}
          </Row>
        )}
        {isOStage && detail.shipment_assessment && (
          <Row icon={Package} label={t(`${I18N}.submit.shipment_assessment`)}>
            {t(`${I18N}.shipment_assessment.${detail.shipment_assessment}`)}
          </Row>
        )}
      </Group>

      {/* 来源、模板角色、创建时间：查证用的，压成底部两行小字 */}
      <p className="mt-auto pt-2 text-12 leading-relaxed text-placeholder">
        {[
          detail.is_manual ? t(`${I18N}.detail.source_manual`) : t(`${I18N}.detail.source_tailoring`),
          // 角色名是模板快照：负责人没解析出人时，至少知道该去找哪个岗位
          detail.leader_role && t(`${I18N}.detail.role_leader`, { role: detail.leader_role }),
          detail.auditor_role && t(`${I18N}.detail.role_auditor`, { role: detail.auditor_role }),
        ]
          .filter(Boolean)
          .join(" · ")}
        <br />
        <span className="tabular-nums">{t(`${I18N}.detail.created_at`, { date: renderFormattedDate(detail.created_at) })}</span>
      </p>
    </aside>
  );
};
