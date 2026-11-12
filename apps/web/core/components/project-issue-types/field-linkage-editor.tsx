import { useState } from "react";
import { Info, X } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TFieldLinkage, TLinkageCondition, TLinkageOptionsRule, TLinkageRule } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { dependencyClosure, isTypeCondition, linkageChoices } from "@/utils/field-linkage";
import type { TLinkageField, TLinkageIssueType } from "@/utils/field-linkage";
import { FieldChoiceSelect } from "./field-choice-select";
import type { TFieldChoice } from "./field-choice-select";

/** 代表工作项类型的那一列 */
const TYPE_SOURCE = "__issue_type__";
const TEXT_BUTTON =
  "rounded text-14 font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:text-tertiary disabled:no-underline";
const ICON_BUTTON =
  "grid size-7 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-danger-primary focus-visible:outline-2 focus-visible:outline-accent-strong";

/** 条件显示的规则没有 options，可选项联动的规则有 */
type TEditableRule = TLinkageRule & { options?: string[] };

const conditionSource = (condition: TLinkageCondition) =>
  isTypeCondition(condition) ? TYPE_SOURCE : condition.field_id;
const conditionValues = (condition?: TLinkageCondition) =>
  !condition ? [] : isTypeCondition(condition) ? condition.type_ids : condition.values;
const makeCondition = (source: string, values: string[]): TLinkageCondition =>
  source === TYPE_SOURCE ? { type_ids: values } : { field_id: source, values };
const usedSources = (rules: TEditableRule[]) =>
  Array.from(new Set(rules.flatMap((rule) => rule.conditions.map(conditionSource))));

/**
 * 规则表：一列一个条件来源，一行一条规则，单元格里选这条规则在该条件上的取值，空着是「不限」。
 * 规则里没有哪个条件就是那一格空着，所以表格和 `TFieldLinkage` 的规则列表一一对应，不需要另存结构。
 */
function RuleTable({
  label,
  rules,
  sources,
  fields,
  typeChoices,
  targetChoices,
  disabled,
  onChange,
}: {
  label: string;
  rules: TEditableRule[];
  /** 可以加成列的条件来源 */
  sources: TFieldChoice[];
  fields: TLinkageField[];
  typeChoices: TFieldChoice[];
  /** 当前字段的选项；给了就多一列「可选项」 */
  targetChoices?: TFieldChoice[];
  disabled?: boolean;
  onChange: (rules: TEditableRule[]) => void;
}) {
  // 列的顺序。刚加、还没有哪一行选值的列只存在这里；规则里出现了这里没有的来源就补在后面
  const [order, setOrder] = useState(() => usedSources(rules));
  const columns = [...order, ...usedSources(rules).filter((source) => !order.includes(source))];
  const emptyRule = (): TEditableRule => ({ conditions: [], ...(targetChoices ? { options: [] } : {}) });
  const gridTemplateColumns = `36px repeat(${columns.length}, minmax(0, 1fr)) ${targetChoices ? "minmax(0, 1.7fr) " : ""}40px`;

  const columnName = (source: string) =>
    source === TYPE_SOURCE ? "工作项类型" : fields.find((field) => field.id === source)?.name;
  const isStale = (source: string) => !sources.some((choice) => choice.key === source);
  const cellChoices = (source: string, values: string[]): TFieldChoice[] => {
    if (source !== TYPE_SOURCE) {
      const field = fields.find((item) => item.id === source);
      return field ? linkageChoices(field) : [];
    }
    return [
      ...typeChoices,
      ...values
        .filter((id) => !typeChoices.some((choice) => choice.key === id))
        .map((id) => ({ key: id, label: "已删除的类型" })),
    ];
  };

  const setCell = (rowIndex: number, source: string, values: string[]) =>
    onChange(
      rules.map((rule, index) => {
        if (index !== rowIndex) return rule;
        const bySource = new Map(rule.conditions.map((condition) => [conditionSource(condition), condition]));
        if (values.length) bySource.set(source, makeCondition(source, values));
        else bySource.delete(source);
        return { ...rule, conditions: columns.flatMap((column) => bySource.get(column) ?? []) };
      })
    );
  const addColumn = (source: string) => {
    setOrder([...columns, source]);
    if (!rules.length) onChange([emptyRule()]);
  };
  const removeColumn = (source: string) => {
    setOrder(columns.filter((column) => column !== source));
    onChange(
      rules.map((rule) => ({
        ...rule,
        conditions: rule.conditions.filter((condition) => conditionSource(condition) !== source),
      }))
    );
  };

  const addConditionButton = (
    <FieldChoiceSelect
      variant="link"
      label="添加条件"
      placeholder="添加条件"
      value=""
      choices={sources.map((choice) =>
        columns.includes(choice.key) ? { ...choice, disabled: true, hint: "已添加" } : choice
      )}
      panelMinWidth={230}
      disabled={disabled || sources.every((choice) => columns.includes(choice.key))}
      onChange={addColumn}
    />
  );

  if (!columns.length)
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-strong px-4 py-4">
        <span className="text-14 text-secondary">尚未添加条件</span>
        {addConditionButton}
      </div>
    );

  return (
    <>
      <div role="table" aria-label={label} className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
        <div role="row" className="grid bg-layer-1" style={{ gridTemplateColumns }}>
          <span role="columnheader" />
          {columns.map((source) => {
            const name = columnName(source);
            return (
              <div
                key={source}
                role="columnheader"
                className="flex h-11 min-w-0 items-center justify-between gap-1 border-l border-subtle pr-1.5 pl-3 text-14 font-medium"
              >
                <span className={`truncate ${name && !isStale(source) ? "text-primary" : "text-danger-primary"}`}>
                  {name && !isStale(source) ? name : "已失效的字段"}
                </span>
                <button
                  type="button"
                  aria-label={`移除条件 ${name ?? ""}`}
                  disabled={disabled}
                  className={ICON_BUTTON}
                  onClick={() => removeColumn(source)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          {targetChoices && (
            <div
              role="columnheader"
              className="flex h-11 items-center border-l border-subtle bg-accent-subtle px-3 text-14 font-medium text-accent-primary"
            >
              可选项
            </div>
          )}
          <span role="columnheader" className="border-l border-subtle" />
        </div>
        {rules.map((rule, rowIndex) => (
          // 规则没有稳定 id，增删只发生在行尾或整行替换，用序号即可
          <div key={rowIndex} role="row" className="grid border-t border-subtle" style={{ gridTemplateColumns }}>
            <span role="cell" className="grid place-items-center text-13 text-secondary">
              {rowIndex + 1}
            </span>
            {columns.map((source) => {
              const values = conditionValues(rule.conditions.find((item) => conditionSource(item) === source));
              return (
                <div key={source} role="cell" className="min-w-0 border-l border-subtle">
                  <FieldChoiceSelect
                    variant="cell"
                    multiple
                    label={`第 ${rowIndex + 1} 行 ${columnName(source) ?? "条件"}`}
                    placeholder="不限"
                    value={values}
                    choices={cellChoices(source, values)}
                    panelMinWidth={220}
                    disabled={disabled || isStale(source)}
                    onChange={(next) => setCell(rowIndex, source, next)}
                  />
                </div>
              );
            })}
            {targetChoices && (
              <div role="cell" className="min-w-0 border-l border-subtle">
                <FieldChoiceSelect
                  variant="cell"
                  tone="accent"
                  multiple
                  label={`第 ${rowIndex + 1} 行的可选项`}
                  placeholder="选择可选项"
                  value={rule.options ?? []}
                  choices={targetChoices}
                  panelMinWidth={220}
                  disabled={disabled}
                  onChange={(options) => onChange(rules.map((item, index) => (index === rowIndex ? { ...item, options } : item)))}
                />
              </div>
            )}
            <div role="cell" className="grid place-items-center border-l border-subtle">
              <button
                type="button"
                aria-label={`删除第 ${rowIndex + 1} 行`}
                disabled={disabled}
                className={ICON_BUTTON}
                onClick={() => onChange(rules.filter((_, index) => index !== rowIndex))}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-7">
        <button type="button" disabled={disabled} className={TEXT_BUTTON} onClick={() => onChange([...rules, emptyRule()])}>
          添加规则
        </button>
        {addConditionButton}
      </div>
    </>
  );
}

function SectionHeader({
  title,
  hint,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  /** 生效方式的说明，收在标题旁的图标里 */
  hint: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-14 font-semibold text-primary">{title}</h3>
        <Tooltip tooltipContent={hint} position="top">
          <button
            type="button"
            aria-label={`${title}的生效方式`}
            className="grid place-items-center rounded text-tertiary hover:text-secondary focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            <Info className="size-4" />
          </button>
        </Tooltip>
      </div>
      <ToggleSwitch size="md" label={`启用${title}`} value={enabled} disabled={disabled} onChange={onToggle} />
    </div>
  );
}

/**
 * 字段联动规则：条件显示与可选项联动各一张规则表。
 * 字段库传 `issueTypes`，「添加条件」里才有工作项类型；类型里的私有字段只属于一个类型，不传。
 * 换一个字段编辑时要重新挂载（传 key），列顺序等界面状态才会重置。
 */
export function FieldLinkageEditor({
  fieldId,
  fieldType,
  fields,
  choices,
  issueTypes,
  value,
  onChange,
  disabled,
}: {
  fieldId?: string;
  fieldType: string;
  fields: TLinkageField[];
  choices: { key: string; label: string }[];
  issueTypes?: TLinkageIssueType[];
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
  const typeChoices: TFieldChoice[] = (issueTypes ?? []).map((type) => ({
    key: type.id,
    label: type.name,
    icon: <TypeIcon iconProps={type.logo_props?.icon} className="size-4 shrink-0 rounded" iconClassName="size-3.5" />,
  }));
  const hasTypes = typeChoices.length > 0;
  const sources: TFieldChoice[] = [
    ...(hasTypes ? [{ key: TYPE_SOURCE, label: "工作项类型" }] : []),
    ...candidates.map((f) => ({ key: f.id, label: f.name, group: hasTypes ? "选择字段" : undefined })),
  ];
  const visibilityRules = value.visibility?.rules;
  const optionRules = value.options?.rules;
  const tableProps = { sources, fields, typeChoices, disabled };

  const setVisibility = (rules?: TEditableRule[]) => {
    const { visibility: _removed, ...rest } = value;
    onChange(rules ? { ...rest, visibility: { rules: rules.map(({ conditions }) => ({ conditions })) } } : rest);
  };
  const setOptions = (rules?: TEditableRule[]) => {
    const { options: _removed, ...rest } = value;
    const next: TLinkageOptionsRule[] | undefined = rules?.map((rule) => ({
      conditions: rule.conditions,
      options: rule.options ?? [],
    }));
    onChange(next ? { ...rest, options: { rules: next } } : rest);
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-60">
      <legend className="sr-only">字段联动</legend>
      <section className="space-y-4" aria-label="条件显示配置">
        <SectionHeader
          title="条件显示"
          hint={`满足任一行时显示，否则隐藏并清空已填值。${hasTypes ? "规则未涉及的工作项类型始终显示。" : ""}`}
          enabled={Boolean(visibilityRules)}
          disabled={disabled || (!visibilityRules && !sources.length)}
          onToggle={(enabled) => setVisibility(enabled ? [{ conditions: [] }] : undefined)}
        />
        {visibilityRules && (
          <RuleTable {...tableProps} label="条件显示规则" rules={visibilityRules} onChange={setVisibility} />
        )}
      </section>

      {fieldType === "select" && (
        <section className="mt-6 space-y-4 border-t border-subtle pt-6" aria-label="可选项联动配置">
          <SectionHeader
            title="可选项联动"
            hint={`同时满足多行时取可选项的并集，均不满足时无可选项，已填的失效值自动清空。${
              hasTypes ? "规则未涉及的工作项类型不受限制。" : ""
            }`}
            enabled={Boolean(optionRules)}
            disabled={disabled || (!optionRules && !sources.length)}
            onToggle={(enabled) => setOptions(enabled ? [{ conditions: [], options: [] }] : undefined)}
          />
          {optionRules && (
            <RuleTable
              {...tableProps}
              label="可选项联动规则"
              rules={optionRules}
              targetChoices={choices}
              onChange={setOptions}
            />
          )}
        </section>
      )}
      {!sources.length && (
        <p className="mt-6 text-14 text-secondary">暂无可用的来源字段。请先添加另一个选择字段，再配置联动。</p>
      )}
    </fieldset>
  );
}
