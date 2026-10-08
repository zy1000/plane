import type { LucideIcon } from "lucide-react";
import { ArrowRight, Box, CalendarDays, ClipboardCheck, Factory, Flag, Truck, UserRound, UserRoundCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductionMode, TShipmentAssessment, TStageReviewDetail, TUpdateStageReviewPayload } from "@plane/types";
import { STAGE_REVIEW_ACTIVITY_KINDS } from "@plane/types";
import { cn, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { StageReviewResultBadge } from "../badges";
import type { TOStageField, TOStageFieldValue } from "../o-stage-fields";
import { OStageFieldSelect, OStageValue, STAGE_REVIEW_O_STAGE_KINDS } from "../o-stage-fields";
import { RoleMemberSelect } from "./role-member-select";
import { INLINE_FIELD_CLASS } from "./stage-review-content";
import { StageSelect } from "./stage-select";

const I18N = "stage_review";

/**
 * 一组属性一张白卡片：标题 + 若干行。右栏灰底上排几张卡片，内容多少都不挤，
 * 下方剩下的就是底色，不会显得空了一截。卡片里不再套有底色的块（会像两层卡片）。
 */
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col rounded-xl border border-subtle bg-surface-1 px-3.5 pt-0.5 pb-2">
    <h5 className="flex h-9.5 items-center text-12 font-semibold tracking-wide text-tertiary">{title}</h5>
    {children}
  </section>
);

/**
 * 一行一项：图标 + 标签固定 96px，值靠左成一列，行高 38 —— 标签 13 号灰、值 14 号黑，与正文同一把尺子。
 * `required` 在标签后挂红星。
 */
const Row = ({
  icon: Icon,
  label,
  required = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="grid min-h-9.5 grid-cols-[96px_minmax(0,1fr)] items-center">
    <span className="flex items-center gap-2 text-13 text-tertiary">
      <Icon className="size-3.75 shrink-0 text-placeholder" strokeWidth={1.8} />
      <span>
        {label}
        {required && <span className="ml-0.5 text-danger-primary">*</span>}
      </span>
    </span>
    <div className="min-w-0 text-14 text-primary">{children}</div>
  </div>
);

/** 中文界面日期写成「2026年9月18日」，其它语言沿用 renderFormattedDate 的默认格式 */
const fullDateToken = (locale: string) => (locale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined);

/** 计划日期两个日期挤在一行：中文今年的省掉年份（「10月8日」），跨年才写全 */
const planDateToken = (value: string | null, locale: string) => {
  if (!locale.toLowerCase().startsWith("zh")) return undefined;
  return value && getDate(value)?.getFullYear() === new Date().getFullYear() ? "M月d日" : "yyyy年M月d日";
};

/**
 * 模板角色快照：负责人 / 审核人还没指定时，跟在「指定负责人」后面的小标签，告诉用户该去找哪个岗位。
 * 只是提示 —— 角色不是人，候选人在下拉里（按角色排在前面）。
 */
const RoleHint = ({ role }: { role: string }) => {
  const { t } = useTranslation();
  return (
    <span
      title={`${t(`${I18N}.detail.role_suggested`)} ${role}`}
      className="inline-flex h-5.5 min-w-0 items-center gap-1 rounded-md bg-accent-subtle px-1.5 text-12 text-accent-primary"
    >
      <span className="shrink-0">{t(`${I18N}.detail.role_suggested`)}</span>
      <span className="truncate font-medium">{role}</span>
    </span>
  );
};

/** 计划日期里的一个日期：能改是紧凑的日期按钮，不能改是纯文本 */
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
  const { currentLocale } = useTranslation();
  const formatToken = planDateToken(value, currentLocale);
  if (!editable) {
    return (
      <span className={cn("tabular-nums", !value && "text-placeholder")}>
        {value ? renderFormattedDate(value, formatToken) : "—"}
      </span>
    );
  }
  return (
    <DateDropdown
      value={getDate(value)}
      minDate={getDate(minDate)}
      maxDate={getDate(maxDate)}
      onChange={(next) => onChange(next ? renderFormattedPayloadDate(next) : null)}
      placeholder={placeholder}
      formatToken={formatToken}
      buttonVariant="transparent-with-text"
      buttonContainerClassName="text-left"
      buttonClassName={cn(
        "group h-7 gap-1 rounded-md border border-transparent bg-transparent px-1.5 text-14 tabular-nums hover:bg-layer-1",
        !value && "text-placeholder"
      )}
      // 叉号平时不占位，悬停才出：不然「10月8日」后面总空着一截，和箭头另一侧不对称
      clearIconClassName="hidden group-hover:block"
      hideIcon
      isClearable
    />
  );
};

/** 生产方式 / 出货评估的一格：能改是下拉（空值灰字「设置…」），不能改是纯文本 */
const OStageFieldValue = ({
  field,
  value,
  editable,
  onChange,
}: {
  field: TOStageField;
  value: TOStageFieldValue | "";
  editable: boolean;
  onChange: (value: TOStageFieldValue) => void;
}) => {
  const { t } = useTranslation();
  if (!editable) return value ? <OStageValue field={field} value={value} /> : <span className="text-placeholder">—</span>;
  return (
    <OStageFieldSelect
      field={field}
      value={value}
      placeholder={t(`${I18N}.detail.set_${field}`)}
      buttonClassName={INLINE_FIELD_CLASS}
      onChange={onChange}
    />
  );
};

/**
 * 抽屉右栏：「要查的东西」——灰底上几张白卡片（基本信息 / 人员与计划 / 生产与出货 / 结论），
 * 末尾一行小字是来源。
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
  const { t, currentLocale } = useTranslation();
  const isOStage = STAGE_REVIEW_O_STAGE_KINDS.includes(detail.kind);

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-3 overflow-y-auto bg-layer-1 p-4",
        // 窄屏时属性栏落到正文下面，分隔线跟着从左边转到上边
        "border-t border-subtle lg:w-[336px] lg:border-t-0 lg:border-l"
      )}
    >
      <Card title={t(`${I18N}.detail.basic_info`)}>
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
      </Card>

      <Card title={t(`${I18N}.detail.people_plan`)}>
        <Row icon={UserRound} label={t(`${I18N}.fields.leader`)}>
          <RoleMemberSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            reviewId={detail.id}
            role="leader"
            value={detail.leader_ids}
            valueDetail={detail.leader_details}
            disabled={!editable}
            hint={detail.leader_ids.length === 0 && detail.leader_role && <RoleHint role={detail.leader_role} />}
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
            hint={detail.auditor_ids.length === 0 && detail.auditor_role && <RoleHint role={detail.auditor_role} />}
            onChange={(userIds) => onUpdate({ auditor_ids: userIds })}
          />
        </Row>
        {/* 开始 → 结束合成一行；开始不能晚于结束，反过来同理 —— 后端 clean() 也会拦，这里先挡住 */}
        <Row icon={CalendarDays} label={t(`${I18N}.fields.plan_date`)}>
          {!editable && !detail.start_date && !detail.end_date ? (
            <span className="text-placeholder">—</span>
          ) : (
            // 能改时日期按钮左右有内边距，往左收一点让文字和上下行的值对齐
            <span className={cn("flex flex-wrap items-center gap-x-0.5", editable && "-ml-1.5")}>
              <PlanDate
                value={detail.start_date}
                maxDate={detail.end_date}
                editable={editable}
                placeholder={t(`${I18N}.fields.start_date`)}
                onChange={(next) => onUpdate({ start_date: next })}
              />
              <ArrowRight className="mx-0.5 size-3.5 shrink-0 text-placeholder" aria-hidden />
              <PlanDate
                value={detail.end_date}
                minDate={detail.start_date}
                editable={editable}
                placeholder={t(`${I18N}.fields.end_date`)}
                onChange={(next) => onUpdate({ end_date: next })}
              />
            </span>
          )}
        </Row>
      </Card>

      {/* O 阶段两种类型常驻：随时可改、不能清空，提交审核前必须填好（2026-10-08）；已评审只读 */}
      {isOStage && (
        <Card title={t(`${I18N}.detail.production_group`)}>
          <Row icon={Factory} label={t(`${I18N}.fields.production_mode`)} required>
            <OStageFieldValue
              field="production_mode"
              value={detail.production_mode}
              editable={editable}
              onChange={(next) => onUpdate({ production_mode: next as TProductionMode })}
            />
          </Row>
          <Row icon={Truck} label={t(`${I18N}.fields.shipment_assessment`)} required>
            <OStageFieldValue
              field="shipment_assessment"
              value={detail.shipment_assessment}
              editable={editable}
              onChange={(next) => onUpdate({ shipment_assessment: next as TShipmentAssessment })}
            />
          </Row>
        </Card>
      )}

      <Card title={t(`${I18N}.detail.conclusion`)}>
        <Row icon={ClipboardCheck} label={t(`${I18N}.table.result`)}>
          {detail.result ? (
            <StageReviewResultBadge result={detail.result} />
          ) : (
            <span className="text-placeholder">{t(`${I18N}.detail.result_pending`)}</span>
          )}
        </Row>
        {/* 结论说明：四种结论都可能有（通过是选填）。细线隔开、文字直接写在卡片里，不再套色块 */}
        {detail.conditional_reason && (
          <div className="mt-1.5 mb-1 flex flex-col gap-1 border-t border-subtle pt-2.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.fields.conditional_reason`)}</span>
            <p className="text-13 leading-relaxed break-words whitespace-pre-wrap text-secondary">
              {detail.conditional_reason}
            </p>
          </div>
        )}
      </Card>

      {/* 来源与创建时间：查证用的一行小字，跟在卡片后面，不钉到最底 */}
      <p className="px-1 text-12 leading-relaxed text-placeholder">
        {detail.is_manual ? t(`${I18N}.detail.source_manual`) : t(`${I18N}.detail.source_tailoring`)}
        {" · "}
        <span className="tabular-nums">
          {t(`${I18N}.detail.created_at`, {
            date: renderFormattedDate(detail.created_at, fullDateToken(currentLocale)),
          })}
        </span>
      </p>
    </aside>
  );
};
