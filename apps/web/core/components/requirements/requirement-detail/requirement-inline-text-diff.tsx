"use client";

/**
 * 描述 / 富文本字段的行内文字 diff：把改动的词标成红删除线与绿底，不变的只留前后几个词。
 *
 * 历史行里整段红一遍、整段绿一遍读不出改了哪几个字。
 * 中文没有空格，按「CJK 单字 / 拉丁与数字连续串 / 空白 / 单个标点」切 token，再交给 jsdiff。
 */
import { useMemo } from "react";
import { diffArrays, type ArrayChange } from "diff";
import { useTranslation } from "@plane/i18n";
import { cn, sanitizeHTML, truncateText } from "@plane/utils";
import { DIFF_NEW_VALUE, DIFF_OLD_VALUE } from "@/components/products/requirements/change/styles";

export type TTextDiffSegment = { type: "same" | "del" | "ins" | "gap"; text: string };

/** 超过就不算了：几千字的描述配上编辑距离上限，jsdiff 本来也会放弃 */
const MAX_TOKENS = 4000;
const MAX_EDIT_LENGTH = 1000;
/** 未变段两头各留几个 token 做上下文 */
const CONTEXT_TOKENS = 12;
/** 算不出 diff 时回落成整值替换，各截这么长 */
const FALLBACK_LENGTH = 180;

/** sanitizeHTML 会把所有空白折成一个空格，段落边界丢了 —— 先把块级闭合标签换成换行 */
const BLOCK_END_RE = /<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>|<br\s*\/?>/gi;

export const htmlToPlainText = (html: string) =>
  html
    .replace(BLOCK_END_RE, "\n")
    .split("\n")
    .map((line) => sanitizeHTML(line))
    .filter(Boolean)
    .join("\n");

const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af";
// 第二支用前瞻排除 CJK，否则 \p{L}+ 会把「abc中文」吞成一个 token
const TOKEN_RE = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}_])+|\\s+|[^\\s\\p{L}\\p{N}_]`, "gu");

export const tokenizeForDiff = (text: string): string[] => text.match(TOKEN_RE) ?? [];

/** 纯文本相同返回 []；算不出（超长 / 改动太大）返回 null，调用方回落成整值替换 */
export const diffPlainText = (before: string, after: string): TTextDiffSegment[] | null => {
  if (before === after) return [];
  const oldTokens = tokenizeForDiff(before);
  const newTokens = tokenizeForDiff(after);
  if (oldTokens.length > MAX_TOKENS || newTokens.length > MAX_TOKENS) return null;
  // @types/diff 5 没把 maxEditLength 超限时的 undefined 写进返回类型
  const changes = diffArrays(oldTokens, newTokens, { maxEditLength: MAX_EDIT_LENGTH }) as
    | ArrayChange<string>[]
    | undefined;
  if (!changes) return null;

  const segments: TTextDiffSegment[] = [];
  changes.forEach((change, index) => {
    if (change.added) {
      segments.push({ type: "ins", text: change.value.join("") });
      return;
    }
    if (change.removed) {
      segments.push({ type: "del", text: change.value.join("") });
      return;
    }
    const tokens = change.value;
    const isHead = index === 0;
    const isTail = index === changes.length - 1;
    const keep = isHead || isTail ? CONTEXT_TOKENS : CONTEXT_TOKENS * 2;
    if (tokens.length <= keep) {
      segments.push({ type: "same", text: tokens.join("") });
      return;
    }
    // 长的未变段只留贴着改动的那一头（中间段两头都留），其余折成省略号
    if (!isHead) segments.push({ type: "same", text: tokens.slice(0, CONTEXT_TOKENS).join("") });
    segments.push({ type: "gap", text: "…" });
    if (!isTail) segments.push({ type: "same", text: tokens.slice(tokens.length - CONTEXT_TOKENS).join("") });
  });
  return segments;
};

export const RequirementInlineTextDiff = ({
  before,
  after,
  isHtml = false,
  className,
}: {
  before: string | null | undefined;
  after: string | null | undefined;
  isHtml?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const { oldText, newText, segments } = useMemo(() => {
    const left = isHtml ? htmlToPlainText(before ?? "") : (before ?? "");
    const right = isHtml ? htmlToPlainText(after ?? "") : (after ?? "");
    return { oldText: left, newText: right, segments: diffPlainText(left, right) };
  }, [after, before, isHtml]);

  if (segments === null) {
    return (
      <span className={cn("flex flex-col gap-1 text-body-xs-regular", className)}>
        {oldText && <span className={DIFF_OLD_VALUE}>{truncateText(oldText, FALLBACK_LENGTH)}</span>}
        {newText && <span className={DIFF_NEW_VALUE}>{truncateText(newText, FALLBACK_LENGTH)}</span>}
      </span>
    );
  }
  if (segments.length === 0) {
    return (
      <span className={cn("text-body-xs-regular text-tertiary", className)}>
        {t("requirement_detail.history.diff.format_only")}
      </span>
    );
  }
  return (
    <span className={cn("text-body-xs-regular leading-5 break-words whitespace-pre-wrap text-primary", className)}>
      {segments.map((segment, index) => {
        const key = `${index}-${segment.type}`;
        if (segment.type === "del") {
          return (
            <del key={key} className="rounded-sm bg-danger-subtle px-0.5 text-danger-primary line-through">
              {segment.text}
            </del>
          );
        }
        if (segment.type === "ins") {
          return (
            <ins key={key} className="rounded-sm bg-success-subtle px-0.5 text-success-primary no-underline">
              {segment.text}
            </ins>
          );
        }
        if (segment.type === "gap") {
          return (
            <span key={key} className="px-0.5 text-placeholder">
              {segment.text}
            </span>
          );
        }
        return <span key={key}>{segment.text}</span>;
      })}
    </span>
  );
};
