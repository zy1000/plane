/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import {
  Activity,
  AlertTriangle,
  Box,
  CalendarDays,
  CodeXml,
  Cpu,
  Crown,
  Flag,
  FlaskConical,
  Layers,
  Tag,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionary, TProduct, TProductExtendedFieldKey } from "@plane/types";
import { cn, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import {
  MemberValueButton,
  PROPERTY_READONLY_CLASS,
  PROPERTY_VALUE_CLASS,
  PROPERTY_VALUE_ERROR_CLASS,
  PropertyRailGroup,
  PropertyRailRow,
  ReadonlyPeopleValue,
} from "@/components/common/form-modal";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { DateDropdown } from "@/components/dropdowns/date";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PRODUCT_DICTIONARY_FIELDS, PRODUCT_REQUIRED_EXTENDED_FIELDS } from "./extended-fields";
import type {
  TProductDictionaryFieldKey,
  TProductExtendedFieldErrors,
  TProductExtendedFieldsState,
} from "./extended-fields";

type TDateFieldKey = "start_date" | "o_phase_close_date" | "v_phase_close_date";
type TLeadFieldKey = "project_lead" | "test_lead";

type Props = {
  workspaceSlug: string;
  editable: boolean;
  product: TProduct | null | undefined;
  values: TProductExtendedFieldsState;
  errors: TProductExtendedFieldErrors;
  onChange: <K extends TProductExtendedFieldKey>(key: K, value: TProductExtendedFieldsState[K]) => void;
  getDictionaryByKey: (key: string) => TDataDictionary | undefined;
  isDictionaryLoading: boolean;
  /** 产品负责人不在扩展字段里，状态由弹窗自己管 */
  owner: {
    value: string | null;
    onChange: (value: string | null) => void;
    error: string | null;
    /** 编辑态只能从产品成员里选；不传则是全部工作区成员 */
    memberIds?: string[];
    /** 私有产品换了负责人后自己会失去访问权限时的提醒 */
    warning?: string | null;
  };
  className?: string;
};

/**
 * 产品弹窗右栏：分类 / 研发等级 / 计划 / 团队四组属性，一行一项。
 *
 * 值不画成输入框：空值是灰字「请选择 / 选填」，点开是搜索下拉（字典值、成员）或日期选择。
 * 点过创建后还缺的必填项整格标红，所有缺项一次全部标出来。
 */
export const ProductModalProperties = observer(function ProductModalProperties(props: Props) {
  const {
    workspaceSlug,
    editable,
    product,
    values,
    errors,
    onChange,
    getDictionaryByKey,
    isDictionaryLoading,
    owner,
    className,
  } = props;
  const { t, currentLocale } = useTranslation();
  // 中文写成「2026年10月8日」，其它语言沿用默认格式
  const dateToken = currentLocale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined;

  const isRequired = (key: TProductExtendedFieldKey) => PRODUCT_REQUIRED_EXTENDED_FIELDS.includes(key);
  const placeholderFor = (required: boolean) =>
    t(required ? "workspace_products.fields.select_placeholder" : "workspace_products.fields.optional");
  const label = (key: string) => t(`workspace_products.fields.${key}`);

  const renderDictionary = (key: TProductDictionaryFieldKey) => {
    const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
    const detail = product?.[`${key}_detail` as const] ?? null;
    if (!editable) {
      return (
        <span className={PROPERTY_READONLY_CLASS}>
          <DictionaryValueTag label={detail?.label ?? "—"} color={resolveDictionaryItemColor(detail, dictionary)} />
        </span>
      );
    }
    if (dictionary && dictionary.items.length === 0) {
      return (
        <span className="flex h-8 min-w-0 items-center gap-1.5 text-13 text-warning-primary">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">{t("workspace_products.validation.dictionary_empty_short")}</span>
          <Link
            to={`/${workspaceSlug}/settings/data-dictionaries`}
            className="shrink-0 text-accent-primary hover:underline"
          >
            {t("workspace_products.validation.manage_dictionaries")}
          </Link>
        </span>
      );
    }
    const error = errors[key];
    return (
      <DictionaryItemSelect
        dictionary={dictionary}
        value={values[key]}
        onChange={(itemId) => onChange(key, itemId)}
        placeholder={error ?? placeholderFor(true)}
        placeholderClassName={error ? "text-danger-primary" : undefined}
        hasError={Boolean(error)}
        hideChevron
        triggerClassName="hover:bg-transparent"
        fallbackItem={detail}
        isLoading={isDictionaryLoading}
        buttonClassName={cn(PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}
      />
    );
  };

  const renderDate = (key: TDateFieldKey) => {
    const value = values[key];
    if (!editable) {
      return (
        <span className={cn(PROPERTY_READONLY_CLASS, "tabular-nums", !value && "text-placeholder")}>
          {value ? renderFormattedDate(value, dateToken) : "—"}
        </span>
      );
    }
    const required = isRequired(key);
    const error = errors[key];
    return (
      <DateDropdown
        value={getDate(value)}
        onChange={(date) => onChange(key, date ? (renderFormattedPayloadDate(date) ?? null) : null)}
        buttonVariant="transparent-with-text"
        hideIcon
        isClearable={!required}
        placeholder={error ?? placeholderFor(required)}
        formatToken={dateToken}
        className="w-full"
        buttonContainerClassName="w-full text-left"
        buttonClassName={cn("group tabular-nums", PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}
        labelClassName={cn("text-14 font-normal", !value && (error ? "text-danger-primary" : "text-placeholder"))}
        // 清除叉号平时不占位，悬停才出
        clearIconClassName="hidden size-3 group-hover:block"
      />
    );
  };

  const renderLead = (key: TLeadFieldKey) => {
    if (!editable) {
      const user = product?.[`${key}_detail` as const];
      return <ReadonlyPeopleValue users={user ? [user] : []} />;
    }
    const value = values[key];
    return (
      <MemberDropdown
        multiple={false}
        value={value}
        onChange={(next) => onChange(key, next)}
        buttonVariant="transparent-with-text"
        className="w-full"
        buttonContainerClassName="text-left"
        button={<MemberValueButton userIds={value ? [value] : []} placeholder={placeholderFor(true)} error={errors[key]} />}
      />
    );
  };

  const ownerControl = editable ? (
    <MemberDropdown
      multiple={false}
      value={owner.value}
      memberIds={owner.memberIds}
      onChange={owner.onChange}
      buttonVariant="transparent-with-text"
      className="w-full"
      buttonContainerClassName="text-left"
      button={
        <MemberValueButton
          userIds={owner.value ? [owner.value] : []}
          placeholder={placeholderFor(true)}
          error={owner.error}
        />
      }
    />
  ) : (
    <ReadonlyPeopleValue users={product?.owner_detail ? [product.owner_detail] : []} />
  );

  const reviewersControl = editable ? (
    <MemberDropdown
      multiple
      value={values.reviewers}
      onChange={(next) => onChange("reviewers", next)}
      buttonVariant="transparent-with-text"
      className="w-full"
      buttonContainerClassName="text-left"
      button={<MemberValueButton userIds={values.reviewers} placeholder={placeholderFor(false)} error={errors.reviewers} />}
    />
  ) : (
    <ReadonlyPeopleValue users={product?.reviewer_details ?? []} />
  );

  return (
    <div
      data-modal-wheel-scroll
      className={cn(
        "vertical-scrollbar scrollbar-sm flex min-w-0 flex-col gap-5 border-subtle bg-surface-2 px-7 pt-6.5 pb-5 max-md:border-t md:overflow-y-auto md:border-l",
        className
      )}
    >
      <PropertyRailGroup title={t("workspace_products.extended.classification")}>
        <PropertyRailRow icon={Layers} label={label("stage_short")} required={editable}>
          {renderDictionary("stage")}
        </PropertyRailRow>
        <PropertyRailRow icon={Activity} label={label("status_short")} required={editable}>
          {renderDictionary("status")}
        </PropertyRailRow>
        <PropertyRailRow icon={Tag} label={label("category_short")} required={editable}>
          {renderDictionary("category")}
        </PropertyRailRow>
      </PropertyRailGroup>

      <PropertyRailGroup title={t("workspace_products.extended.levels")}>
        <PropertyRailRow icon={Cpu} label={label("hardware_level_short")} required={editable}>
          {renderDictionary("hardware_level")}
        </PropertyRailRow>
        <PropertyRailRow icon={Box} label={label("structure_level_short")} required={editable}>
          {renderDictionary("structure_level")}
        </PropertyRailRow>
        <PropertyRailRow icon={CodeXml} label={label("software_level_short")} required={editable}>
          {renderDictionary("software_level")}
        </PropertyRailRow>
      </PropertyRailGroup>

      <PropertyRailGroup title={t("workspace_products.extended.plan")}>
        <PropertyRailRow icon={CalendarDays} label={label("start_date")} required={editable}>
          {renderDate("start_date")}
        </PropertyRailRow>
        <PropertyRailRow icon={Flag} label={label("o_phase_close_date_short")}>
          {renderDate("o_phase_close_date")}
        </PropertyRailRow>
        <PropertyRailRow icon={Flag} label={label("v_phase_close_date_short")}>
          {renderDate("v_phase_close_date")}
        </PropertyRailRow>
      </PropertyRailGroup>

      <PropertyRailGroup title={t("workspace_products.extended.team")}>
        <PropertyRailRow icon={Crown} label={label("product_owner")} required={editable}>
          {ownerControl}
        </PropertyRailRow>
        {editable && owner.warning ? (
          <p className="mb-1 flex items-start gap-1.5 pl-[122px] text-12 leading-5 text-warning-primary">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {owner.warning}
          </p>
        ) : null}
        <PropertyRailRow icon={UserRound} label={label("project_lead")} required={editable}>
          {renderLead("project_lead")}
        </PropertyRailRow>
        <PropertyRailRow icon={FlaskConical} label={label("test_lead")} required={editable}>
          {renderLead("test_lead")}
        </PropertyRailRow>
        <PropertyRailRow icon={UsersRound} label={label("reviewers")}>
          {reviewersControl}
        </PropertyRailRow>
      </PropertyRailGroup>
    </div>
  );
});
