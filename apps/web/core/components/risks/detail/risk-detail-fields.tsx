import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EditIcon } from "@plane/propel/icons";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { RISK_I18N, formatRiskDateTime } from "../constants";
import type { TRiskEditSession } from "./use-risk-edit-session";

/**
 * 详情的字号只有三档：内容 14、标签与控件 13、辅助信息 12。正文与右栏的标签列同宽（6rem），值从同一条竖线开始。
 */
export const DETAIL_LABEL_CLASS = "text-13 leading-[22px] text-tertiary whitespace-nowrap";

/** 编辑态控件的边框盒：同工作项详情编辑态（32px、浅底、悬停加深、聚焦蓝边） */
export const EDIT_BOX_CLASS =
  "rounded-md border border-subtle-1 bg-layer-2 text-14 text-primary outline-none transition-colors hover:border-strong focus:border-accent-strong placeholder:text-placeholder";

/** 下拉按钮（成员 / 日期）在编辑态的外观；带 ! 是为了盖过下拉组件自带的 variant 样式 */
export const EDIT_DROPDOWN_BUTTON_CLASS =
  "!h-8 !w-full justify-between gap-1.5 !rounded-md !border !border-subtle-1 !bg-layer-2 !px-2.5 !py-0 !text-14 !font-normal hover:!border-strong";
export const EDIT_DROPDOWN_ARROW_CLASS = "!h-3.5 !w-3.5 shrink-0 text-tertiary";

/** 缺必填项：边框标红 */
export const MISSING_CLASS = "!border-danger-strong";

/**
 * 正文一行：左标签（编辑态必填挂红 *）、右值。标签与值的第一行文字对齐，长文本往下长。
 */
export const RiskFieldRow = ({
  label,
  required = false,
  isEditing,
  children,
}: {
  label: string;
  required?: boolean;
  isEditing: boolean;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-5">
    <span className={cn(DETAIL_LABEL_CLASS, "py-[5px]")}>
      {label}
      {isEditing && required && <span className="ml-0.5 text-danger-primary">*</span>}
    </span>
    <div className="min-w-0">{children}</div>
  </div>
);

/** 查看态的值：14 号正文，保留换行；空着是灰字「未填写」 */
export const RiskViewText = ({ children, className }: { children?: ReactNode; className?: string }) => {
  const { t } = useTranslation();
  const isEmpty = children === undefined || children === null || children === "";
  return (
    <div
      className={cn(
        "min-h-8 py-[5px] text-14 leading-[22px] break-words whitespace-pre-wrap",
        isEmpty ? "text-placeholder" : "text-primary",
        className
      )}
    >
      {isEmpty ? t(`${RISK_I18N}.detail.not_filled`) : children}
    </div>
  );
};

/**
 * 编辑态的单选下拉：带边框的 32px 按钮 + 选项浮层。`clearable` 在最前面加一项「未填写」，选它即清空（值为 `""`）。
 */
export const RiskEditSelect = <T extends string | number>({
  value,
  options,
  clearable = false,
  missing = false,
  className,
  onChange,
}: {
  value: T | "" | null;
  options: { value: T; label: ReactNode }[];
  clearable?: boolean;
  missing?: boolean;
  className?: string;
  onChange: (next: T | "") => void;
}) => {
  const { t } = useTranslation();
  const current = options.find((option) => option.value === value);
  return (
    <CustomSelect
      value={value ?? ""}
      onChange={(next: T | "") => {
        if (next !== value) onChange(next);
      }}
      label={
        <span className={cn("flex min-w-0 items-center gap-2 truncate", !current && "text-placeholder")}>
          {current?.label ?? t(`${RISK_I18N}.form.select_placeholder`)}
        </span>
      }
      className={cn("w-full", className)}
      buttonClassName={cn(
        "!h-8 justify-between gap-1.5 rounded-md border-subtle-1 bg-layer-2 !px-2.5 !py-0 text-14 text-primary hover:border-strong",
        missing && MISSING_CLASS
      )}
      chevronClassName="h-3.5 w-3.5 text-tertiary"
      optionsClassName="min-w-48 text-13"
      maxHeight="lg"
    >
      {clearable && (
        <CustomSelect.Option value="">
          <span className="text-placeholder">{t(`${RISK_I18N}.detail.not_filled`)}</span>
        </CustomSelect.Option>
      )}
      {options.map((option) => (
        <CustomSelect.Option key={String(option.value)} value={option.value}>
          <span className="flex items-center gap-2">{option.label}</span>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};

/** 时间戳一律 `2026-10-26 18:54`，12 号灰字（活动、评论共用） */
export const RiskTime = ({ value, className }: { value: string; className?: string }) => (
  <time dateTime={value} className={cn("shrink-0 text-12 text-placeholder tabular-nums", className)}>
    {formatRiskDateTime(value)}
  </time>
);

/**
 * 顶栏的「编辑」与「取消 / 保存」：整页挂在路由 header 右侧，抽屉在头一行图标左边。只有可写成员才出。
 */
export const RiskEditActions = ({
  session,
  onSave,
}: {
  session: Pick<TRiskEditSession, "isEditing" | "isSaving" | "start" | "cancel">;
  onSave: () => void;
}) => {
  const { t } = useTranslation();
  if (!session.isEditing) {
    return (
      <Button variant="secondary" size="lg" prependIcon={<EditIcon />} onClick={session.start}>
        {t(`${RISK_I18N}.detail.edit`)}
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="secondary" size="lg" onClick={session.cancel} disabled={session.isSaving}>
        {t(`${RISK_I18N}.form.cancel`)}
      </Button>
      <Button variant="primary" size="lg" onClick={onSave} loading={session.isSaving}>
        {session.isSaving ? t(`${RISK_I18N}.detail.saving`) : t(`${RISK_I18N}.form.submit_edit`)}
      </Button>
    </div>
  );
};
