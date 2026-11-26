/**
 * 「取值规则」字段：每条需求（或表单的每一行）各写各的规则，同级的「动态取值」字段照它取值。
 *
 * 规则在浮层里改，点「确定」（或回车）才提交一次 —— 规则原文与两个开关是一个值，逐字符提交会让
 * 同级取值控件跟着半截规则来回变形，在「onChange 即 PATCH」的场景还会连发请求。
 * 点浮层外面等同「取消」：有显式的取消 / 确定，就不该在别处悄悄保存。
 */
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { Button } from "@plane/propel/button";
import type { TRequirementRuleValue, TRequirementValue } from "@plane/types";
import { cn } from "@plane/utils";
import {
  EMPTY_RULE_VALUE,
  RULE_SYNTAX_EXAMPLES,
  asRuleValue,
  intervalNotation,
  intervalSummary,
  parseRule,
  resolveRule,
  ruleParseErrorText,
} from "./requirement-rule";
import type { TRuleDefinition } from "./requirement-rule";
import {
  RULE_TRIGGER_CLASS,
  RULE_TRIGGER_OPEN_CLASS,
  RuleFlagTags,
  RuleFloatingPanel,
} from "./rule-control-shell";
import type { TRuleControlVariant } from "./rule-control-shell";

const MAX_LISTED_OPTIONS = 6;

/** 规则原文 + 开关标签。只读展示与编辑态的格子共用 */
export const RequirementRuleDisplay = ({
  value,
  variant = "grid",
  className,
}: {
  value: TRequirementValue | undefined;
  variant?: "grid" | "detail" | "modal" | "compact";
  className?: string;
}) => {
  const ruleValue = asRuleValue(value);
  if (!ruleValue) return null;
  const resolved = resolveRule(value);
  const expr = ruleValue.expr.trim();
  const sizeClass = variant === "detail" ? "text-13" : "text-12";
  const flags =
    resolved.state === "ready"
      ? [resolved.multiple && "多选", resolved.allowCustom && "可自定义"].filter(Boolean).join("，")
      : "";
  // 主网格一列只有 144px，标签会把规则原文挤得只剩两三个字：那里只留原文，开关进悬停提示
  const showTags = variant !== "grid";
  return (
    <span className="flex max-w-full min-w-0 items-center gap-1.5">
      <span
        title={
          resolved.state === "invalid"
            ? `${expr}（${ruleParseErrorText(resolved.error)}）`
            : flags
              ? `${expr}（${flags}）`
              : expr
        }
        className={cn(
          "min-w-0 truncate font-mono",
          sizeClass,
          resolved.state === "invalid" ? "text-danger-primary" : "text-primary",
          className
        )}
      >
        {expr}
      </span>
      {showTags && resolved.state === "ready" && (
        <RuleFlagTags multiple={resolved.multiple} allowCustom={resolved.allowCustom} />
      )}
    </span>
  );
};

const RecognizedRule = ({ rule }: { rule: TRuleDefinition }) => {
  const chipClass = "inline-flex items-center gap-1.5 rounded-md bg-success-subtle px-2 py-1 text-12";
  const kindClass = "text-secondary";
  const listed = rule.options.slice(0, MAX_LISTED_OPTIONS).join("、");
  const rest = rule.options.length - MAX_LISTED_OPTIONS;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rule.rich && (
        <span className={chipClass}>
          <span className={kindClass}>富文本</span>
          <span className="font-medium text-success-primary">自由填写</span>
        </span>
      )}
      {rule.intervals.map((interval) => (
        <span key={intervalNotation(interval)} className={chipClass}>
          <span className={kindClass}>{interval.type === "date" ? "日期" : "区间"}</span>
          <span className="font-medium text-success-primary">{intervalSummary(interval)}</span>
        </span>
      ))}
      {rule.options.length > 0 && (
        <span className={cn(chipClass, "max-w-full")}>
          <span className={cn(kindClass, "shrink-0")}>选项</span>
          <span className="min-w-0 truncate font-medium text-success-primary">
            {rest > 0 ? `${listed} 等 ${rule.options.length} 项` : listed}
          </span>
        </span>
      )}
    </div>
  );
};

const isSameRule = (left: TRequirementRuleValue | null, right: TRequirementRuleValue | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.expr.trim() === right.expr.trim() &&
    left.multiple === right.multiple &&
    left.allow_custom === right.allow_custom);

export const RequirementRuleEditor = ({
  value,
  onChange,
  variant = "grid",
}: {
  value: TRequirementValue | undefined;
  onChange: (value: TRequirementValue) => void;
  variant?: TRuleControlVariant;
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  // null = 浮层关着
  const [draft, setDraft] = useState<TRequirementRuleValue | null>(null);
  // 写法速查表：新写规则时默认展开，改已有规则时折叠
  const [showSyntax, setShowSyntax] = useState(false);

  const current = asRuleValue(value);
  const parsed = draft ? parseRule(draft.expr) : null;
  const recognized = parsed && parsed.ok && !parsed.empty ? parsed : null;
  const hasOptions = Boolean(recognized && recognized.options.length > 0);
  const errorText = parsed && !parsed.ok ? ruleParseErrorText(parsed.error) : null;
  const isTableCell = variant === "grid" || variant === "compact";

  /** 写错的规则不提交也不关：留在原地让人改，想放弃就点「取消」或点外面 */
  const commit = () => {
    if (!draft || !parsed || !parsed.ok) return;
    const expr = draft.expr.trim();
    const next: TRequirementRuleValue | null = expr
      ? { expr, multiple: hasOptions && draft.multiple, allow_custom: hasOptions && draft.allow_custom }
      : null;
    if (!isSameRule(next, current)) onChange(next);
    setDraft(null);
  };

  const open = () => {
    const initial = current ?? { ...EMPTY_RULE_VALUE };
    setShowSyntax(!initial.expr.trim());
    setDraft(initial);
  };

  useOutsideClickDetector(wrapperRef, () => {
    if (draft) setDraft(null);
  });

  return (
    <div ref={wrapperRef} className="w-full min-w-0">
      <button
        ref={setAnchor}
        type="button"
        onClick={() => (draft ? setDraft(null) : open())}
        className={cn(RULE_TRIGGER_CLASS[variant], draft && RULE_TRIGGER_OPEN_CLASS[variant])}
      >
        {current ? (
          <RequirementRuleDisplay value={value} variant={variant} />
        ) : (
          !isTableCell && <span className="truncate text-13 text-placeholder">填写取值规则</span>
        )}
      </button>
      {draft && (
        <RuleFloatingPanel anchor={anchor} className="w-[480px] max-w-[calc(100vw-24px)]">
          <div className="border-b border-subtle p-3">
            <input
              autoFocus
              value={draft.expr}
              onChange={(event) => setDraft({ ...draft, expr: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDraft(null);
                }
              }}
              placeholder="{A,B,C} 或 [1,30]"
              spellCheck={false}
              className={cn(
                "h-9 w-full rounded-md border bg-surface-1 px-3 font-mono text-13 text-primary outline-none placeholder:text-placeholder",
                errorText ? "border-danger-strong" : "border-subtle focus:border-accent-strong"
              )}
            />
            {errorText && <p className="mt-1.5 text-12 text-danger-primary">{errorText}</p>}
          </div>
          {recognized && (
            <div className="border-b border-subtle px-3 py-2.5">
              <p className="mb-1.5 text-12 text-tertiary">识别结果</p>
              <RecognizedRule rule={recognized} />
            </div>
          )}
          {hasOptions && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-subtle px-3 py-2.5 text-13 text-primary">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.multiple}
                  onChange={(event) => setDraft({ ...draft, multiple: event.target.checked })}
                  className="size-3.5 rounded border border-subtle accent-accent-primary"
                />
                多选
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.allow_custom}
                  onChange={(event) => setDraft({ ...draft, allow_custom: event.target.checked })}
                  className="size-3.5 rounded border border-subtle accent-accent-primary"
                />
                允许填写选项以外的值
              </label>
            </div>
          )}
          <div className="px-3 py-2">
            <button
              type="button"
              aria-expanded={showSyntax}
              onClick={() => setShowSyntax(!showSyntax)}
              className="flex h-6 items-center gap-1 text-12 text-tertiary transition-colors hover:text-primary"
            >
              <ChevronRight className={cn("size-3 transition-transform", showSyntax && "rotate-90")} />
              规则写法
            </button>
            {showSyntax && (
              <div className="mt-1 grid grid-cols-2 gap-x-5">
                {RULE_SYNTAX_EXAMPLES.map((example) => (
                  <div key={example.expr} className="flex h-7 min-w-0 items-center justify-between gap-2">
                    <code className="truncate rounded bg-layer-1 px-1.5 py-px font-mono text-12 text-primary">
                      {example.expr}
                    </code>
                    <span className="shrink-0 text-12 text-tertiary">{example.meaning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-subtle px-3 py-2.5">
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={commit} disabled={Boolean(errorText)}>
              确定
            </Button>
          </div>
        </RuleFloatingPanel>
      )}
    </div>
  );
};
