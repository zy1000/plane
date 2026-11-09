import { useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  changeFieldType,
  getNormalizedSelectOptions,
  removeSelectOption,
} from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import { FieldChoiceSelect } from "@/components/project-issue-types/field-choice-select";

const INPUT =
  "h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-secondary focus:border-accent-strong";
const TYPES = [
  { key: "select", label: "下拉选择" },
  { key: "text", label: "文本" },
  { key: "number", label: "数字" },
  { key: "date", label: "日期" },
  { key: "user", label: "人员" },
  { key: "boolean", label: "是 / 否" },
];

function Segments({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex h-9 rounded-md border border-subtle bg-surface-1 p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          className={cn(
            "flex-1 rounded px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
            value === option.key
              ? "bg-accent-primary font-medium text-on-color"
              : "text-secondary hover:bg-layer-1-hover"
          )}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function IssueFieldSettings({
  form,
  onChange,
  nameInputRef,
  isEditing,
  disabled,
}: {
  form: TFieldFormState;
  onChange: (form: TFieldFormState) => void;
  nameInputRef: RefObject<HTMLInputElement>;
  isEditing: boolean;
  disabled: boolean;
}) {
  const [showDescription, setShowDescription] = useState(Boolean(form.description));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = getNormalizedSelectOptions(form.select_options).map((key) => ({ key, label: key }));
  const isSelect = form.field_type === "select";
  const isMultiple = isSelect ? form.select_is_multiple : form.user_is_multiple;
  const renameOption = (index: number, text: string) => {
    const previous = form.select_options[index]?.trim();
    const next = text.trim();
    const select_options = [...form.select_options];
    select_options[index] = text;
    onChange({
      ...form,
      select_options,
      select_default_value: previous && form.select_default_value === previous ? next : form.select_default_value,
      select_default_values: form.select_default_values.map((v) => (previous && v === previous ? next : v)),
      linkage: form.linkage.options
        ? {
            ...form.linkage,
            options: {
              ...form.linkage.options,
              mappings: Object.fromEntries(
                Object.entries(form.linkage.options.mappings).map(([key, values]) => [
                  key,
                  values.map((v) => (previous && v === previous ? next : v)),
                ])
              ),
            },
          }
        : form.linkage,
    });
  };
  const moveOption = (from: number, to: number, focus = false) => {
    if (to < 0 || to >= form.select_options.length || from === to) return;
    const select_options = [...form.select_options];
    const [item] = select_options.splice(from, 1);
    select_options.splice(to, 0, item);
    onChange({ ...form, select_options });
    if (focus)
      requestAnimationFrame(() =>
        listRef.current?.querySelector<HTMLButtonElement>(`[data-option-handle="${to}"]`)?.focus()
      );
  };
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-60">
      <label className="flex flex-col gap-2">
        <span className="text-13 font-medium text-primary">
          字段名称<span className="ml-1 text-danger-primary">*</span>
        </span>
        <input
          ref={nameInputRef}
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          maxLength={255}
          placeholder="例如：处理方式"
          className={INPUT}
          aria-required
        />
      </label>
      <div
        className={cn(
          "grid gap-5",
          (isSelect || form.field_type === "user" || form.field_type === "text") &&
            "sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        )}
      >
        <div className="space-y-2">
          <p className="text-13 font-medium text-primary">字段类型</p>
          <FieldChoiceSelect
            label="字段类型"
            value={form.field_type}
            choices={TYPES}
            disabled={isEditing || disabled}
            onChange={(type) => onChange(changeFieldType(form, type as TFieldFormState["field_type"]))}
          />
        </div>
        {(isSelect || form.field_type === "user") && (
          <div className="space-y-2">
            <p className="text-13 font-medium text-primary">选择方式</p>
            <Segments
              label="选择方式"
              value={isMultiple ? "multiple" : "single"}
              options={[
                { key: "single", label: "单选" },
                { key: "multiple", label: "多选" },
              ]}
              onChange={(mode) => {
                const multiple = mode === "multiple";
                if (multiple === isMultiple) return;
                if (!isSelect) onChange({ ...form, user_is_multiple: multiple });
                else
                  onChange({
                    ...form,
                    select_is_multiple: multiple,
                    select_default_values: multiple && form.select_default_value ? [form.select_default_value] : [],
                    select_default_value: multiple ? "" : (form.select_default_values[0] ?? ""),
                  });
              }}
            />
          </div>
        )}
        {form.field_type === "text" && (
          <div className="space-y-2">
            <p className="text-13 font-medium text-primary">文本格式</p>
            <Segments
              label="文本格式"
              value={form.text_is_paragraph ? "paragraph" : "single"}
              options={[
                { key: "single", label: "单行" },
                { key: "paragraph", label: "多行" },
              ]}
              onChange={(value) => onChange({ ...form, text_is_paragraph: value === "paragraph" })}
            />
          </div>
        )}
      </div>
      {isSelect && (
        <section className="space-y-2.5" aria-label="字段选项">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-13 font-medium text-primary">
              选项<span className="rounded bg-layer-1 px-1.5 text-12 text-secondary">{options.length}</span>
            </h3>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-13 text-accent-primary hover:underline"
              onClick={() => {
                onChange({ ...form, select_options: [...form.select_options, ""] });
                requestAnimationFrame(() =>
                  listRef.current
                    ?.querySelector<HTMLInputElement>(`[data-option-input="${form.select_options.length}"]`)
                    ?.focus()
                );
              }}
            >
              <Plus className="size-3.5" />
              添加选项
            </button>
          </div>
          <div ref={listRef} className="max-h-60 space-y-2 overflow-y-auto" data-modal-wheel-scroll>
            {form.select_options.map((option, index) => (
              <div
                key={index}
                className={cn("flex items-center gap-2 rounded-md", draggedIndex === index && "opacity-40")}
                onDragOver={(event) => {
                  if (draggedIndex !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedIndex !== null) moveOption(draggedIndex, index);
                  setDraggedIndex(null);
                }}
              >
                <button
                  type="button"
                  draggable={!disabled}
                  data-option-handle={index}
                  aria-label={`调整选项 ${index + 1} 顺序`}
                  title="拖动排序，或按 Alt + 上下方向键"
                  className="cursor-grab rounded text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-accent-strong active:cursor-grabbing"
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", String(index));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedIndex(index);
                  }}
                  onDragEnd={() => setDraggedIndex(null)}
                  onKeyDown={(event) => {
                    if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
                      event.preventDefault();
                      moveOption(index, index + (event.key === "ArrowUp" ? -1 : 1), true);
                    }
                  }}
                >
                  <GripVertical className="size-4" />
                </button>
                <input
                  data-option-input={index}
                  aria-label={`选项 ${index + 1}`}
                  value={option}
                  onChange={(event) => renameOption(index, event.target.value)}
                  className={cn(INPUT, "min-w-0 flex-1")}
                  placeholder="选项名称"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
                <button
                  type="button"
                  aria-label={`删除选项 ${index + 1}`}
                  disabled={form.select_options.length <= 1}
                  className="grid size-7 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-1-hover hover:text-danger-primary disabled:opacity-30"
                  onClick={() => {
                    const next = removeSelectOption(form, index);
                    if (next.linkage.options)
                      next.linkage = {
                        ...next.linkage,
                        options: {
                          ...next.linkage.options,
                          mappings: Object.fromEntries(
                            Object.entries(next.linkage.options.mappings).map(([key, values]) => [
                              key,
                              values.filter((v) => v !== option.trim()),
                            ])
                          ),
                        },
                      };
                    onChange(next);
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {isSelect && (
        <div className="space-y-2">
          <p className="text-13 font-medium text-primary">默认值</p>
          {form.select_is_multiple ? (
            <FieldChoiceSelect
              multiple
              label="默认值"
              value={form.select_default_values}
              choices={options}
              placeholder="不设置默认值"
              disabled={disabled}
              onChange={(select_default_values) => onChange({ ...form, select_default_values })}
            />
          ) : (
            <FieldChoiceSelect
              label="默认值"
              value={form.select_default_value}
              choices={[{ key: "", label: "不设置默认值" }, ...options]}
              placeholder="不设置默认值"
              disabled={disabled}
              onChange={(select_default_value) => onChange({ ...form, select_default_value })}
            />
          )}
        </div>
      )}
      {form.field_type === "number" && (
        <label className="flex flex-col gap-2 text-13 font-medium text-primary">
          默认值
          <input
            type="number"
            value={form.number_default_value}
            onChange={(event) => onChange({ ...form, number_default_value: event.target.value })}
            className={INPUT}
            placeholder="不设置默认值"
          />
        </label>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-13 font-medium text-primary">设为必填</p>
          <p className="mt-1 text-12 text-secondary">显示此字段时必须填写</p>
        </div>
        <ToggleSwitch
          label="设为必填"
          size="md"
          value={form.is_required}
          disabled={disabled}
          onChange={(is_required) => onChange({ ...form, is_required })}
        />
      </div>
      <div className="space-y-2">
        <button
          type="button"
          aria-expanded={showDescription}
          onClick={() => setShowDescription(!showDescription)}
          className="inline-flex items-center gap-1.5 text-13 text-secondary hover:text-primary"
        >
          <ChevronRight className={cn("size-3.5", showDescription && "rotate-90")} />
          {showDescription ? "字段说明" : form.description ? "查看字段说明" : "添加字段说明"}
        </button>
        {showDescription && (
          <textarea
            aria-label="字段说明"
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
            placeholder="填写字段的用途或填写提示"
            className={cn(INPUT, "min-h-20 resize-y py-2")}
          />
        )}
      </div>
    </fieldset>
  );
}
