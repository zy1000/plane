import { useState } from "react";
import { Check, ChevronDown, EyeOff } from "lucide-react";
import type { TIssueExtraFieldValue } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { getNormalizedSelectOptions, getSelectionMode } from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import { FieldChoiceSelect } from "@/components/project-issue-types/field-choice-select";
import { dependencyClosure, evaluateFieldLinkage, linkageChoices, linkageSources } from "@/utils/field-linkage";
import type { TLinkageField } from "@/utils/field-linkage";

type TValue = TIssueExtraFieldValue["value"];
const INPUT =
  "h-9 w-full rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-primary outline-none focus:border-accent-strong";

export function IssueFieldPreview({
  form,
  fields,
  fieldId,
  showLinkage,
}: {
  form: TFieldFormState;
  fields: TLinkageField[];
  fieldId?: string;
  showLinkage: boolean;
}) {
  const [sampleValues, setSampleValues] = useState<Record<string, TValue>>({});
  const targetId = fieldId ?? "__field_preview__";
  const sources = showLinkage
    ? dependencyClosure(fields, linkageSources(form.linkage)).filter((f) => f.id !== targetId)
    : [];
  const target: TLinkageField = {
    id: targetId,
    name: form.name.trim() || "未命名字段",
    field_type: form.field_type,
    options: {
      choices: getNormalizedSelectOptions(form.select_options),
      selection_mode: form.select_is_multiple ? "multiple" : "single",
    },
    linkage: showLinkage ? form.linkage : {},
  };
  const previewFields = [...sources, target];
  const values: TIssueExtraFieldValue[] = sources.map((source) => ({
    extra_field_id: source.id,
    value:
      sampleValues[source.id] ??
      (getSelectionMode(source.options) === "multiple" ? [] : (linkageChoices(source)[0]?.key ?? "")),
  }));
  const defaultValue =
    form.field_type === "select"
      ? form.select_is_multiple
        ? form.select_default_values
        : form.select_default_value
      : form.field_type === "number"
        ? form.number_default_value
        : null;
  values.push({
    extra_field_id: targetId,
    value: sampleValues[targetId] !== undefined ? sampleValues[targetId] : defaultValue,
  });
  const effective = evaluateFieldLinkage(previewFields, values);
  const effectiveTarget = effective.fields.find((f) => f.id === targetId);
  const choices = effectiveTarget ? linkageChoices(effectiveTarget) : [];
  const targetValue = effective.values.find((v) => v.extra_field_id === targetId)?.value;
  const updateValue = (id: string, next: TValue) => {
    const nextValues = effective.values.map((v) => (v.extra_field_id === id ? { ...v, value: next } : v));
    const normalized = evaluateFieldLinkage(previewFields, nextValues).values;
    setSampleValues(Object.fromEntries(normalized.map((v) => [v.extra_field_id, v.value])));
  };

  return (
    <aside
      aria-label="字段填写预览"
      className="flex min-h-72 flex-col border-t border-subtle bg-layer-1/60 px-6 py-6 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-l"
      data-modal-wheel-scroll
    >
      <h3 className="text-15 font-semibold text-primary">{showLinkage ? "联动预览" : "填写效果"}</h3>
      <p className="mt-1.5 text-12 leading-5 text-secondary">
        {showLinkage ? "切换来源值，查看填写效果" : "创建工作项时的样子"}
      </p>
      <div className="mt-8 space-y-5">
        {effective.fields
          .filter((f) => f.id !== targetId)
          .map((source) => {
            const current = effective.values.find((v) => v.extra_field_id === source.id)?.value;
            return (
              <div key={source.id} className="space-y-2">
                <p className="text-13 font-medium break-words text-primary">{source.name}</p>
                {getSelectionMode(source.options) === "multiple" ? (
                  <FieldChoiceSelect
                    multiple
                    label={`预览：${source.name}`}
                    placeholder="选择来源值"
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
        {!effectiveTarget ? (
          <div className="flex gap-2 py-3 text-13 leading-5 text-secondary">
            <EyeOff className="mt-0.5 size-4 shrink-0" />
            当前条件下，此字段隐藏。
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-13 font-medium break-words text-primary">
              {target.name}
              {form.is_required && <span className="ml-1 text-danger-primary">*</span>}
            </p>
            {form.field_type === "select" ? (
              <>
                <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-13 text-secondary">
                  <span className="min-w-0 break-words">
                    {Array.isArray(targetValue)
                      ? targetValue.join("、") || "请选择"
                      : targetValue || `请选择${form.name.trim() || "选项"}`}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0" />
                </div>
                <div
                  role="group"
                  aria-label="预览可选项"
                  className="max-h-56 overflow-y-auto rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-100"
                  data-modal-wheel-scroll
                >
                  {choices.map((choice) => {
                    const selected = Array.isArray(targetValue)
                      ? targetValue.includes(choice.key)
                      : targetValue === choice.key;
                    return (
                      <button
                        type="button"
                        key={choice.key}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-13 text-primary hover:bg-layer-1-hover focus-visible:outline-accent-strong",
                          selected && "bg-accent-subtle"
                        )}
                        onClick={() => {
                          const current = Array.isArray(targetValue) ? targetValue : [];
                          updateValue(
                            targetId,
                            form.select_is_multiple
                              ? selected
                                ? current.filter((v) => v !== choice.key)
                                : [...current, choice.key]
                              : selected
                                ? null
                                : choice.key
                          );
                        }}
                      >
                        <span className="break-words">{choice.label}</span>
                        {selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                      </button>
                    );
                  })}
                  {!choices.length && (
                    <p className="px-2.5 py-3 text-12 leading-5 text-secondary">
                      {showLinkage && form.linkage.options ? "当前来源值没有匹配的可选项" : "添加选项后，可在此预览"}
                    </p>
                  )}
                </div>
                {showLinkage && (
                  <p className="flex items-center gap-2 pt-2 text-12 text-secondary">
                    <span className="size-1.5 rounded-full bg-accent-primary" />
                    当前可选 {choices.length} 项
                  </p>
                )}
              </>
            ) : form.field_type === "boolean" ? (
              <ToggleSwitch
                size="md"
                label={`预览：${target.name}`}
                value={targetValue === true}
                onChange={(value) => updateValue(targetId, value)}
              />
            ) : form.field_type === "user" ? (
              <div className={cn(INPUT, "flex items-center justify-between text-secondary")}>
                <span>{form.user_is_multiple ? "选择成员（多选）" : "选择成员"}</span>
                <ChevronDown className="size-3.5" />
              </div>
            ) : form.field_type === "text" && form.text_is_paragraph ? (
              <textarea
                aria-label={`预览：${target.name}`}
                className={cn(INPUT, "h-24 py-2")}
                placeholder="输入多行文本"
                value={String(targetValue ?? "")}
                onChange={(e) => updateValue(targetId, e.target.value)}
              />
            ) : (
              <input
                aria-label={`预览：${target.name}`}
                type={form.field_type === "number" ? "number" : form.field_type === "date" ? "date" : "text"}
                className={INPUT}
                placeholder="请输入"
                value={String(targetValue ?? "")}
                onChange={(e) => updateValue(targetId, e.target.value)}
              />
            )}
            {form.description && <p className="text-12 leading-5 break-words text-secondary">{form.description}</p>}
          </div>
        )}
      </div>
      <p className="mt-auto pt-8 text-12 text-secondary">预览不会保存数据</p>
    </aside>
  );
}
