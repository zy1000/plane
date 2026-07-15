import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Info, Plus, Table2, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Input, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TStructuredField, TStructuredFieldType } from "@/services/requirement-structure.service";
import { FIELD_TYPE_LIST, FIELD_TYPE_META } from "./requirement-field-types";

const createKey = (): string => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // Fallback for non-secure contexts (http origins) where crypto.randomUUID is unavailable.
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
};

const createField = (parentKey: string | null = null): TStructuredField => ({
  key: createKey(),
  parent_key: parentKey,
  name: parentKey ? "新子字段" : "新字段",
  description: "",
  field_type: "text",
  is_required: false,
  is_active: true,
  config: { multiline: false },
  validation: {},
  options: {},
  default_value: null,
});

const createOption = (position: number) => ({
  key: `option_${createKey().slice(0, 8)}`,
  label: `选项 ${position}`,
  is_active: true,
});

type TSelectOption = { key: string; label: string; is_active?: boolean };

type Props = {
  fields: TStructuredField[];
  onChange: (fields: TStructuredField[]) => void;
  readOnly?: boolean;
};

export function RequirementStructuredSchemaBuilder(props: Props) {
  const { fields, onChange, readOnly = false } = props;
  const rootFields = fields.filter((field) => !field.parent_key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const patchField = (key: string, patch: Partial<TStructuredField>) => {
    onChange(fields.map((field) => (field.key === key ? { ...field, ...patch } : field)));
  };

  const removeField = (key: string) => {
    onChange(fields.filter((field) => field.key !== key && field.parent_key !== key));
  };

  const moveField = (key: string, offset: -1 | 1) => {
    const currentField = fields.find((field) => field.key === key);
    if (!currentField) return;
    const siblings = fields.filter((field) => field.parent_key === currentField.parent_key);
    const index = siblings.findIndex((field) => field.key === key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const currentPosition = fields.findIndex((field) => field.key === siblings[index].key);
    const targetPosition = fields.findIndex((field) => field.key === siblings[target].key);
    const reordered = [...fields];
    [reordered[currentPosition], reordered[targetPosition]] = [reordered[targetPosition], reordered[currentPosition]];
    onChange(reordered);
  };

  const addField = (parentKey: string | null = null) => {
    const field = createField(parentKey);
    onChange([...fields, field]);
    setExpanded((current) => ({ ...current, [field.key]: true }));
  };

  const renderField = (field: TStructuredField, isChild = false) => {
    const availableTypes = isChild ? FIELD_TYPE_LIST.filter((item) => item.value !== "table") : FIELD_TYPE_LIST;
    const meta = FIELD_TYPE_META[field.field_type];
    const Icon = meta.icon;
    const isOpen = !!expanded[field.key];
    const childFields = fields.filter((child) => child.parent_key === field.key);
    const siblings = fields.filter((item) => item.parent_key === field.parent_key);
    const siblingIndex = siblings.findIndex((item) => item.key === field.key);
    const selectOptions = (field.options.options ?? []) as TSelectOption[];
    const updateOptions = (next: TSelectOption[]) => patchField(field.key, { options: { options: next } });

    return (
      <div
        key={field.key}
        className={cn(
          "overflow-hidden",
          isChild ? "bg-surface-1" : "rounded-lg border border-subtle bg-surface-1 shadow-raised-100"
        )}
      >
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => ({ ...current, [field.key]: !isOpen }))}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            aria-label={isOpen ? "收起字段" : "展开字段"}
            aria-expanded={isOpen}
          >
            <ChevronRight className={cn("size-4 transition-transform duration-200", isOpen && "rotate-90")} />
          </button>
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md",
              field.field_type === "auto_id" || field.field_type === "table"
                ? "bg-accent-primary/10 text-accent-primary"
                : "bg-layer-1 text-secondary"
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-[9rem] flex-1 flex-col justify-center">
            <Input
              value={field.name}
              disabled={readOnly}
              onChange={(event) => patchField(field.key, { name: event.target.value })}
              placeholder={isChild ? "子字段名称" : "字段名称"}
              className="h-8 w-full text-13 font-medium"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={field.field_type}
              disabled={readOnly}
              onChange={(event) => {
                const fieldType = event.target.value as TStructuredFieldType;
                const patch: Partial<TStructuredField> = {
                  field_type: fieldType,
                  ...(fieldType === "auto_id" ? { is_required: true } : {}),
                  config:
                    fieldType === "auto_id"
                      ? { prefix: isChild ? "S" : "PR", padding: 0 }
                      : fieldType === "select"
                        ? { selection_mode: "single" }
                        : fieldType === "text"
                          ? { multiline: false }
                          : {},
                  options:
                    fieldType === "select" ? { options: [{ key: "option_1", label: "选项 1", is_active: true }] } : {},
                };
                const nextFields = fields
                  .filter(
                    (item) => !(field.field_type === "table" && fieldType !== "table" && item.parent_key === field.key)
                  )
                  .map((item) => (item.key === field.key ? { ...item, ...patch } : item));
                onChange(nextFields);
              }}
              className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none transition-colors hover:border-strong focus:border-accent-primary disabled:opacity-60"
            >
              {availableTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 rounded-md border border-subtle px-2 py-1">
              <ToggleSwitch
                value={field.is_required}
                disabled={readOnly || field.field_type === "auto_id"}
                onChange={(value) => patchField(field.key, { is_required: value })}
                size="sm"
              />
              <span className="text-11 text-secondary">必填</span>
            </div>
            {!readOnly && (
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={siblingIndex <= 0}
                  onClick={() => moveField(field.key, -1)}
                  className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:opacity-30"
                  aria-label="上移字段"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={siblingIndex >= siblings.length - 1}
                  onClick={() => moveField(field.key, 1)}
                  className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:opacity-30"
                  aria-label="下移字段"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeField(field.key)}
                  className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary"
                  aria-label="删除字段"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="space-y-4 border-t border-subtle bg-layer-1/40 px-3 py-3">
            <div>
              <span className="mb-1 block text-11 font-medium text-secondary">字段说明</span>
              <Input
                value={field.description}
                disabled={readOnly}
                onChange={(event) => patchField(field.key, { description: event.target.value })}
                placeholder="给填写者的提示，例如：额定输入电压范围（可选）"
                className="h-8 text-12"
              />
            </div>

            {field.field_type === "text" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ToggleSwitch
                    value={Boolean(field.config.multiline)}
                    disabled={readOnly}
                    onChange={(value) => patchField(field.key, { config: { ...field.config, multiline: value } })}
                    size="sm"
                  />
                  <span className="text-11 text-secondary">多行文本</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">最小字符数</span>
                    <Input
                      type="number"
                      value={String(field.validation.min_length ?? "")}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, {
                          validation: {
                            ...field.validation,
                            min_length: event.target.value ? Number(event.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">最大字符数</span>
                    <Input
                      type="number"
                      value={String(field.validation.max_length ?? "")}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, {
                          validation: {
                            ...field.validation,
                            max_length: event.target.value ? Number(event.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            )}

            {(field.field_type === "number" || field.field_type === "number_range") && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <span className="mb-1 block text-11 font-medium text-secondary">单位</span>
                  <Input
                    value={String(field.config.unit ?? "")}
                    disabled={readOnly}
                    onChange={(event) => patchField(field.key, { config: { ...field.config, unit: event.target.value } })}
                    placeholder="如 V、A、℃"
                    className="h-8"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-11 font-medium text-secondary">最小值</span>
                  <Input
                    type="number"
                    value={String(field.validation.min ?? "")}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchField(field.key, {
                        validation: { ...field.validation, min: event.target.value || undefined },
                      })
                    }
                    placeholder="不限"
                    className="h-8"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-11 font-medium text-secondary">最大值</span>
                  <Input
                    type="number"
                    value={String(field.validation.max ?? "")}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchField(field.key, {
                        validation: { ...field.validation, max: event.target.value || undefined },
                      })
                    }
                    placeholder="不限"
                    className="h-8"
                  />
                </div>
              </div>
            )}

            {field.field_type === "select" && (
              <div className="space-y-3">
                <div className="sm:w-40">
                  <span className="mb-1 block text-11 font-medium text-secondary">选择模式</span>
                  <select
                    value={String(field.config.selection_mode ?? "single")}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchField(field.key, { config: { ...field.config, selection_mode: event.target.value } })
                    }
                    className="h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none focus:border-accent-primary disabled:opacity-60"
                  >
                    <option value="single">单选</option>
                    <option value="multiple">多选</option>
                  </select>
                </div>
                <div>
                  <span className="mb-1.5 block text-11 font-medium text-secondary">选项</span>
                  <div className="space-y-2">
                    {selectOptions.map((option, index) => (
                      <div key={option.key} className="flex items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-layer-2 text-10 text-tertiary tabular-nums">
                          {index + 1}
                        </span>
                        <Input
                          value={option.label}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateOptions(
                              selectOptions.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, label: event.target.value } : item
                              )
                            )
                          }
                          placeholder={`选项 ${index + 1}`}
                          className="h-8 flex-1"
                        />
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => updateOptions(selectOptions.filter((_, itemIndex) => itemIndex !== index))}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary"
                            aria-label="删除选项"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {selectOptions.length === 0 && (
                      <p className="text-11 text-tertiary">还没有选项，至少添加一个。</p>
                    )}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        prependIcon={<Plus className="size-3.5" />}
                        onClick={() => updateOptions([...selectOptions, createOption(selectOptions.length + 1)])}
                      >
                        添加选项
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {field.field_type === "auto_id" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">编号前缀</span>
                    <Input
                      value={String(field.config.prefix ?? "")}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, { config: { ...field.config, prefix: event.target.value } })
                      }
                      placeholder={isChild ? "S" : "PR"}
                      className="font-mono h-8 uppercase"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">补零位数</span>
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      value={String(field.config.padding ?? 0)}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, {
                          config: { ...field.config, padding: event.target.value ? Number(event.target.value) : 0 },
                        })
                      }
                      placeholder="0"
                      className="h-8"
                    />
                  </div>
                </div>
                <p className="flex items-start gap-1.5 text-10 text-tertiary">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {isChild ? "示例：PR1-S1；每条父记录独立计数。" : "示例：PR1；每个需求独立计数，删除后编号不重用。"}
                </p>
              </div>
            )}

            {field.field_type === "table" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">最少行数</span>
                    <Input
                      type="number"
                      value={String(field.validation.min_rows ?? "")}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, {
                          validation: {
                            ...field.validation,
                            min_rows: event.target.value ? Number(event.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-11 font-medium text-secondary">最多行数</span>
                    <Input
                      type="number"
                      value={String(field.validation.max_rows ?? "")}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchField(field.key, {
                          validation: {
                            ...field.validation,
                            max_rows: event.target.value ? Number(event.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
                  <div className="flex items-center justify-between gap-3 border-b border-subtle px-3 py-2">
                    <span className="flex items-center gap-1.5 text-11 font-medium text-secondary">
                      <Table2 className="size-3.5 text-accent-primary" />
                      子表字段
                      <span className="font-normal text-tertiary">（仅支持一层）</span>
                    </span>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        prependIcon={<Plus className="size-3.5" />}
                        onClick={() => addField(field.key)}
                      >
                        添加子字段
                      </Button>
                    )}
                  </div>
                  {childFields.length === 0 ? (
                    <p className="py-4 text-center text-11 text-tertiary">还没有子字段，添加后即可定义子表列。</p>
                  ) : (
                    <div className="divide-y divide-subtle">{childFields.map((child) => renderField(child, true))}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {rootFields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-strong bg-layer-1 px-6 py-12 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl border border-subtle bg-surface-1">
            <Table2 className="size-5 text-placeholder" />
          </span>
          <p className="mt-3 text-13 font-medium text-primary">还没有字段</p>
          <p className="mt-1 text-11 text-secondary">先定义字段方案，再录入结构化记录。</p>
          {!readOnly && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-4" />}
              className="mt-4"
              onClick={() => addField()}
            >
              添加第一个字段
            </Button>
          )}
        </div>
      ) : (
        <>
          {rootFields.map((field) => renderField(field))}
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              prependIcon={<Plus className="size-4" />}
              className="w-full border-dashed"
              onClick={() => addField()}
            >
              添加顶级字段
            </Button>
          )}
        </>
      )}
    </div>
  );
}
