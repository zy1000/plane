/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { differenceInCalendarDays } from "date-fns";
import { observer } from "mobx-react";
import { Activity, AlertTriangle, Boxes, Building2, CalendarDays, Crown, Flag, Tag, Timer, UserRoundCog } from "lucide-react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router";
// plane imports
import { ETabIndices, PROJECT_PRODUCT_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectProductType } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn, getDate, getTabIndex, renderFormattedPayloadDate } from "@plane/utils";
// components
import {
  MemberValueButton,
  PROPERTY_VALUE_CLASS,
  PROPERTY_VALUE_ERROR_CLASS,
  PropertyRailGroup,
  PropertyRailRow,
} from "@/components/common/form-modal";
import { DateDropdown } from "@/components/dropdowns/date";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import {
  dateRules,
  getProjectFieldLabelKey,
  memberRules,
  normalizeUserId,
  requiredValueRules,
  validateEndDate,
} from "@/components/project/form-fields";
import type {
  TProjectDateFieldKey,
  TProjectDictionaries,
  TProjectDictionaryFieldKey,
  TProjectMemberFieldKey,
} from "@/components/project/form-fields";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  isMobile: boolean;
  dictionaries: TProjectDictionaries;
};

/** 项目只有 9 行属性，行高比产品弹窗（13 行）放宽一档，右栏才铺得满 */
const Row = (props: React.ComponentProps<typeof PropertyRailRow>) => (
  <PropertyRailRow className="min-h-11" {...props} />
);

const PRODUCT_TYPE_OPTIONS = PROJECT_PRODUCT_TYPE_OPTIONS.map((option) => ({
  value: option,
  query: option,
  content: <span className="truncate">{option}</span>,
}));

/**
 * 创建弹窗右栏：分类 / 排期 / 团队三组属性，一行一项。
 * 值不画成输入框：空值是灰字「请选择 / 选填」，点开是搜索下拉或日期选择；点过创建后还缺的必填项整格标红。
 */
export const ProjectCreateProperties = observer(function ProjectCreateProperties(props: Props) {
  const { isMobile, dictionaries } = props;
  const { t, currentLocale } = useTranslation();
  const {
    control,
    formState: { errors },
  } = useFormContext<TProject>();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  // 中文写成「2026年10月8日」，其它语言沿用默认格式
  const dateToken = currentLocale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined;
  const label = (key: Parameters<typeof getProjectFieldLabelKey>[0]) => t(getProjectFieldLabelKey(key));
  const requiredMessage = (key: Parameters<typeof getProjectFieldLabelKey>[0]) =>
    t("workspace_projects.validation.required", { field: label(key) });
  const placeholderFor = (required: boolean) =>
    t(required ? "workspace_projects.fields.select_placeholder" : "workspace_projects.fields.optional");

  const startDate = getDate(useWatch({ control, name: "start_date" }));
  const endDate = getDate(useWatch({ control, name: "end_date" }));
  // 起止都填了且没颠倒才算工期，首尾两天都算在内
  const durationDays =
    startDate && endDate && endDate >= startDate ? differenceInCalendarDays(endDate, startDate) + 1 : null;

  const renderDictionary = (name: TProjectDictionaryFieldKey, required: boolean) => {
    const dictionary = dictionaries.get(name);
    if (dictionaries.isEmpty(name)) {
      return (
        <span className="flex h-8 min-w-0 items-center gap-1.5 text-13 text-warning-primary">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">{t("workspace_projects.validation.dictionary_empty_short")}</span>
          <Link
            to={`/${dictionaries.workspaceSlug}/settings/data-dictionaries`}
            className="shrink-0 text-accent-primary hover:underline"
          >
            {t("workspace_projects.validation.manage_dictionaries")}
          </Link>
        </span>
      );
    }
    return (
      <Controller
        control={control}
        name={name}
        rules={requiredValueRules(required ? requiredMessage(name) : undefined)}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <DictionaryItemSelect
            dictionary={dictionary}
            value={value ?? null}
            onChange={onChange}
            placeholder={error?.message ?? placeholderFor(required)}
            placeholderClassName={error ? "text-danger-primary" : undefined}
            hasError={Boolean(error)}
            hideChevron
            triggerClassName="hover:bg-transparent"
            isLoading={dictionaries.isLoading}
            buttonClassName={cn(PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}
            tabIndex={getIndex(name)}
          />
        )}
      />
    );
  };

  const productTypeControl = (
    <Controller
      control={control}
      name="product_type"
      rules={requiredValueRules(requiredMessage("product_type"))}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <CustomSearchSelect
          options={PRODUCT_TYPE_OPTIONS}
          value={value ?? null}
          onChange={(next: string | null) => onChange((next as TProjectProductType | null) ?? null)}
          className="h-full w-full"
          customButtonClassName="h-full rounded-lg hover:bg-transparent"
          optionsClassName="w-[min(20rem,calc(100vw-2rem))]"
          tabIndex={getIndex("product_type")}
          customButton={
            <span className={cn(PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}>
              {value ? (
                <span className="truncate">{value}</span>
              ) : (
                <span className={cn("truncate", error ? "text-danger-primary" : "text-placeholder")}>
                  {error?.message ?? placeholderFor(true)}
                </span>
              )}
            </span>
          }
        />
      )}
    />
  );

  const renderDate = (name: TProjectDateFieldKey) => (
    <Controller
      control={control}
      name={name}
      rules={dateRules(requiredMessage(name), name === "end_date" ? validateEndDate(startDate, t) : undefined)}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <DateDropdown
          value={getDate(value)}
          onChange={(date) => onChange(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
          minDate={name === "end_date" ? startDate : undefined}
          maxDate={name === "start_date" ? endDate : undefined}
          buttonVariant="transparent-with-text"
          hideIcon
          isClearable={false}
          placeholder={error?.message ?? placeholderFor(true)}
          formatToken={dateToken}
          className="w-full"
          buttonContainerClassName="w-full text-left"
          buttonClassName={cn("tabular-nums", PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}
          labelClassName={cn("text-14 font-normal", !value && (error ? "text-danger-primary" : "text-placeholder"))}
          tabIndex={getIndex(name)}
        />
      )}
    />
  );

  const renderMember = (name: TProjectMemberFieldKey) => (
    <Controller
      control={control}
      name={name}
      rules={memberRules(requiredMessage(name))}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const userId = normalizeUserId(value);
        return (
          <MemberDropdown
            multiple={false}
            value={userId}
            onChange={onChange}
            buttonVariant="transparent-with-text"
            className="w-full"
            buttonContainerClassName="text-left"
            button={
              <MemberValueButton userIds={userId ? [userId] : []} placeholder={placeholderFor(true)} error={error?.message} />
            }
            tabIndex={getIndex(name === "project_lead" ? "lead" : name)}
          />
        );
      }}
    />
  );

  return (
    <div
      data-modal-wheel-scroll
      className="vertical-scrollbar scrollbar-sm flex min-w-0 flex-col gap-9 border-subtle bg-surface-2 px-7 pt-7 pb-5 max-md:border-t md:overflow-y-auto md:border-l"
    >
      <PropertyRailGroup title={t("workspace_projects.create.groups.classification")}>
        <Row icon={Tag} label={label("project_type")} required>
          {renderDictionary("project_type", true)}
        </Row>
        <Row icon={Boxes} label={label("product_type")} required>
          {productTypeControl}
        </Row>
        <Row icon={Building2} label={label("business_unit")}>
          {renderDictionary("business_unit", false)}
        </Row>
        <Row icon={Activity} label={label("status")} required>
          {renderDictionary("status", true)}
        </Row>
      </PropertyRailGroup>

      <PropertyRailGroup title={t("workspace_projects.create.groups.schedule")}>
        <Row icon={CalendarDays} label={label("start_date")} required>
          {renderDate("start_date")}
        </Row>
        {/* 完成日期早于开始日期时值已填，红占位不够，再在行下出一行红字 */}
        <Row icon={Flag} label={label("end_date")} required error={endDate ? errors.end_date?.message : undefined}>
          {renderDate("end_date")}
        </Row>
        <Row icon={Timer} label={t("workspace_projects.fields.duration")}>
          <span className="flex h-8 items-center">
            {durationDays !== null ? (
              <span className="inline-flex h-6 items-center rounded-md bg-accent-subtle px-2 text-13 font-medium text-accent-primary tabular-nums">
                {t("workspace_projects.create.duration_days", { count: durationDays })}
              </span>
            ) : (
              <span className="text-14 text-placeholder">—</span>
            )}
          </span>
        </Row>
      </PropertyRailGroup>

      <PropertyRailGroup title={t("workspace_projects.create.groups.team")}>
        <Row icon={Crown} label={label("project_lead")} required>
          {renderMember("project_lead")}
        </Row>
        <Row icon={UserRoundCog} label={label("product_manager")} required>
          {renderMember("product_manager")}
        </Row>
      </PropertyRailGroup>
    </div>
  );
});
