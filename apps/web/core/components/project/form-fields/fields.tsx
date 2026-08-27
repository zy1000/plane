/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { Link } from "react-router";
import { NETWORK_CHOICES, PROJECT_GRADE_OPTIONS, PROJECT_PRODUCT_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectGrade, TProjectProductType } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { FORM_VARIANT_STYLES, FormFieldShell } from "@/components/common/form-section";
import type { TFormVariant } from "@/components/common/form-section";
import { DateDropdown } from "@/components/dropdowns/date";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import type { TProject } from "@/plane-web/types/projects";
import { getProjectFieldLabelKey, normalizeUserId } from "./constants";
import type {
  TProjectDateFieldKey,
  TProjectDictionaryFieldKey,
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

// ---- 项目代号 ----
export function ProjectCodeField(props: TProjectFieldProps) {
  const { control, variant, disabled = false, tabIndex } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name="code"
      rules={{
        validate: (value) => Boolean((value ?? "").trim()) || requiredMessage("code"),
        maxLength: {
          value: 255,
          message: t("workspace_projects.validation.max_length", { field: label("code"), max: 255 }),
        },
      }}
      render={({ field: { value, onChange, ref }, fieldState: { error } }) => (
        <FormFieldShell
          label={label("code")}
          required
          editable={!disabled}
          error={error?.message}
          hint={variant === "settings" ? t("workspace_projects.fields.code_hint") : undefined}
          styles={styles}
        >
          <Input
            id="project-code"
            name="code"
            type="text"
            ref={ref}
            value={value ?? ""}
            onChange={onChange}
            maxLength={255}
            hasError={Boolean(error)}
            placeholder={t("workspace_projects.fields.code_placeholder")}
            className={styles.input}
            disabled={disabled}
            tabIndex={tabIndex}
          />
        </FormFieldShell>
      )}
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
  /** 字典列表还没回来时兜住当前值，设置页传 project[`${name}_detail`]?.label */
  fallbackLabel?: string | null;
};

export function ProjectDictionaryField(props: TProjectDictionaryFieldProps) {
  const { control, variant, disabled = false, tabIndex, name, required, dictionaries, fallbackLabel } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  const dictionary = dictionaries.get(name);
  const empty = dictionaries.isEmpty(name);
  // 字典没有可选值（或该工作区根本没这个系统字典）：禁用下拉，在必填错误之外再给一条「去数据字典里加」的引导
  const emptyHint = empty ? (
    <span className="flex flex-wrap items-center gap-x-1">
      {t("workspace_projects.validation.dictionary_empty", { name: dictionary?.name ?? label(name) })}
      <Link
        to={`/${dictionaries.workspaceSlug}/settings/data-dictionaries`}
        className="text-accent-primary hover:underline"
      >
        {t("workspace_projects.validation.manage_dictionaries")}
      </Link>
    </span>
  ) : undefined;
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
              fallbackLabel={fallbackLabel}
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
};

export function ProjectDateField(props: TProjectDateFieldProps) {
  const { control, variant, disabled = false, tabIndex, name, required, minDate, maxDate, validate } = props;
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
        <FormFieldShell label={label(name)} required={required} editable={!disabled} error={error?.message} styles={styles}>
          <div className={styles.control}>
            <DateDropdown
              value={getDate(value)}
              onChange={(date) => onChange(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
              buttonVariant="border-with-text"
              isClearable={!required}
              minDate={minDate}
              maxDate={maxDate}
              placeholder={t("workspace_projects.fields.date_placeholder")}
              className="h-full w-full"
              buttonContainerClassName="h-full w-full"
              buttonClassName={cn(styles.dropdownButton, error && "border-danger-strong")}
              disabled={disabled}
              tabIndex={tabIndex}
            />
          </div>
        </FormFieldShell>
      )}
    />
  );
}

// ---- 项目等级 ----
type TProjectChoiceFieldProps = TProjectFieldProps & {
  /** 创建时必填；设置页保留「未设置」 */
  required: boolean;
};

export function ProjectGradeField(props: TProjectChoiceFieldProps) {
  const { control, variant, disabled = false, tabIndex, required } = props;
  const { t, styles, label } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name="grade"
      rules={required ? { required: t("project_grade_required") } : undefined}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormFieldShell label={label("grade")} required={required} editable={!disabled} error={error?.message} styles={styles}>
          <CustomSelect
            value={value ?? ""}
            onChange={(val: string) => onChange(val === "" ? null : (val as TProjectGrade))}
            label={
              value ? (
                <ProjectGradeBadge grade={value} />
              ) : (
                <span className="text-placeholder">{t("select_project_grade")}</span>
              )
            }
            className="w-full"
            buttonClassName={cn(styles.select, error && "!border-danger-strong")}
            input
            disabled={disabled}
            tabIndex={tabIndex}
          >
            {!required && (
              <CustomSelect.Option value="">{t("workspace_projects.fields.not_set")}</CustomSelect.Option>
            )}
            {PROJECT_GRADE_OPTIONS.map((option) => (
              <CustomSelect.Option key={option} value={option}>
                <ProjectGradeBadge grade={option} />
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </FormFieldShell>
      )}
    />
  );
}

// ---- 产品类型（硬编码枚举，与字典型的「项目类型」是两回事）----
export function ProjectProductTypeField(props: TProjectChoiceFieldProps) {
  const { control, variant, disabled = false, tabIndex, required } = props;
  const { t, styles, label, requiredMessage } = useFieldHelpers(variant);
  return (
    <Controller
      control={control}
      name="product_type"
      rules={required ? { required: requiredMessage("product_type") } : undefined}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormFieldShell
          label={label("product_type")}
          required={required}
          editable={!disabled}
          error={error?.message}
          styles={styles}
        >
          <CustomSelect
            value={value ?? ""}
            onChange={(val: string) => onChange(val === "" ? null : (val as TProjectProductType))}
            label={
              value ? (
                <span>{value}</span>
              ) : (
                <span className="text-placeholder">{t("workspace_projects.fields.select_placeholder")}</span>
              )
            }
            className="w-full"
            buttonClassName={cn(styles.select, error && "!border-danger-strong")}
            input
            disabled={disabled}
            tabIndex={tabIndex}
          >
            {!required && (
              <CustomSelect.Option value="">{t("workspace_projects.fields.not_set")}</CustomSelect.Option>
            )}
            {PROJECT_PRODUCT_TYPE_OPTIONS.map((option) => (
              <CustomSelect.Option key={option} value={option}>
                {option}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </FormFieldShell>
      )}
    />
  );
}
