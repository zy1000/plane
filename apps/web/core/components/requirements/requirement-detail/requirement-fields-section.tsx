"use client";

import { Info, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { RequirementIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type {
  TRequirement,
  TRequirementAssetRef,
  TRequirementData,
  TRequirementField,
  TRequirementTypeSchema,
  TRequirementValue,
} from "@plane/types";
import { cn } from "@plane/utils";
import { LeafEditor, LeafValue } from "@/components/requirements/requirement-grid-shared";
import { DetailSectionHeader, SECTION_ACTION_BUTTON } from "./requirement-detail-section";
import { RequirementSubformSection } from "./requirement-subform-section";

/**
 * 通栏字段：富文本、附件、图片展开后都比一格宽。可重复表单（form）本来就是一张表，
 * 由 RequirementSubformSection 渲染，恒通栏。
 */
const WIDE_FIELD_TYPES = new Set<string>(["rich_text", "attachment", "image"]);

/**
 * 抽屉里由需求类型定义的字段区。
 *
 * 字段不是固定的 —— 每个需求类型各有一套，类型改了字段立刻跟着变。所以这一区不能靠
 * 手排，只能靠规则：按类型定义的顺序流式排布，**字段类型决定宽度**（短字段两列、长字段
 * 通栏），任何数量、任何组合都能排整齐。区块标题写明字段来自哪个类型、右上直达类型
 * 设置，用户不必猜「这个字段是哪来的、去哪改」。
 */
export const RequirementFieldsSection = ({
  workspaceSlug,
  requirement,
  requirementType,
  leafFields,
  formFields,
  readOnly,
  onChange,
  onUpload,
}: {
  workspaceSlug: string;
  requirement: TRequirement;
  requirementType: TRequirementTypeSchema | null;
  /** 已按 sort_order 排好的非 form 字段 */
  leafFields: TRequirementField[];
  /** 已按 sort_order 排好的 form 字段 */
  formFields: TRequirementField[];
  readOnly: boolean;
  onChange: (data: TRequirementData) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
}) => {
  const { t } = useTranslation();
  const count = leafFields.length + formFields.length;
  if (!count) return null;

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeader
        icon={RequirementIcon}
        title={t("requirement_detail.custom_fields")}
        meta={
          requirementType
            ? t("requirement_detail.fields_section.defined_by", { name: requirementType.name, count })
            : undefined
        }
        actions={
          requirementType ? (
            // 新标签打开：抽屉里的编辑状态（草稿、展开的子表单）不该因为去看一眼字段定义而丢掉
            <a
              href={`/${workspaceSlug}/settings/requirement-types/${requirementType.id}`}
              target="_blank"
              rel="noreferrer noopener"
              className={SECTION_ACTION_BUTTON}
            >
              <Settings2 className="size-3.5" />
              {t("requirement_detail.fields_section.manage")}
            </a>
          ) : undefined
        }
      />

      {leafFields.length > 0 && (
        // 标签和值拆成独立格子，同一列共用一条标签轨，值才能对齐；
        // 轨宽跟该列最长名称走，不会为短名称空出一截。两列只在抽屉够宽时开。
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-8 gap-y-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {leafFields.map((field) => (
            <RequirementFieldRow
              key={field.id}
              field={field}
              value={requirement.data[field.id]}
              workspaceSlug={workspaceSlug}
              entityId={requirement.id}
              readOnly={readOnly}
              wide={WIDE_FIELD_TYPES.has(field.field_type)}
              onChange={(value) => onChange({ ...requirement.data, [field.id]: value })}
              onUpload={onUpload}
            />
          ))}
        </div>
      )}

      {formFields.length > 0 && (
        <RequirementSubformSection
          forms={formFields}
          data={requirement.data}
          workspaceSlug={workspaceSlug}
          entityId={requirement.id}
          readOnly={readOnly}
          defaultOpenCount={1}
          defaultOpenEmpty={!readOnly}
          storageKey={`requirement:subforms:${requirement.requirement_type_id}`}
          onChange={onChange}
          onUpload={onUpload}
        />
      )}
    </section>
  );
};

/**
 * 一个字段：标签左、值右。自身不建网格，交给外层共用标签轨，值才能对齐。
 * 超长名称截到 6rem。必填标红星；字段说明收成标签后的 ⓘ。
 */
const RequirementFieldRow = ({
  field,
  value,
  workspaceSlug,
  entityId,
  readOnly,
  wide,
  onChange,
  onUpload,
}: {
  field: TRequirementField;
  value: TRequirementValue | undefined;
  workspaceSlug: string;
  entityId: string;
  readOnly: boolean;
  wide: boolean;
  onChange: (value: TRequirementValue) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
}) => {
  const description = field.config?.description?.trim();
  return (
    <>
      <span
        className={cn(
          "flex min-w-0 max-w-24 items-center gap-1 pt-1.5 text-body-xs-regular leading-5 text-tertiary",
          wide && "lg:col-start-1"
        )}
      >
        <span className="truncate" title={field.name}>
          {field.name}
        </span>
        {field.is_required && <span className="shrink-0 text-danger-primary">*</span>}
        {description && (
          <Tooltip tooltipContent={description} position="top">
            <Info className="size-3 shrink-0 cursor-help text-placeholder" />
          </Tooltip>
        )}
      </span>
      <div className={cn("min-w-0", wide ? "lg:col-span-3" : "max-w-sm")}>
        {readOnly ? (
          <div className="pt-1.5">
            <LeafValue field={field} value={value} workspaceSlug={workspaceSlug} variant="detail" />
          </div>
        ) : (
          <LeafEditor
            field={field}
            value={value}
            workspaceSlug={workspaceSlug}
            entityId={entityId}
            onChange={onChange}
            onUpload={onUpload}
            variant="detail"
          />
        )}
      </div>
    </>
  );
};
