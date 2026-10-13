import { observer } from "mobx-react";
import { CalendarCheck, CalendarDays, CircleDot, Factory, Tag, UserRound, UserRoundCheck, UsersRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { ERiskCategory } from "@plane/types";
import { RISK_CATEGORIES, RISK_STATUSES } from "@plane/types";
import { CustomSearchSelect, CustomSelect } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import {
  MemberValueButton,
  PROPERTY_VALUE_CLASS,
  PROPERTY_VALUE_ERROR_CLASS,
  PropertyRailGroup,
  PropertyRailRow,
} from "@/components/common/form-modal";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { RiskStatusBadge } from "../badges";
import { RISK_I18N, riskCategoryLabelKey } from "../constants";
import type { TRiskFormPatch, TRiskFormValue } from "./risk-form-state";

/** 分段按钮：再点一次已选的那段就取消（这些字段都是选填） */
const Segmented = <T extends string | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null | "";
  onChange: (next: T | null) => void;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex h-7.5 gap-0.5 rounded-[9px] bg-layer-3 p-0.5">
    {options.map((option) => {
      const isSelected = value === option.value;
      return (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={isSelected}
          onClick={() => onChange(isSelected ? null : option.value)}
          className={cn(
            "rounded-[7px] px-3 text-13 whitespace-nowrap transition-colors",
            isSelected ? "bg-surface-1 font-semibold text-primary shadow-raised-100" : "text-secondary hover:text-primary"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** 右栏比产品 / 项目弹窗窄（340px），字段名列从 122px 收到 96px */
const ROW_CLASS = "grid-cols-[96px_minmax(0,1fr)]";

/**
 * 弹窗右栏：点选的部分，一行一项、不画输入框（同产品 / 项目弹窗的属性栏）。
 * 分基本信息（状态 / 类别 / 生产送样）、人员、日期三组；写字的字段和评估都在左栏。
 * 点过提交后还缺的必填项整格标红，缺几项一次全部标出来。
 */
export const RiskFormProperties = observer(function RiskFormProperties({
  projectId,
  value,
  patch,
  errors,
}: {
  projectId: string;
  value: TRiskFormValue;
  patch: TRiskFormPatch;
  /** 缺值错误：key 是表单字段，值是要显示的红字 */
  errors: Partial<Record<"proposerId" | "proposedDate" | "ownerId", string>>;
}) {
  const { t, currentLocale } = useTranslation();
  // 中文写成「2026年10月13日」，其它语言沿用默认格式
  const dateToken = currentLocale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined;
  const label = (key: string) => t(`${RISK_I18N}.fields.${key}`);

  const renderDate = (
    field: "proposedDate" | "plannedHandleDate" | "actualCloseDate",
    { required, placeholder, minDate, error }: { required: boolean; placeholder: string; minDate?: string | null; error?: string }
  ) => {
    const current = value[field];
    return (
      <DateDropdown
        value={getDate(current)}
        minDate={getDate(minDate) ?? undefined}
        onChange={(date) =>
          patch({ [field]: date ? (renderFormattedPayloadDate(date) ?? null) : null } as Partial<TRiskFormValue>)
        }
        buttonVariant="transparent-with-text"
        hideIcon
        isClearable={!required}
        placeholder={error ?? placeholder}
        formatToken={dateToken}
        className="w-full"
        buttonContainerClassName="w-full text-left"
        buttonClassName={cn("group tabular-nums", PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}
        labelClassName={cn("text-14 font-normal", !current && (error ? "text-danger-primary" : "text-placeholder"))}
        // 清除叉号平时不占位，悬停才出
        clearIconClassName="hidden size-3 group-hover:block"
      />
    );
  };

  const closeBeforeProposed = Boolean(
    value.actualCloseDate && value.proposedDate && value.actualCloseDate < value.proposedDate
  );

  const categoryOptions = [
    {
      value: "",
      query: t(`${RISK_I18N}.detail.unset`),
      content: <span className="text-placeholder">{t(`${RISK_I18N}.detail.unset`)}</span>,
    },
    ...RISK_CATEGORIES.map((category) => ({
      value: category,
      query: t(riskCategoryLabelKey(category)),
      content: t(riskCategoryLabelKey(category)),
    })),
  ];

  return (
    <div
      data-modal-wheel-scroll
      className="vertical-scrollbar scrollbar-sm flex min-w-0 flex-col gap-4.5 overscroll-contain border-subtle bg-surface-2 px-6 pt-5 pb-4 max-md:border-t md:overflow-y-auto md:border-l"
    >
      <PropertyRailGroup title={t(`${RISK_I18N}.groups.basic`)}>
        <PropertyRailRow icon={CircleDot} label={label("status")} required className={ROW_CLASS}>
          <CustomSelect
            value={value.status}
            onChange={(next: TRiskFormValue["status"]) => patch({ status: next })}
            customButton={
              <span className={PROPERTY_VALUE_CLASS}>
                <RiskStatusBadge status={value.status} />
              </span>
            }
            customButtonClassName="w-full"
            optionsClassName="z-[50]"
            maxHeight="lg"
          >
            {RISK_STATUSES.map((status) => (
              <CustomSelect.Option key={status} value={status}>
                <RiskStatusBadge status={status} />
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </PropertyRailRow>
        <PropertyRailRow icon={Tag} label={label("category")} className={ROW_CLASS}>
          <CustomSearchSelect
            value={value.category}
            options={categoryOptions}
            onChange={(next: ERiskCategory | "") => patch({ category: next })}
            customButton={
              <span className={PROPERTY_VALUE_CLASS}>
                {value.category ? (
                  <span className="truncate">{t(riskCategoryLabelKey(value.category))}</span>
                ) : (
                  <span className="truncate text-placeholder">{t(`${RISK_I18N}.form.select_placeholder`)}</span>
                )}
              </span>
            }
            customButtonClassName="w-full"
            optionsClassName="z-[50] min-w-[13rem]"
            maxHeight="lg"
          />
        </PropertyRailRow>
        <PropertyRailRow icon={Factory} label={label("is_in_risk_production_short")} className={ROW_CLASS}>
          <Segmented<boolean>
            label={label("is_in_risk_production")}
            value={value.isInRiskProduction}
            onChange={(next) => patch({ isInRiskProduction: next })}
            options={[
              { value: true, label: t(`${RISK_I18N}.yes_no.yes`) },
              { value: false, label: t(`${RISK_I18N}.yes_no.no`) },
            ]}
          />
        </PropertyRailRow>
      </PropertyRailGroup>

      <PropertyRailGroup title={t(`${RISK_I18N}.groups.people`)}>
        <PropertyRailRow icon={UserRound} label={label("proposer")} required className={ROW_CLASS}>
          <MemberDropdown
            multiple={false}
            projectId={projectId}
            value={value.proposerId}
            onChange={(next) => patch({ proposerId: next })}
            buttonVariant="transparent-with-text"
            className="w-full"
            buttonContainerClassName="text-left"
            button={
              <MemberValueButton
                userIds={value.proposerId ? [value.proposerId] : []}
                placeholder={t(`${RISK_I18N}.form.member_placeholder`)}
                error={errors.proposerId}
              />
            }
          />
        </PropertyRailRow>
        <PropertyRailRow icon={UserRoundCheck} label={label("owner")} required className={ROW_CLASS}>
          <MemberDropdown
            multiple={false}
            projectId={projectId}
            value={value.ownerId}
            onChange={(next) => patch({ ownerId: next })}
            buttonVariant="transparent-with-text"
            className="w-full"
            buttonContainerClassName="text-left"
            button={
              <MemberValueButton
                userIds={value.ownerId ? [value.ownerId] : []}
                placeholder={t(`${RISK_I18N}.form.owner_placeholder`)}
                error={errors.ownerId}
              />
            }
          />
        </PropertyRailRow>
        <PropertyRailRow icon={UsersRound} label={label("stakeholders_short")} className={ROW_CLASS}>
          <MemberDropdown
            multiple
            projectId={projectId}
            value={value.stakeholderIds}
            onChange={(next) => patch({ stakeholderIds: next })}
            buttonVariant="transparent-with-text"
            className="w-full"
            buttonContainerClassName="text-left"
            button={
              <MemberValueButton
                userIds={value.stakeholderIds}
                placeholder={t(`${RISK_I18N}.form.stakeholders_placeholder`)}
              />
            }
          />
        </PropertyRailRow>
      </PropertyRailGroup>

      <PropertyRailGroup title={t(`${RISK_I18N}.groups.dates`)}>
        <PropertyRailRow icon={CalendarDays} label={label("proposed_date")} required className={ROW_CLASS}>
          {renderDate("proposedDate", {
            required: true,
            placeholder: t(`${RISK_I18N}.form.date_placeholder`),
            error: errors.proposedDate,
          })}
        </PropertyRailRow>
        <PropertyRailRow icon={CalendarDays} label={label("planned_handle_date_short")} className={ROW_CLASS}>
          {renderDate("plannedHandleDate", { required: false, placeholder: t(`${RISK_I18N}.form.date_placeholder`) })}
        </PropertyRailRow>
        <PropertyRailRow
          icon={CalendarCheck}
          label={label("actual_close_date_short")}
          error={closeBeforeProposed ? t(`${RISK_I18N}.errors.RISK_CLOSE_BEFORE_PROPOSED`) : undefined}
          className={ROW_CLASS}
        >
          {renderDate("actualCloseDate", {
            required: false,
            placeholder: t(`${RISK_I18N}.form.actual_close_date_placeholder`),
            minDate: value.proposedDate,
          })}
        </PropertyRailRow>
      </PropertyRailGroup>
    </div>
  );
});
