/**
 * 「动态取值」字段：控件形态与校验由同级「取值规则」字段的值决定。
 *
 *   规则含选项            -> 下拉（单选 / 多选，可带「选项以外的值」或落在区间内的数）
 *   只有区间              -> 数值 / 日期输入框
 *   富文本                -> 由调用方（LeafEditor）走现成的富文本编辑器，不经过这里
 *   规则没写或写错        -> 不可填
 *
 * 这里只负责即时标红。超出规则时拦不拦保存由后端按字段配置的 on_violation 决定，
 * 所以不合规的输入照样交给 onChange —— 悄悄丢掉会让人以为已经存上了。
 */
import { useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import type { TRequirementField, TRequirementValue } from "@plane/types";
import { cn, stripAndTruncateHTML } from "@plane/utils";
import { DraftInput } from "../draft-input";
import { EXPANDABLE_CELL_INPUT_CLASS } from "../expandable-cell";
import {
  checkRuleEntry,
  intervalRangeText,
  ruleEntryHint,
  ruleParseErrorText,
  ruleValueEntries,
  ruleValueErrorText,
  ruleValueIssue,
} from "./requirement-rule";
import type { TResolvedRule, TRuleInterval } from "./requirement-rule";
import {
  RULE_INPUT_SHELL_CLASS,
  RULE_TRIGGER_CLASS,
  RULE_TRIGGER_OPEN_CLASS,
  RuleFloatingPanel,
  ruleValueTextClass,
} from "./rule-control-shell";
import type { TRuleControlVariant } from "./rule-control-shell";

type TReadyRule = Extract<TResolvedRule, { state: "ready" }>;

const SEARCH_THRESHOLD = 8;

/** 数值落在哪个区间就带哪个区间的单位；选项、自定义值不带 */
const unitOfEntry = (rule: TReadyRule, entry: string) => {
  if (rule.rule.options.includes(entry)) return "";
  const matched = rule.rule.intervals.find(
    (interval) => checkRuleEntry({ rich: false, options: [], intervals: [interval] }, false, entry).ok
  );
  return matched?.unit ?? "";
};

const entryWithUnit = (rule: TResolvedRule, entry: string) => {
  if (rule.state !== "ready") return entry;
  const unit = unitOfEntry(rule, entry);
  return unit ? `${entry}${/^[%‰°℃℉]/.test(unit) ? "" : " "}${unit}` : entry;
};

/** 只读展示：单值是一段文字，多值是一排标签；按当前规则不合法的标红 */
export const RequirementRuleValueDisplay = ({
  value,
  rule,
  variant = "grid",
  className,
}: {
  value: TRequirementValue | undefined;
  rule: TResolvedRule;
  variant?: "grid" | "detail" | "modal" | "compact";
  className?: string;
}) => {
  const entries = ruleValueEntries(value);
  if (!entries.length) return null;
  const issue = ruleValueIssue(rule, value);
  // 字号与颜色不进同一个 cn：tailwind-merge 把 text-body-* 也当颜色，会吞掉其中一个
  const sizeClass = variant === "detail" ? "text-body-xs-medium" : "text-13";
  if (Array.isArray(value)) {
    return (
      <span className="flex max-w-64 flex-wrap gap-1" title={issue ?? undefined}>
        {entries.map((entry) => (
          <span
            key={entry}
            className={`inline-flex max-w-44 items-center truncate rounded-md border px-2 py-0.5 ${sizeClass} ${
              issue
                ? "border-danger-subtle bg-danger-subtle text-danger-primary"
                : "border-subtle bg-layer-2 text-primary"
            } ${className ?? ""}`}
          >
            {entryWithUnit(rule, entry)}
          </span>
        ))}
      </span>
    );
  }
  const text = entryWithUnit(rule, entries[0]);
  return (
    <span
      title={issue ? `${text}（${issue}）` : variant === "detail" ? undefined : text}
      className={`block ${sizeClass} ${
        variant === "detail" ? "max-w-full whitespace-pre-wrap" : "w-full min-w-0 truncate"
      } ${issue ? "text-danger-primary" : "text-primary"} ${className ?? ""}`}
    >
      {text}
    </span>
  );
};

type TEditorProps = {
  field: TRequirementField;
  value: TRequirementValue | undefined;
  rule: TReadyRule;
  onChange: (value: TRequirementValue) => void;
  variant: TRuleControlVariant;
};

/** 表格里行高是定死的，报错只能进 title；其余形态在控件下面多出一行 */
const IssueLine = ({ issue, variant }: { issue: string | null; variant: TRuleControlVariant }) =>
  issue && variant !== "grid" ? <p className="mt-1 text-11 leading-4 text-danger-primary">{issue}</p> : null;

/** 只有区间的规则：数值或日期输入框 */
const RuleScalarEditor = ({ field, value, rule, onChange, variant }: TEditorProps) => {
  const intervals = rule.rule.intervals;
  const single: TRuleInterval | null = intervals.length === 1 ? intervals[0] : null;
  const isDate = intervals.length > 0 && intervals.every((interval) => interval.type === "date");
  const text = ruleValueEntries(value)[0] ?? "";
  const issue = ruleValueIssue(rule, value);
  const isTableCell = variant === "grid" || variant === "compact";
  const rangeText = single ? intervalRangeText(single) : ruleEntryHint(rule.rule);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return onChange(null);
    // 合规的值存规范形式（去单位、去前导加号、日期补零）；不合规的原样交出去，由上面标红
    const checked = checkRuleEntry(rule.rule, false, trimmed);
    onChange(checked.ok ? checked.value : trimmed);
  };

  return (
    <div className="w-full min-w-0" title={variant === "grid" ? (issue ?? undefined) : undefined}>
      <div
        // 字号跟下拉形态的取值走同一档，同一列里数值和选项才不会一大一小
        className={`${cn(RULE_INPUT_SHELL_CLASS[variant], issue && variant !== "grid" && "!border-danger-strong")} ${ruleValueTextClass(variant)}`}
      >
        {isDate ? (
          <input
            type="date"
            value={text}
            min={single?.lo ?? undefined}
            max={single?.hi ?? undefined}
            onChange={(event) => commit(event.target.value)}
            className={cn(EXPANDABLE_CELL_INPUT_CLASS, issue && "!text-danger-primary")}
          />
        ) : (
          <DraftInput
            value={text}
            onCommit={commit}
            className={cn(EXPANDABLE_CELL_INPUT_CLASS, issue && "!text-danger-primary")}
            // 表格格子窄，范围只在空着的时候当占位提示；详情与弹窗另在右侧常显
            placeholder={field.config.placeholder || (isTableCell ? rangeText : undefined)}
          />
        )}
        {!isDate && single?.unit && <span className="shrink-0 text-12 text-secondary">{single.unit}</span>}
        {!isDate && !isTableCell && rangeText && (
          <span className="max-w-[55%] shrink-0 truncate text-12 text-placeholder">{rangeText}</span>
        )}
      </div>
      <IssueLine issue={issue} variant={variant} />
    </div>
  );
};

/** 含选项的规则：下拉。可敲字时（允许自定义，或规则里还有区间）顶部多一个输入框 */
const RuleChoiceEditor = ({ field, value, rule, onChange, variant }: TEditorProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { options, intervals } = rule.rule;
  const entries = ruleValueEntries(value);
  const issue = ruleValueIssue(rule, value);
  const isTableCell = variant === "grid" || variant === "compact";
  const warnOnly = field.config.on_violation === "warn";
  const canType = rule.allowCustom || intervals.length > 0;
  const showInput = canType || options.length > SEARCH_THRESHOLD;
  const textClass = ruleValueTextClass(variant);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };
  useOutsideClickDetector(wrapperRef, () => {
    if (isOpen) close();
  });

  const keyword = query.trim();
  const matches = (option: string) => !keyword || option.toLowerCase().includes(keyword.toLowerCase());
  // 已选但不在选项里的值（自定义值、区间内的数）也要列出来，否则多选时没法取消
  const extras = entries.filter((entry) => !options.includes(entry) && matches(entry));
  const listed = [...extras, ...options.filter(matches)];
  const typed =
    canType && keyword && !options.includes(keyword) ? checkRuleEntry(rule.rule, rule.allowCustom, keyword) : null;
  const typedValue = typed ? (typed.ok ? typed.value : warnOnly ? keyword : null) : null;
  const canUseTyped = typedValue !== null && !entries.includes(typedValue);

  const pick = (entry: string) => {
    if (rule.multiple) {
      onChange(entries.includes(entry) ? entries.filter((item) => item !== entry) : [...entries, entry]);
      setQuery("");
      return;
    }
    onChange(entry);
    close();
  };

  const placeholder = field.config.placeholder || (isTableCell ? "" : "请选择");
  const showChips = rule.multiple && !isTableCell;

  return (
    <div ref={wrapperRef} className="w-full min-w-0" title={variant === "grid" ? (issue ?? undefined) : undefined}>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cn(
          RULE_TRIGGER_CLASS[variant],
          showChips && entries.length > 0 && "h-auto min-h-8 flex-wrap py-1",
          isOpen && RULE_TRIGGER_OPEN_CLASS[variant],
          issue && variant !== "grid" && "!border-danger-strong"
        )}
      >
        {entries.length === 0 ? (
          <span className={`min-w-0 flex-1 truncate text-placeholder ${textClass}`}>{placeholder}</span>
        ) : showChips ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {entries.map((entry) => (
              <span
                key={entry}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-subtle bg-layer-1 py-0.5 pr-1 pl-2 text-12 text-primary"
              >
                <span className="truncate">{entryWithUnit(rule, entry)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`移除 ${entry}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(entries.filter((item) => item !== entry));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(entries.filter((item) => item !== entry));
                  }}
                  className="shrink-0 text-placeholder hover:text-primary"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span
            className={`min-w-0 flex-1 truncate ${textClass} ${issue ? "text-danger-primary" : "text-primary"}`}
          >
            {entries.map((entry) => entryWithUnit(rule, entry)).join(", ")}
          </span>
        )}
        {!(isTableCell && entries.length === 0) && <ChevronDown className="size-3 shrink-0 text-tertiary" />}
      </button>
      <IssueLine issue={issue} variant={variant} />
      {isOpen && (
        <RuleFloatingPanel anchor={anchor} className="w-60 p-1.5">
          {showInput && (
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canUseTyped && typedValue !== null) pick(typedValue);
                  else if (keyword && listed.length === 1) pick(listed[0]);
                }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  close();
                }
              }}
              placeholder={canType ? "输入或选择" : "搜索"}
              className="mb-1.5 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
            />
          )}
          <div className="max-h-60 overflow-y-auto">
            {canUseTyped && typedValue !== null && (
              <button
                type="button"
                onClick={() => pick(typedValue)}
                className="flex h-8 w-full items-center rounded px-2 text-left text-13 font-medium text-accent-primary hover:bg-layer-transparent-hover"
              >
                <span className="truncate">使用「{typedValue}」</span>
              </button>
            )}
            {typed && !typed.ok && (
              <p className="px-2 py-1.5 text-12 text-danger-primary">{ruleValueErrorText(typed.error, rule.rule)}</p>
            )}
            {!rule.multiple && !field.is_required && entries.length > 0 && !keyword && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                className="flex h-8 w-full items-center rounded px-2 text-left text-13 text-secondary hover:bg-layer-transparent-hover"
              >
                清空选择
              </button>
            )}
            {listed.map((option) => {
              const selected = entries.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => pick(option)}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-13 text-primary hover:bg-layer-transparent-hover"
                >
                  {rule.multiple && (
                    <span
                      className={cn(
                        "grid size-3.5 shrink-0 place-items-center rounded-sm border",
                        selected ? "border-accent-strong bg-accent-primary text-on-color" : "border-strong"
                      )}
                    >
                      {selected && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{entryWithUnit(rule, option)}</span>
                  {!rule.multiple && selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                </button>
              );
            })}
            {listed.length === 0 && !typed && <p className="px-2 py-2 text-12 text-tertiary">没有匹配项</p>}
          </div>
          {intervals.length > 0 && (
            <p className="mt-1 border-t border-subtle px-2 pt-2 pb-1 text-12 text-tertiary">
              或输入 {ruleEntryHint(rule.rule)}
            </p>
          )}
        </RuleFloatingPanel>
      )}
    </div>
  );
};

/** 规则没写 / 写错：不可填。已有的旧值照样显示出来，不能让它凭空消失 */
const RuleValueUnavailable = ({
  value,
  rule,
  variant,
}: {
  value: TRequirementValue | undefined;
  rule: Exclude<TResolvedRule, { state: "ready" }>;
  variant: TRuleControlVariant;
}) => {
  // 旧值可能是富文本（规则原来写的是「富文本」），别把标签原样印出来
  const entries = ruleValueEntries(value).map((entry) =>
    /^\s*<[a-z][^>]*>/i.test(entry) ? stripAndTruncateHTML(entry, 180) : entry
  );
  const reason = rule.state === "invalid" ? "取值规则无法识别" : "未设置取值规则";
  return (
    <div
      title={rule.state === "invalid" ? `${reason}：${ruleParseErrorText(rule.error)}` : reason}
      className={cn(RULE_INPUT_SHELL_CLASS[variant], "cursor-not-allowed hover:border-transparent hover:bg-transparent")}
    >
      <span
        className={`min-w-0 flex-1 truncate ${ruleValueTextClass(variant)} ${
          entries.length ? "text-tertiary" : "text-placeholder"
        }`}
      >
        {entries.length ? entries.join(", ") : reason}
      </span>
    </div>
  );
};

export const RequirementRuleValueEditor = ({
  field,
  value,
  rule,
  onChange,
  variant = "grid",
}: {
  field: TRequirementField;
  value: TRequirementValue | undefined;
  rule: TResolvedRule;
  onChange: (value: TRequirementValue) => void;
  variant?: TRuleControlVariant;
}) => {
  if (rule.state !== "ready") return <RuleValueUnavailable value={value} rule={rule} variant={variant} />;
  const Editor = rule.rule.options.length > 0 ? RuleChoiceEditor : RuleScalarEditor;
  return <Editor field={field} value={value} rule={rule} onChange={onChange} variant={variant} />;
};
