import { useState } from "react";
import { EyeOff } from "lucide-react";
import type { TIssueExtraFieldValue } from "@plane/types";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { FieldChoiceSelect } from "@/components/project-issue-types/field-choice-select";
import { getNormalizedSelectOptions, getSelectionMode } from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import {
  dependencyClosure,
  evaluateFieldLinkage,
  hasTypeCondition,
  linkageChoices,
  linkageSources,
  linkageTypeIds,
} from "@/utils/field-linkage";
import type { TLinkageField, TLinkageIssueType } from "@/utils/field-linkage";

type TValue = TIssueExtraFieldValue["value"];

/**
 * 联动预览：选一组来源值，看字段在这组取值下显示不显示、可选哪几项、命中规则表的第几行。
 * 规则没有引用任何来源时不渲染。
 */
export function IssueFieldPreview({
  form,
  fields,
  fieldId,
  issueTypes = [],
}: {
  form: TFieldFormState;
  fields: TLinkageField[];
  fieldId?: string;
  /** 字段库才传：规则带工作项类型条件时，预览里可以切换类型 */
  issueTypes?: TLinkageIssueType[];
}) {
  const [sampleValues, setSampleValues] = useState<Record<string, TValue>>({});
  const [previewTypeId, setPreviewTypeId] = useState<string>();
  const targetId = fieldId ?? "__field_preview__";
  // 本字段或它依赖的字段带类型条件时，按选中的类型预览；默认取规则里出现的第一个类型
  const usesType =
    issueTypes.length > 0 &&
    [form.linkage, ...dependencyClosure(fields, linkageSources(form.linkage)).map((f) => f.linkage)].some(
      hasTypeCondition
    );
  const isKnownType = (id?: string) => issueTypes.some((type) => type.id === id);
  const typeId = !usesType
    ? undefined
    : isKnownType(previewTypeId)
      ? previewTypeId
      : (linkageTypeIds(form.linkage).find(isKnownType) ?? issueTypes[0].id);
  const sources = dependencyClosure(fields, linkageSources(form.linkage, typeId), typeId).filter(
    (f) => f.id !== targetId
  );
  if (!usesType && !sources.length) return null;

  const target: TLinkageField = {
    id: targetId,
    name: form.name.trim() || "未命名字段",
    field_type: form.field_type,
    options: {
      choices: getNormalizedSelectOptions(form.select_options),
      selection_mode: form.select_is_multiple ? "multiple" : "single",
    },
    linkage: form.linkage,
  };
  const previewFields = [...sources, target];
  const values: TIssueExtraFieldValue[] = sources.map((source) => ({
    extra_field_id: source.id,
    value:
      sampleValues[source.id] ??
      (getSelectionMode(source.options) === "multiple" ? [] : (linkageChoices(source)[0]?.key ?? "")),
  }));
  const effective = evaluateFieldLinkage(previewFields, values, typeId);
  const effectiveTarget = effective.fields.find((f) => f.id === targetId);
  const matchedRules = effective.matchedOptionRules.get(targetId);
  const updateValue = (id: string, next: TValue) => {
    const nextValues = effective.values.map((v) => (v.extra_field_id === id ? { ...v, value: next } : v));
    const normalized = evaluateFieldLinkage(previewFields, nextValues, typeId).values;
    setSampleValues(Object.fromEntries(normalized.map((v) => [v.extra_field_id, v.value])));
  };

  return (
    <section aria-label="联动预览" className="rounded-xl bg-layer-1 px-5 py-4">
      <h3 className="text-14 font-semibold text-primary">预览</h3>
      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
        {usesType && (
          <div className="min-w-0 space-y-1.5">
            <p className="text-13 text-secondary">工作项类型</p>
            <FieldChoiceSelect
              label="预览：工作项类型"
              choices={issueTypes.map((type) => ({
                key: type.id,
                label: type.name,
                icon: (
                  <TypeIcon
                    iconProps={type.logo_props?.icon}
                    className="size-4 shrink-0 rounded"
                    iconClassName="size-3.5"
                  />
                ),
              }))}
              value={typeId ?? ""}
              onChange={setPreviewTypeId}
            />
          </div>
        )}
        {effective.fields
          .filter((f) => f.id !== targetId)
          .map((source) => {
            const current = effective.values.find((v) => v.extra_field_id === source.id)?.value;
            return (
              <div key={source.id} className="min-w-0 space-y-1.5">
                <p className="truncate text-13 text-secondary">{source.name}</p>
                {getSelectionMode(source.options) === "multiple" ? (
                  <FieldChoiceSelect
                    multiple
                    label={`预览：${source.name}`}
                    placeholder="未选择"
                    choices={linkageChoices(source)}
                    value={Array.isArray(current) ? current : []}
                    onChange={(value) => updateValue(source.id, value)}
                  />
                ) : (
                  <FieldChoiceSelect
                    label={`预览：${source.name}`}
                    placeholder="未选择"
                    choices={[{ key: "", label: "未选择" }, ...linkageChoices(source)]}
                    value={typeof current === "string" ? current : ""}
                    onChange={(value) => updateValue(source.id, value)}
                  />
                )}
              </div>
            );
          })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-subtle pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1.5 text-14 font-medium text-primary">{target.name}</span>
          {!effectiveTarget ? (
            <span className="inline-flex items-center gap-1.5 text-14 text-secondary">
              <EyeOff className="size-4" />
              不显示
            </span>
          ) : !matchedRules ? (
            // 这组取值下不受可选项联动限制
            <span className="text-14 text-secondary">显示</span>
          ) : matchedRules.length ? (
            linkageChoices(effectiveTarget).map((choice) => (
              <span
                key={choice.key}
                className="flex h-[26px] max-w-full items-center rounded-md bg-accent-subtle px-2 text-13 text-accent-primary"
              >
                <span className="truncate">{choice.label}</span>
              </span>
            ))
          ) : (
            <span className="text-14 text-secondary">无可选项</span>
          )}
        </div>
        {effectiveTarget && Boolean(matchedRules?.length) && (
          <span className="shrink-0 text-13 text-secondary">
            命中第 {matchedRules!.map((index) => index + 1).join("、")} 行
          </span>
        )}
      </div>
    </section>
  );
}
