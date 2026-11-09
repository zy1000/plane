import { Plus, Trash2 } from "lucide-react";
import type { TFieldLinkage } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { dependencyClosure, linkageChoices } from "@/utils/field-linkage";
import type { TLinkageField } from "@/utils/field-linkage";
import { FieldChoiceSelect } from "./field-choice-select";

export function FieldLinkageEditor({
  fieldId,
  fieldType,
  fieldName,
  fields,
  choices,
  value,
  onChange,
  disabled,
}: {
  fieldId?: string;
  fieldType: string;
  fieldName?: string;
  fields: TLinkageField[];
  choices: { key: string; label: string }[];
  value: TFieldLinkage;
  onChange: (value: TFieldLinkage) => void;
  disabled?: boolean;
}) {
  const candidates = fields.filter(
    (f) =>
      f.field_type === "select" &&
      f.is_active !== false &&
      f.id !== fieldId &&
      !dependencyClosure(fields, [f.id]).some((dependency) => dependency.id === fieldId)
  );
  const sourceChoices = candidates.map((f) => ({ key: f.id, label: f.name }));
  const visibilitySource = fields.find((f) => f.id === value.visibility?.field_id);
  const optionsSource = fields.find((f) => f.id === value.options?.field_id);
  const mappingKeys = Object.keys(value.options?.mappings ?? {});
  const sourceOptions = optionsSource ? linkageChoices(optionsSource) : [];
  const availableSources = sourceOptions.filter((option) => !mappingKeys.includes(option.key));
  const removeRule = (kind: keyof TFieldLinkage) => {
    const next = { ...value };
    delete next[kind];
    onChange(next);
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6 disabled:opacity-60">
      <legend className="sr-only">字段联动</legend>
      <section className="space-y-3" aria-label="条件显示配置">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-16 font-semibold text-primary">条件显示</h3>
            <p className="mt-1 text-13 text-secondary">
              {value.visibility
                ? `满足条件时显示「${fieldName?.trim() || "此字段"}」`
                : "默认始终显示，开启后按条件显示"}
            </p>
          </div>
          <ToggleSwitch
            size="md"
            label="启用条件显示"
            value={Boolean(value.visibility)}
            disabled={disabled || (!value.visibility && !candidates.length)}
            onChange={(enabled) =>
              enabled ? onChange({ ...value, visibility: { field_id: "", values: [] } }) : removeRule("visibility")
            }
          />
        </div>
        {value.visibility && (
          <>
            <div className="grid items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
              <span className="text-13 text-primary">来源字段</span>
              <FieldChoiceSelect
                label="显示条件来源字段"
                placeholder="选择来源字段"
                value={value.visibility.field_id}
                choices={sourceChoices}
                disabled={disabled}
                onChange={(field_id) => onChange({ ...value, visibility: { field_id, values: [] } })}
              />
            </div>
            {visibilitySource && (
              <div className="grid items-start gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                <span className="pt-2 text-13 text-primary">选中以下任一值时显示</span>
                <FieldChoiceSelect
                  multiple
                  label="触发显示的选项"
                  placeholder="选择触发选项"
                  value={value.visibility.values}
                  choices={linkageChoices(visibilitySource)}
                  disabled={disabled}
                  onChange={(values) => onChange({ ...value, visibility: { field_id: visibilitySource.id, values } })}
                />
              </div>
            )}
            {!visibilitySource && value.visibility.field_id && (
              <p className="text-13 text-danger-primary">来源已失效，请重新选择。</p>
            )}
            <p className="text-12 leading-5 text-secondary">未满足条件时隐藏，并清空已填值。</p>
          </>
        )}
      </section>

      {fieldType === "select" && (
        <section className="space-y-3 border-t border-subtle pt-5" aria-label="可选项联动配置">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-16 font-semibold text-primary">可选项联动</h3>
              <p className="mt-1 text-13 text-secondary">
                {optionsSource ? `根据「${optionsSource.name}」限制可选范围` : "根据另一个字段的值，限制可选范围"}
              </p>
            </div>
            <ToggleSwitch
              size="md"
              label="启用可选项联动"
              value={Boolean(value.options)}
              disabled={disabled || (!value.options && !candidates.length)}
              onChange={(enabled) =>
                enabled ? onChange({ ...value, options: { field_id: "", mappings: {} } }) : removeRule("options")
              }
            />
          </div>
          {value.options && (
            <>
              <div className="grid items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                <span className="text-13 text-primary">来源字段</span>
                <FieldChoiceSelect
                  label="选项联动来源字段"
                  placeholder="选择来源字段"
                  value={value.options.field_id}
                  choices={sourceChoices}
                  disabled={disabled}
                  onChange={(field_id) => onChange({ ...value, options: { field_id, mappings: {} } })}
                />
              </div>
              {optionsSource && (
                <>
                  <div className="rounded-md border border-subtle">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_28px] gap-2 rounded-t-md border-b border-subtle bg-layer-1 px-3 py-2.5 text-12 font-medium text-secondary">
                      <span className="break-words">{optionsSource.name}的值</span>
                      <span className="break-words">{fieldName?.trim() || "当前字段"}的可选项</span>
                      <span />
                    </div>
                    {mappingKeys.map((key) => (
                      <div
                        key={key}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_28px] items-start gap-2 border-b border-subtle px-3 py-2 last:border-b-0"
                      >
                        <FieldChoiceSelect
                          label={`映射来源：${key}`}
                          value={key}
                          choices={sourceOptions.filter(
                            (option) => option.key === key || !mappingKeys.includes(option.key)
                          )}
                          disabled={disabled}
                          onChange={(nextKey) => {
                            const mappings = Object.fromEntries(
                              Object.entries(value.options!.mappings).map(([source, targets]) => [
                                source === key ? nextKey : source,
                                targets,
                              ])
                            );
                            onChange({ ...value, options: { field_id: optionsSource.id, mappings } });
                          }}
                        />
                        <FieldChoiceSelect
                          multiple
                          label={`${key}对应的可选项`}
                          placeholder="选择可选项"
                          value={value.options?.mappings[key] ?? []}
                          choices={choices}
                          disabled={disabled}
                          onChange={(selected) =>
                            onChange({
                              ...value,
                              options: {
                                field_id: optionsSource.id,
                                mappings: { ...value.options?.mappings, [key]: selected },
                              },
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`删除${key}的映射`}
                          disabled={disabled}
                          className="mt-1 grid size-7 place-items-center rounded text-tertiary hover:bg-layer-1-hover hover:text-danger-primary focus-visible:outline-2 focus-visible:outline-accent-strong"
                          onClick={() => {
                            const mappings = { ...value.options?.mappings };
                            delete mappings[key];
                            onChange({ ...value, options: { field_id: optionsSource.id, mappings } });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {!mappingKeys.length && (
                      <p className="px-3 py-5 text-13 text-secondary">添加映射，为来源的每个值指定可选项。</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || !availableSources.length}
                    className="inline-flex items-center gap-1 text-13 text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-secondary disabled:no-underline"
                    onClick={() => {
                      const source = availableSources[0];
                      if (source)
                        onChange({
                          ...value,
                          options: {
                            field_id: optionsSource.id,
                            mappings: { ...value.options?.mappings, [source.key]: [] },
                          },
                        });
                    }}
                  >
                    <Plus className="size-3.5" />
                    {availableSources.length ? "添加映射" : "已添加全部来源值"}
                  </button>
                </>
              )}
              {!optionsSource && value.options.field_id && (
                <p className="text-13 text-danger-primary">来源已失效，请重新选择。</p>
              )}
              <p className="text-12 leading-5 text-secondary">
                未匹配时无可选项，失效值自动清空。多选来源取可选项的并集。
              </p>
            </>
          )}
        </section>
      )}
      {!candidates.length && (
        <p className="text-13 leading-5 text-secondary">暂无可用的来源字段。请先添加另一个选择字段，再配置联动。</p>
      )}
    </fieldset>
  );
}
