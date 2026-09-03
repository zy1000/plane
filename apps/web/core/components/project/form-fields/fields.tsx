/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { Link } from "react-router";
import { NETWORK_CHOICES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import type { TDataDictionaryItemLite } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { FORM_VARIANT_STYLES, FormFieldShell } from "@/components/common/form-section";
import type { TFormVariant } from "@/components/common/form-section";
import { DateDropdown } from "@/components/dropdowns/date";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import type { TProject } from "@/plane-web/types/projects";
import { getProjectFieldLabelKey, normalizeUserId } from "./constants";
import type {
  TProjectDateFieldKey,
  TProjectDictionaryFieldKey,
  TProjectFormDictionaryKey,
  TProjectFormFieldKey,
  TProjectMemberFieldKey,
} from "./constants";
import type { TProjectDictionaries } from "./use-project-dictionaries";

/**
 * 项目表单的 react-hook-form 叶子字段。创建弹窗（FormProvider）与设置页（本地 useForm）都显式传 control，
 * 两处共用同一批控件，样式差异只走 variant。
 */

export type TProjectFieldProps = {
  control: Control<TProject>;
  variant: TFormVariant;
  disabled?: boolean;
  tabIndex?: number;
};

const useFieldHelpers = (variant: TFormVariant) => {
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES[variant];
  const label = (key: TProjectFormFieldKey) => t(getProjectFieldLabelKey(key));
  const requiredMessage = (key: TProjectFormFieldKey) =>
    t("workspace_projects.validation.required", { field: label(key) });
  return { t, styles, label, requiredMessage };
};

// ---- 字典没有可选值（或该工作区根本没这个系统字典）：在必填错误之外再给一条「去数据字典里加」的引导 ----
type TDictionaryEmptyHintProps = {
  dictionaries: TProjectDictionaries;
  name: TProjectFormDictionaryKey;
};

function DictionaryEmptyHint({ dictionaries, name }: TDictionaryEmptyHintProps) {
  const { t } = useTranslation();
  const dictionaryName = dictionaries.get(name)?.name ?? t(getProjectFieldLabelKey(name));
  return (
    <span className="flex flex-wrap items-center gap-x-1">
      {t("workspace_projects.validation.dictionary_empty", { name: dictionaryName })}
      <Link
        to={`/${dictionaries.workspaceSlug}/settings/data-dictionaries`}
        className="text-accent-primary hover:underline"
      >
        {t("workspace_projects.validation.manage_dictionaries")}
      </Link>
    </span>
  );
}

// ---- 项目代号：字符串列，但取值来自 project_code 字典（存 label，不存 id）----
type TProjectCodeFieldProps = TProjectFieldProps & {
  dictionaries: TProjectDictionaries;
};

export function ProjectCodeField(props: TProjectCodeFieldProps) {
  const { control, variant, disabled = false, tabIndex, dictionaries } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  const dictionary = dictionaries.get("code");
  const empty = dictionaries.isEmpty("code");
  const hint = empty ? (
    <DictionaryEmptyHint dictionaries={dictionaries} name="code" />
  ) : variant === "settings" ? (
    t("workspace_projects.fields.code_hint")
  ) : undefined;
  return (
    <Controller
      control={control}
      name="code"
      rules={{ validate: (value) => Boolean((value ?? "").trim()) || requiredMessage("code") }}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const code = (value ?? "").trim();
        const selected = code ? dictionary?.items.find((item) => item.label === code) : undefined;
        return (
          <FormFieldShell
            label={label("code")}
            required
            editable={!disabled}
            error={error?.message}
            hint={hint}
            styles={styles}
          >
            <div className={styles.control}>
              <DictionaryItemSelect
                dictionary={dictionary}
                // 下拉按 item id 选，表单值是 label，这里来回换算；
                // 字典未加载或存量代号（0355 之前）不在字典里时，用 fallbackItem 把当前值原样显示出来
                value={selected?.id ?? (code || null)}
                onChange={(itemId) => onChange(dictionary?.items.find((item) => item.id === itemId)?.label ?? "")}
                fallbackItem={
                  code && !selected
                    ? { id: code, label: code, dictionary: dictionary?.id ?? "", color: "", is_colored: false }
                    : undefined
                }
                disabled={disabled || empty}
                placeholder={t("workspace_projects.fields.select_placeholder")}
                hasError={Boolean(error)}
                isLoading={dictionaries.isLoading}
                buttonClassName={styles.dropdownButton}
                tabIndex={tabIndex}
              />
            </div>
          </FormFieldShell>
        );
      }}
    />
  );
}

// ---- 可见性（network）----
export function ProjectNetworkField(props: TProjectFieldProps) {
  const { control, variant, disabled = false, tabIndex } = props;
  const { t, styles, label } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name="network"
      render={({ field: { value, onChange } }) => {
        const selected = NETWORK_CHOICES.find((network) => network.key === value);
        return (
          <FormFieldShell label={label("network")} required={false} editable={!disabled} styles={styles}>
            <CustomSelect
              value={value}
              onChange={onChange}
              label={
                <span className="flex items-center gap-1.5">
                  {selected ? (
                    <>
                      <ProjectNetworkIcon iconKey={selected.iconKey} className="h-3.5 w-3.5" />
                      {t(selected.i18n_label)}
                    </>
                  ) : (
                    <span className="text-placeholder">{t("select_network")}</span>
                  )}
                </span>
              }
              className="w-full"
              buttonClassName={styles.select}
              input
              disabled={disabled}
              tabIndex={tabIndex}
            >
              {NETWORK_CHOICES.map((network) => (
                <CustomSelect.Option key={network.key} value={network.key}>
                  <div className="flex items-start gap-2">
                    <ProjectNetworkIcon iconKey={network.iconKey} className="h-3.5 w-3.5" />
                    <div className="-mt-1">
                      <p>{t(network.i18n_label)}</p>
                      <p className="text-11 text-placeholder">{t(network.description)}</p>
                    </div>
                  </div>
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </FormFieldShell>
        );
      }}
    />
  );
}

// ---- 数据字典下拉（所属BU / 项目状态 / 项目类型）----
type TProjectDictionaryFieldProps = TProjectFieldProps & {
  name: TProjectDictionaryFieldKey;
  required: boolean;
  dictionaries: TProjectDictionaries;
  /** 字典列表还没回来时兜住当前值，设置页传 project[`${name}_detail`]（含颜色） */
  fallbackItem?: TDataDictionaryItemLite | null;
};

export function ProjectDictionaryField(props: TProjectDictionaryFieldProps) {
  const { control, variant, disabled = false, tabIndex, name, required, dictionaries, fallbackItem } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  const dictionary = dictionaries.get(name);
  const empty = dictionaries.isEmpty(name);
  // 字典没有可选值时禁用下拉并给引导
  const emptyHint = empty ? <DictionaryEmptyHint dictionaries={dictionaries} name={name} /> : undefined;
  return (
    <Controller
      control={control}
      name={name}
      rules={required ? { validate: (value) => Boolean(value) || requiredMessage(name) } : undefined}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormFieldShell
          label={label(name)}
          required={required}
          editable={!disabled}
          error={error?.message}
          hint={emptyHint}
          styles={styles}
        >
          <div className={styles.control}>
            <DictionaryItemSelect
              dictionary={dictionary}
              value={value ?? null}
              onChange={onChange}
              disabled={disabled || empty}
              placeholder={t("workspace_projects.fields.select_placeholder")}
              hasError={Boolean(error)}
              fallbackItem={fallbackItem}
              isLoading={dictionaries.isLoading}
              buttonClassName={styles.dropdownButton}
              tabIndex={tabIndex}
            />
          </div>
        </FormFieldShell>
      )}
    />
  );
}

// ---- 人员单选（负责人 / 研发产品经理）----
type TProjectMemberFieldProps = TProjectFieldProps & {
  name: TProjectMemberFieldKey;
  required: boolean;
  /** 传了就只在该项目的成员里选（设置页的负责人）；不传用工作区成员（创建时 / 研发产品经理） */
  projectId?: string;
};

export function ProjectMemberField(props: TProjectMemberFieldProps) {
  const { control, variant, disabled = false, tabIndex, name, required, projectId } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name={name}
      // project_lead 可能是 IUserLite 对象，用 validate 而不是 required，先归一再判空
      rules={required ? { validate: (value) => Boolean(normalizeUserId(value)) || requiredMessage(name) } : undefined}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormFieldShell label={label(name)} required={required} editable={!disabled} error={error?.message} styles={styles}>
          <div className={styles.control}>
            <MemberDropdown
              multiple={false}
              projectId={projectId}
              value={normalizeUserId(value)}
              onChange={onChange}
              buttonVariant="border-with-text"
              placeholder={t("workspace_projects.fields.select_member_placeholder")}
              showUserDetails
              className="h-full w-full"
              buttonContainerClassName="h-full w-full"
              buttonClassName={cn(styles.dropdownButton, error && "border-danger-strong")}
              labelClassName={styles.dropdownLabel}
              disabled={disabled}
              tabIndex={tabIndex}
            />
          </div>
        </FormFieldShell>
      )}
    />
  );
}

// ---- 日期（开始 / 完成）----
type TProjectDateFieldProps = TProjectFieldProps & {
  name: TProjectDateFieldKey;
  required: boolean;
  minDate?: Date;
  maxDate?: Date;
  /** 必填校验之后的额外校验（如完成日期不早于开始日期） */
  validate?: (value: string | null | undefined) => true | string;
  /** 起止日期并排时隐藏 label，用 placeholder 区分开始 / 完成 */
  labelHidden?: boolean;
  placeholder?: string;
  className?: string;
};

export function ProjectDateField(props: TProjectDateFieldProps) {
  const {
    control,
    variant,
    disabled = false,
    tabIndex,
    name,
    required,
    minDate,
    maxDate,
    validate,
    labelHidden,
    placeholder,
    className,
  } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name={name}
      rules={{
        validate: (value) => {
          if (required && !value) return requiredMessage(name);
          return validate?.(value) ?? true;
        },
      }}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormFieldShell
          label={label(name)}
          labelHidden={labelHidden}
          required={required}
          editable={!disabled}
          error={error?.message}
          styles={styles}
          className={className}
        >
          <div className={styles.control}>
            <DateDropdown
              value={getDate(value)}
              onChange={(date) => onChange(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
              buttonVariant="border-with-text"
              isClearable={!required}
              minDate={minDate}
              maxDate={maxDate}
              placeholder={placeholder ?? t("workspace_projects.fields.date_placeholder")}
              className="h-full w-full"
              buttonContainerClassName="h-full w-full"
              buttonClassName={cn(styles.dropdownButton, error && "border-danger-strong")}
              labelClassName={styles.dropdownLabel}
              disabled={disabled}
              tabIndex={tabIndex}
            />
          </div>
        </FormFieldShell>
      )}
    />
  );
}

// ---- 项目 logo（emoji / icon）----
type TProjectLogoFieldProps = Pick<TProjectFieldProps, "control" | "disabled"> & {
  /** 覆盖 logo 块的尺寸 / 底色（创建弹窗身份区用 64px 的大块） */
  tileClassName?: string;
  logoSize?: number;
};

/** 名称输入框左侧的 logo 选择器，创建弹窗与设置页共用；默认与 h-10 控件同高 */
export function ProjectLogoField(props: TProjectLogoFieldProps) {
  const { control, disabled = false, tileClassName, logoSize = 18 } = props;
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Controller
      control={control}
      name="logo_props"
      render={({ field: { value, onChange } }) => (
        <EmojiPicker
          iconType="material"
          isOpen={isOpen}
          handleToggle={(val: boolean) => setIsOpen(val)}
          className="flex shrink-0 items-center justify-center"
          buttonClassName="flex items-center justify-center"
          label={
            <span
              className={cn(
                "grid h-10 w-10 place-items-center rounded-md border border-subtle bg-layer-2",
                tileClassName
              )}
            >
              <Logo logo={value} size={logoSize} />
            </span>
          }
          onChange={(val: any) => {
            let logoValue = {};

            if (val?.type === "emoji")
              logoValue = {
                value: val.value,
              };
            else if (val?.type === "icon") logoValue = val.value;

            onChange({
              in_use: val?.type,
              [val?.type]: logoValue,
            });
            setIsOpen(false);
          }}
          defaultIconColor={value?.in_use && value.in_use === "icon" ? value.icon?.color : undefined}
          defaultOpen={value?.in_use && value.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
          disabled={disabled}
        />
      )}
    />
  );
}
