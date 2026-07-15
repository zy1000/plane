import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@plane/utils";
import type { TStructuredField, TStructuredRow, TStructuredValue } from "@/services/requirement-structure.service";

/** 从行数据里取出某个字段的当前值，auto_id 回退到 display_id */
export function fieldValue(field: TStructuredField, row: TStructuredRow): TStructuredValue {
  if (field.field_type === "auto_id") return (row.values[field.key] as TStructuredValue) ?? row.display_id ?? "";
  return row.values[field.key] ?? (field.field_type === "boolean" ? null : "");
}

/** 把一行的全部字段收敛成一个可提交的草稿对象 */
export function seedDraft(fields: TStructuredField[], row: TStructuredRow): Record<string, TStructuredValue> {
  return Object.fromEntries(fields.map((field) => [field.key, fieldValue(field, row)]));
}

function isRange(value: TStructuredValue | undefined): value is { min: string; max: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 只读态下把结构化值渲染成可读文本 */
export function formatFieldValue(field: TStructuredField, value: TStructuredValue | undefined): string {
  if (field.field_type === "boolean") return value === true ? "是" : value === false ? "否" : "";
  if (field.field_type === "select") {
    const options = field.options.options ?? [];
    const labelOf = (key: string) => options.find((option) => option.key === key)?.label ?? key;
    if (Array.isArray(value)) return value.map(labelOf).join("、");
    return typeof value === "string" && value ? labelOf(value) : "";
  }
  if (field.field_type === "number_range") {
    if (!isRange(value)) return "";
    const min = value.min ?? "";
    const max = value.max ?? "";
    if (!min && !max) return "";
    return `${min || "…"} ~ ${max || "…"}`;
  }
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const INPUT_CLASS =
  "block w-full min-w-0 border border-transparent bg-transparent px-2.5 py-2 text-13 text-primary outline-none transition-colors placeholder:text-placeholder hover:border-subtle focus:border-accent-primary focus:bg-surface-1";

type StructuredFieldCellProps = {
  field: TStructuredField;
  value: TStructuredValue | undefined;
  editable: boolean;
  /** 单元格值变化（仅写入草稿，不立即请求） */
  onChange: (value: TStructuredValue) => void;
  /** 提交时机：失焦或离散选择后触发所在行的自动保存 */
  onCommit: () => void;
};

export function StructuredFieldCell(props: StructuredFieldCellProps) {
  const { editable, field, onChange, onCommit, value } = props;

  // auto_id 永远只读展示
  if (field.field_type === "auto_id") {
    return (
      <div className="px-2.5 py-2">
        <span className="font-mono text-12 font-semibold text-accent-primary">
          {String(value || "待生成")}
        </span>
      </div>
    );
  }

  if (!editable) {
    const text = formatFieldValue(field, value);
    return (
      <div
        className={cn(
          "px-2.5 py-2 text-13 text-secondary",
          field.field_type === "text" && field.config.multiline && "whitespace-pre-wrap"
        )}
      >
        {text || <span className="text-placeholder">—</span>}
      </div>
    );
  }

  if (field.field_type === "boolean") {
    return (
      <SelectShell>
        <select
          value={value === null || value === undefined ? "" : value ? "true" : "false"}
          onChange={(event) => {
            onChange(event.target.value === "" ? null : event.target.value === "true");
            onCommit();
          }}
          className={cn(INPUT_CLASS, "appearance-none pr-7")}
        >
          <option value="">未设置</option>
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      </SelectShell>
    );
  }

  if (field.field_type === "select") {
    const options = field.options.options ?? [];
    if (field.config.selection_mode === "multiple") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
          {options.length === 0 && <span className="px-0.5 text-12 text-placeholder">无可选项</span>}
          {options.map((option) => {
            const active = selected.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  onChange(active ? selected.filter((key) => key !== option.key) : [...selected, option.key]);
                  onCommit();
                }}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-12 transition-colors",
                  active
                    ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
                    : "border-subtle text-secondary hover:border-strong hover:text-primary"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <SelectShell>
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => {
            onChange(event.target.value || null);
            onCommit();
          }}
          className={cn(INPUT_CLASS, "appearance-none pr-7")}
        >
          <option value="">未设置</option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </SelectShell>
    );
  }

  if (field.field_type === "number_range") {
    return <RangeCell value={value} onChange={onChange} onCommit={onCommit} />;
  }

  if (field.field_type === "text" && field.config.multiline) {
    return <MultilineCell value={value} onChange={onChange} onCommit={onCommit} />;
  }

  return (
    <TextCell
      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
}

function SelectShell(props: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {props.children}
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-tertiary" />
    </div>
  );
}

function TextCell(props: {
  type: "text" | "number" | "date";
  value: TStructuredValue | undefined;
  onChange: (value: TStructuredValue) => void;
  onCommit: () => void;
}) {
  const { onChange, onCommit, type, value } = props;
  const [draft, setDraft] = useState(typeof value === "string" ? value : "");
  useEffect(() => setDraft(typeof value === "string" ? value : ""), [value]);
  return (
    <input
      type={type}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && type !== "date") event.currentTarget.blur();
      }}
      className={INPUT_CLASS}
    />
  );
}

function MultilineCell(props: {
  value: TStructuredValue | undefined;
  onChange: (value: TStructuredValue) => void;
  onCommit: () => void;
}) {
  const { onChange, onCommit, value } = props;
  const [draft, setDraft] = useState(typeof value === "string" ? value : "");
  useEffect(() => setDraft(typeof value === "string" ? value : ""), [value]);
  return (
    <textarea
      rows={1}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onBlur={onCommit}
      className={cn(INPUT_CLASS, "min-h-9 resize-y leading-5")}
    />
  );
}

function RangeCell(props: {
  value: TStructuredValue | undefined;
  onChange: (value: TStructuredValue) => void;
  onCommit: () => void;
}) {
  const { onChange, onCommit, value } = props;
  const initial = isRange(value) ? value : { min: "", max: "" };
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(isRange(value) ? value : { min: "", max: "" }), [value]);
  const update = (next: { min: string; max: string }) => {
    setDraft(next);
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1 px-1">
      <input
        type="number"
        value={draft.min}
        onChange={(event) => update({ ...draft, min: event.target.value })}
        onBlur={onCommit}
        placeholder="最小"
        className={cn(INPUT_CLASS, "px-1.5 text-center")}
      />
      <span className="shrink-0 text-tertiary">~</span>
      <input
        type="number"
        value={draft.max}
        onChange={(event) => update({ ...draft, max: event.target.value })}
        onBlur={onCommit}
        placeholder="最大"
        className={cn(INPUT_CLASS, "px-1.5 text-center")}
      />
    </div>
  );
}
