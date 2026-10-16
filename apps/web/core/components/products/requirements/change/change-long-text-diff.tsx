/**
 * 变更单里长文本字段（描述 / 富文本 / 长的单行文本）的前后对比。
 *
 * 塞在「字段｜变更前｜变更后」三栏里时，描述被截成 180 字一行再整段划掉，审批人看不出
 * 改了哪；没有空格的长串还会冲出格子。这里单独占一个全宽块：
 * - 按段落对齐，段内逐词标红删 / 绿增（复用 inline-text-diff 的切词）
 * - 合并对照 / 左右对照 / 只看新版 三档；改动过半算「整段改写」，默认左右对照（逐词标记读不下去）
 * - 超长折叠，点开看全文
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { diffArrays } from "diff";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { diffPlainText, type TTextDiffSegment } from "@/components/common/inline-text-diff";

type TMode = "inline" | "split" | "new_only";

type TParagraphRow = {
  left?: string;
  right?: string;
  /** 两侧都有且不同才有；null = 算不出逐词 diff，整段替换 */
  segments?: TTextDiffSegment[] | null;
};

/** 折叠时的高度，约 10 行正文 */
const COLLAPSED_MAX_HEIGHT = 280;
/** 只超出一点点就不折了，省得点开只多出一行 */
const COLLAPSE_TOLERANCE = 48;
/** 改动字数占两侧总字数的比例超过它，逐词标记反而难读，按整段改写处理 */
const REWRITE_RATIO = 0.5;

const WRAP_CLASS = "break-words whitespace-pre-wrap [overflow-wrap:anywhere]";
const DEL_CLASS = "rounded-sm bg-danger-subtle-hover px-0.5 text-danger-primary line-through";
const INS_CLASS = "rounded-sm bg-success-subtle-1 px-0.5 text-success-primary no-underline";

const toLines = (text: string) => (text ? text.split("\n") : []);
const countChars = (text: string) => text.replace(/\s/g, "").length;

/** 先按段落对齐，删一段紧跟加一段的视为同一段被改，再在段内逐词比 */
const buildRows = (oldText: string, newText: string): TParagraphRow[] => {
  const changes = diffArrays(toLines(oldText), toLines(newText));
  const rows: TParagraphRow[] = [];
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (change.added) {
      change.value.forEach((line) => rows.push({ right: line }));
      continue;
    }
    if (!change.removed) {
      change.value.forEach((line) => rows.push({ left: line, right: line }));
      continue;
    }
    const next = changes[index + 1];
    const added = next?.added ? next.value : [];
    if (next?.added) index++;
    for (let offset = 0; offset < Math.max(change.value.length, added.length); offset++) {
      const left = change.value[offset];
      const right = added[offset];
      rows.push({
        left,
        right,
        segments: left !== undefined && right !== undefined ? diffPlainText(left, right, false) : undefined,
      });
    }
  }
  return rows;
};

const getStats = (rows: TParagraphRow[]) => {
  let added = 0;
  let removed = 0;
  rows.forEach((row) => {
    if (row.left === row.right) return;
    if (row.segments) {
      row.segments.forEach((segment) => {
        if (segment.type === "ins") added += countChars(segment.text);
        if (segment.type === "del") removed += countChars(segment.text);
      });
      return;
    }
    removed += countChars(row.left ?? "");
    added += countChars(row.right ?? "");
  });
  return { added, removed };
};

const Segments = ({ segments, side }: { segments: TTextDiffSegment[]; side?: "left" | "right" }) => (
  <>
    {segments.map((segment, index) => {
      const key = `${index}-${segment.type}`;
      if (segment.type === "del") {
        return side === "right" ? null : (
          <del key={key} className={DEL_CLASS}>
            {segment.text}
          </del>
        );
      }
      if (segment.type === "ins") {
        return side === "left" ? null : (
          <ins key={key} className={INS_CLASS}>
            {segment.text}
          </ins>
        );
      }
      return <span key={key}>{segment.text}</span>;
    })}
  </>
);

/** 一侧的段落：同段原样，改过的段只标本侧的增删，另一侧独有的段整段着色 */
const SideParagraph = ({ row, side }: { row: TParagraphRow; side: "left" | "right" }) => {
  const text = side === "left" ? row.left : row.right;
  if (text === undefined) return null;
  if (row.left === row.right) return <>{text}</>;
  if (row.segments) return <Segments segments={row.segments} side={side} />;
  return side === "left" ? <del className={DEL_CLASS}>{text}</del> : <ins className={INS_CLASS}>{text}</ins>;
};

const InlineParagraph = ({ row }: { row: TParagraphRow }) => {
  if (row.left === row.right) return <>{row.left}</>;
  if (row.segments) return <Segments segments={row.segments} />;
  return (
    <>
      {row.left !== undefined && <del className={DEL_CLASS}>{row.left}</del>}
      {row.right !== undefined && <ins className={INS_CLASS}>{row.right}</ins>}
    </>
  );
};

/** 超过约 10 行就折起来，底部渐隐到 fadeVar 指定的底色 */
const CollapsibleBody = ({
  children,
  className,
  fadeVar = "--bg-surface-1",
}: {
  children: React.ReactNode;
  className?: string;
  fadeVar?: string;
}) => {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight > COLLAPSED_MAX_HEIGHT + COLLAPSE_TOLERANCE);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflowing && !expanded;
  return (
    <div className={className}>
      <div
        ref={contentRef}
        className={cn(collapsed && "overflow-hidden")}
        style={collapsed ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
      >
        {children}
      </div>
      {collapsed && (
        <div
          aria-hidden
          className="pointer-events-none relative -mt-14 h-14"
          style={{ background: `linear-gradient(to bottom, transparent, var(${fadeVar}) 85%)` }}
        />
      )}
      {overflowing && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-subtle bg-surface-1 px-4 py-1 text-13 font-medium text-accent-primary hover:bg-layer-1"
          >
            {expanded
              ? t("workspace_products.requirements.change.long_text.collapse")
              : t("workspace_products.requirements.change.long_text.expand")}
          </button>
        </div>
      )}
    </div>
  );
};

type TProps = {
  label: string;
  before: string;
  after: string;
  /** 「显示全部字段」时没变的长字段也走这里，只展示正文 */
  changed: boolean;
};

export function ChangeLongTextDiff({ label, before, after, changed }: TProps) {
  const { t } = useTranslation();

  const { rows, stats, isRewrite } = useMemo(() => {
    const paragraphRows = buildRows(before, after);
    const paragraphStats = getStats(paragraphRows);
    const total = countChars(before) + countChars(after);
    return {
      rows: paragraphRows,
      stats: paragraphStats,
      isRewrite:
        Boolean(before && after) && total > 0 && (paragraphStats.added + paragraphStats.removed) / total > REWRITE_RATIO,
    };
  }, [after, before]);

  const [mode, setMode] = useState<TMode>(isRewrite ? "split" : "inline");

  const modes: { key: TMode; label: string; className?: string }[] = [
    { key: "inline", label: t("workspace_products.requirements.change.long_text.mode.inline") },
    {
      key: "split",
      label: t("workspace_products.requirements.change.long_text.mode.split"),
      // 窄屏两栏挤不下，只留合并 / 只看新版
      className: "hidden lg:inline-flex",
    },
    { key: "new_only", label: t("workspace_products.requirements.change.long_text.mode.new_only") },
  ];

  const renderBody = () => {
    if (!changed) {
      return (
        <CollapsibleBody className="px-5 py-4">
          <p className={cn("text-14 leading-7 text-primary", WRAP_CLASS)}>{after}</p>
        </CollapsibleBody>
      );
    }
    if (mode === "new_only") {
      return (
        <CollapsibleBody className="px-5 py-4">
          {after ? (
            <p className={cn("text-14 leading-7 text-primary", WRAP_CLASS)}>{after}</p>
          ) : (
            <span className="text-13 text-placeholder">
              {t("workspace_products.requirements.change.empty_value")}
            </span>
          )}
        </CollapsibleBody>
      );
    }
    if (mode === "split") {
      return (
        <CollapsibleBody>
          <div className="grid grid-cols-2 border-b border-subtle text-12 font-semibold">
            <span className="px-5 py-2 text-danger-secondary">{t("workspace_products.requirements.change.before")}</span>
            <span className="border-l border-subtle px-5 py-2 text-success-secondary">
              {t("workspace_products.requirements.change.after")}
            </span>
          </div>
          {/* 每侧是一整块正文：段落只按行对齐，不画分隔线，免得看起来像拆成了好几个框 */}
          <div className={cn("grid grid-cols-2 text-14 leading-7 text-primary", WRAP_CLASS)}>
            {rows.map((row, index) => (
              <div key={index} className="contents">
                {(["left", "right"] as const).map((side) => (
                  <div
                    key={side}
                    // 另一侧独有的段落：这一侧留空，两栏段落仍然一一对齐；首尾行补足上下留白，中线才连贯
                    className={cn(
                      "min-w-0 px-5 py-1.5",
                      index === 0 && "pt-4",
                      index === rows.length - 1 && "pb-4",
                      side === "right" && "border-l border-subtle"
                    )}
                  >
                    <SideParagraph row={row} side={side} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CollapsibleBody>
      );
    }
    return (
      <CollapsibleBody className="px-5 py-4">
        <div className={cn("flex flex-col gap-3 text-14 leading-7 text-primary", WRAP_CLASS)}>
          {rows.map((row, index) => (
            <p key={index}>
              <InlineParagraph row={row} />
            </p>
          ))}
        </div>
      </CollapsibleBody>
    );
  };

  return (
    <section className="overflow-hidden rounded-md border border-subtle">
      <header className="flex flex-wrap items-center gap-3 border-b border-subtle bg-layer-1 py-2 pr-2 pl-4">
        <h4 className="text-13 font-semibold text-primary">{label}</h4>
        {changed && (
          <>
            {stats.added > 0 && (
              <span className="text-12 text-success-secondary tabular-nums">
                {t("workspace_products.requirements.change.long_text.added", { count: stats.added })}
              </span>
            )}
            {stats.removed > 0 && (
              <span className="text-12 text-danger-secondary tabular-nums">
                {t("workspace_products.requirements.change.long_text.removed", { count: stats.removed })}
              </span>
            )}
            {isRewrite && (
              <span className="rounded-full bg-layer-2 px-2 py-0.5 text-11 text-secondary">
                {t("workspace_products.requirements.change.long_text.rewritten")}
              </span>
            )}
            <div
              role="group"
              aria-label={t("workspace_products.requirements.change.long_text.mode_label")}
              className="ml-auto inline-flex gap-0.5 rounded-md bg-layer-3 p-0.5"
            >
              {modes.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={mode === item.key}
                  onClick={() => setMode(item.key)}
                  className={cn(
                    "inline-flex items-center rounded px-3 py-1 text-12",
                    mode === item.key
                      ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                      : "text-secondary hover:text-primary",
                    item.className
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </header>
      {renderBody()}
    </section>
  );
}
