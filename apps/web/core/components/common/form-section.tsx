/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/**
 * 分区表单的布局原语：分区标题 + 字段外壳（label / 必填星号 / 错误 / 提示）+ 两套 variant 样式 token。
 * 产品与项目的创建弹窗、设置页共用，保证两个模块的表单长得一样。
 */

/**
 * 表单所在容器：弹窗 / 设置页 / 分组弹窗（组名靠左、字段靠右，不标必填红星、非必填挂「可选」标签），
 * 各自一套字号与边框 token
 */
export type TFormVariant = "modal" | "settings" | "grouped-modal";

export type TFormVariantStyles = {
  title: string;
  grid: string;
  label: string;
  /** 控件外层容器，统一行高 */
  control: string;
  /** @plane/ui Input */
  input: string;
  /** DateDropdown / MemberDropdown / DictionaryItemSelect 的 buttonClassName */
  dropdownButton: string;
  /** CustomSelect（非搜索下拉）的 buttonClassName，与 input / dropdownButton 同高 */
  select: string;
  /** 只读文本 */
  text: string;
  error: string;
  hint: string;
  /** 必填字段名后是否加红星 */
  requiredMarker: boolean;
  /** 非必填字段名后「可选」标签的样式；空串表示不挂标签 */
  optionalBadge: string;
  /** DateDropdown / MemberDropdown 的 labelClassName（默认是 12px 的 text-body-xs-medium，分组弹窗要放大） */
  dropdownLabel?: string;
};

export const FORM_VARIANT_STYLES: Record<TFormVariant, TFormVariantStyles> = {
  modal: {
    title: "text-13 font-semibold text-primary",
    grid: "md:grid-cols-2",
    label: "mb-1.5 block text-13 font-medium text-secondary",
    control: "h-10 w-full",
    input: "h-10 min-h-10 w-full !py-0 text-13 leading-5",
    dropdownButton: "h-full w-full text-13",
    select:
      "!border-subtle-1 !shadow-none flex !h-10 !min-h-10 !max-h-10 w-full items-center rounded-md border-[0.5px] px-3 !py-0 text-left text-13 font-normal leading-5",
    text: "flex min-h-10 items-center text-13 text-primary",
    error: "mt-1 text-11 text-danger-primary",
    hint: "mt-1 text-12 text-tertiary",
    requiredMarker: true,
    optionalBadge: "",
  },
  settings: {
    title: "text-body-md-medium text-primary",
    grid: "md:grid-cols-2",
    label: "mb-1.5 block text-body-sm-medium text-primary",
    control: "h-10 w-full",
    input: "h-10 w-full border !border-subtle bg-surface-1 px-3 !py-0 text-body-sm-regular text-primary",
    dropdownButton: "h-full w-full border !border-subtle bg-surface-1 text-body-sm-regular",
    select:
      "!border-subtle !shadow-none flex !h-10 !min-h-10 !max-h-10 w-full items-center rounded-md border bg-surface-1 px-3 !py-0 text-left text-body-sm-regular font-normal",
    text: "flex min-h-10 items-center text-body-sm-regular text-primary",
    error: "mt-1.5 text-caption-md-regular text-danger-primary",
    hint: "mt-1.5 text-caption-md-regular text-tertiary",
    requiredMarker: true,
    optionalBadge: "",
  },
  "grouped-modal": {
    title: "text-14 font-semibold text-primary",
    grid: "md:grid-cols-2",
    label: "mb-1.5 flex items-center gap-1.5 text-13 font-medium text-secondary",
    control: "h-[38px] w-full",
    input: "h-[38px] min-h-[38px] w-full rounded-lg border !border-subtle-1 !py-0 text-14 leading-5",
    dropdownButton: "h-full w-full rounded-lg border !border-subtle-1 px-3 text-14 font-normal",
    select:
      "!border-subtle-1 !shadow-none flex !h-[38px] !min-h-[38px] !max-h-[38px] w-full items-center rounded-lg border px-3 !py-0 text-left text-14 font-normal leading-5",
    text: "flex min-h-[38px] items-center text-14 text-primary",
    error: "mt-1 text-12 text-danger-primary",
    hint: "mt-1 text-12 text-tertiary",
    requiredMarker: false,
    optionalBadge: "rounded border border-subtle-1 px-1 text-11 font-normal leading-4 text-tertiary",
    dropdownLabel: "text-14 font-normal leading-5",
  },
};

/** 分区内字段网格：弹窗 gap-x-5 / 设置页 gap-x-6 */
export const getFormGridClassName = (variant: TFormVariant) =>
  cn("grid grid-cols-1", variant === "settings" ? "gap-x-6 gap-y-4" : "gap-x-5 gap-y-4", FORM_VARIANT_STYLES[variant].grid);

export type TFormSectionProps = {
  title: string;
  /** 标题右侧的小字说明 */
  extra?: ReactNode;
  /** 设置页变体在标题下加分隔线 */
  divided?: boolean;
  children: ReactNode;
};

export function FormSection(props: TFormSectionProps) {
  const { title, extra, divided, children } = props;
  return (
    <section className="space-y-3.5">
      <div className={cn("flex items-baseline justify-between gap-3", divided && "border-b border-subtle pb-2")}>
        <h3 className="text-13 font-semibold text-primary">{title}</h3>
        {extra ? <span className="text-12 text-tertiary">{extra}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 分组弹窗的字段分组：组名靠左一列（与首行控件顶对齐），字段靠右；组与组之间一条分隔线。
 * 项目创建弹窗与产品创建/编辑弹窗共用。
 */
export type TFormFieldGroupProps = {
  title: string;
  /** 整组都是非必填时在组名后挂「可选」标签（如描述） */
  optional?: boolean;
  children: ReactNode;
};

export function FormFieldGroup(props: TFormFieldGroupProps) {
  const { title, optional = false, children } = props;
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES["grouped-modal"];
  return (
    <section className="grid grid-cols-1 gap-y-2 border-t border-subtle py-5 md:grid-cols-[104px_minmax(0,1fr)] md:gap-x-6">
      <h3 className={cn(styles.title, "flex items-center gap-1.5 md:h-[38px]")}>
        {title}
        {optional ? <span className={styles.optionalBadge}>{t("optional")}</span> : null}
      </h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** 字段外壳（label / 必填星号 / 错误 / 提示）。名字带 Shell 是为了避开 @plane/ui 里已有的 FormField */
export type TFormFieldShellProps = {
  label: string;
  /** 视觉上隐藏 label（仅留给读屏），如排期区里并排的起止日期 */
  labelHidden?: boolean;
  required: boolean;
  /** 只读态不显示必填星号 */
  editable: boolean;
  optionalText?: string;
  showOptional?: boolean;
  error?: string;
  /** 显示在控件下方；与错误同时存在时两行都显示（如「字典没有值」的引导要和必填错误一起看到） */
  hint?: ReactNode;
  styles: TFormVariantStyles;
  /** 整行字段传 "md:col-span-2" */
  className?: string;
  children: ReactNode;
};

export function FormFieldShell(props: TFormFieldShellProps) {
  const {
    label,
    labelHidden = false,
    required,
    editable,
    optionalText = "",
    showOptional = false,
    error,
    hint,
    styles,
    className,
    children,
  } = props;
  const { t } = useTranslation();
  return (
    <div className={cn("min-w-0", className)}>
      <span className={cn(styles.label, labelHidden && "sr-only")}>
        {label}
        {editable && required && styles.requiredMarker ? <span className="ml-0.5 text-danger-primary">*</span> : null}
        {editable && !required && styles.optionalBadge ? (
          <span className={styles.optionalBadge}>{optionalText || t("optional")}</span>
        ) : null}
        {editable && !required && !styles.optionalBadge && showOptional ? (
          <span className="ml-1 font-normal text-tertiary">({optionalText})</span>
        ) : null}
      </span>
      {children}
      {error ? <p className={styles.error}>{error}</p> : null}
      {hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
}

/** 表单顶部的黄色提示横幅（存量数据缺必填等） */
export function FormWarningBanner(props: { children: ReactNode; className?: string }) {
  const { children, className } = props;
  return (
    <div className={cn("flex gap-3 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-primary" />
      <div className="text-11 leading-4 text-secondary">{children}</div>
    </div>
  );
}
