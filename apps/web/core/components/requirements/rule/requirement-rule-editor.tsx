/**
 * 「取值规则」字段：每条需求（或表单的每一行）各写各的规则，同级的「动态取值」字段照它取值。
 *
 * 规则在浮层里改，点「确定」（或回车）才提交一次 —— 规则原文与两个开关是一个值，逐字符提交会让
 * 同级取值控件跟着半截规则来回变形，在「onChange 即 PATCH」的场景还会连发请求。
 * 点浮层外面等同「取消」：有显式的取消 / 确定，就不该在别处悄悄保存。
 *
 * 「多选」「允许填写选项以外的值」既能勾开关，也能直接写在规则后面（{A,B}+*）—— 与 Excel
 * 导入导出是同一种写法。草稿就是输入框里那一串字，开关只是替人改末尾的符号。
 */
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { Button } from "@plane/propel/button";
import type { TRequirementRuleValue, TRequirementValue } from "@plane/types";
import { cn } from "@plane/utils";
import {
  RULE_SYNTAX_EXAMPLES,
  asRuleValue,
  formatRuleText,
  intervalNotation,
  intervalSummary,
  parseRule,
  resolveRule,
  ruleParseErrorText,
  splitRuleFlags,
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
/** 开关旁边标出它对应的符号，写法速查表里的 {A,B,C}+ / {A,B,C}* 才对得上号 */
const FLAG_SYMBOL_CLASS = "rounded bg-layer-1 px-1.5 py-px font-mono text-12 text-secondary";

/** 规则原文（带标志符号）+ 开关标签。只读展示与编辑态的格子共用 */
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
  const isReady = resolved.state === "ready";
  const expr = formatRuleText(ruleValue.expr, isReady && resolved.multiple, isReady && resolved.allowCustom);
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
      {rule.image && (
        <span className={chipClass}>
          <span className={kindClass}>图片</span>
          <span className="font-medium text-success-primary">上传图片，可多张</span>
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
  // 输入框里的那一串字（规则原文 + 标志符号）；null = 浮层关着
  const [draft, setDraft] = useState<string | null>(null);
  // 写法速查表：新写规则时默认展开，改已有规则时折叠
  const [showSyntax, setShowSyntax] = useState(false);

  const current = asRuleValue(value);
  const isOpen = draft !== null;
  const flags = splitRuleFlags(draft);
  const parsed = isOpen ? parseRule(flags.expr) : null;
  const recognized = parsed && parsed.ok && !parsed.empty ? parsed : null;
  const hasOptions = Boolean(recognized && recognized.options.length > 0);
  const errorText = parsed && !parsed.ok ? ruleParseErrorText(parsed.error) : null;
  const isTableCell = variant === "grid" || variant === "compact";

  /** 写错的规则不提交也不关：留在原地让人改，想放弃就点「取消」或点外面 */
  const commit = () => {
    if (!parsed || !parsed.ok) return;
    const next: TRequirementRuleValue | null = flags.expr
      ? { expr: flags.expr, multiple: hasOptions && flags.multiple, allow_custom: hasOptions && flags.allowCustom }
      : null;
    if (!isSameRule(next, current)) onChange(next);
    setDraft(null);
  };

  const open = () => {
    const initial = current ? formatRuleText(current.expr, current.multiple, current.allow_custom) : "";
    setShowSyntax(!initial);
    setDraft(initial);
  };

  /** 开关不另存状态：勾一下就是改输入框末尾的符号 */
  const setFlags = (multiple: boolean, allowCustom: boolean) =>
    setDraft(formatRuleText(flags.expr, multiple, allowCustom));

  useOutsideClickDetector(wrapperRef, () => {
    if (isOpen) setDraft(null);
  });

  return (
    <div ref={wrapperRef} className="w-full min-w-0">
      <button
        ref={setAnchor}
        type="button"
        onClick={() => (isOpen ? setDraft(null) : open())}
        className={cn(RULE_TRIGGER_CLASS[variant], isOpen && RULE_TRIGGER_OPEN_CLASS[variant])}
      >
        {current ? (
          <RequirementRuleDisplay value={value} variant={variant} />
        ) : (
          !isTableCell && <span className="truncate text-13 text-placeholder">填写取值规则</span>
        )}
      </button>
      {isOpen && (
        <RuleFloatingPanel anchor={anchor} className="w-[480px] max-w-[calc(100vw-24px)]">
          <div className="border-b border-subtle p-3">
            <input
              autoFocus
              value={draft ?? ""}
              onChange={(event) => setDraft(event.target.value)}
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
                  checked={flags.multiple}
                  onChange={(event) => setFlags(event.target.checked, flags.allowCustom)}
                  className="size-3.5 rounded border border-subtle accent-accent-primary"
                />
                多选
                <code className={FLAG_SYMBOL_CLASS}>+</code>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={flags.allowCustom}
                  onChange={(event) => setFlags(flags.multiple, event.target.checked)}
                  className="size-3.5 rounded border border-subtle accent-accent-primary"
                />
                允许填写选项以外的值
                <code className={FLAG_SYMBOL_CLASS}>*</code>
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
