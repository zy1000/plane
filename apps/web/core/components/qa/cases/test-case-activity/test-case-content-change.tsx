"use client";

/**
 * 用例活动里「内容型改动」（富文本字段 / 步骤）的行。
 *
 * 这类改动的正文塞不进一行文字：以前一行里直接拼 `更新了前置条件：旧 → 新`，
 * 表格被 strip 成一串没有分隔符的字，用户根本看不出改了什么。
 * 现在行内只回答「改了哪个字段、改了多大」，点开才出保留结构的对照。
 */
import React, { useMemo, useState } from "react";
import { Modal } from "antd";
import { ChevronDown, Columns2, FileText, ListOrdered } from "lucide-react";
import type { TTestCaseActivity } from "@plane/types";
import { cn } from "@plane/utils";
import { InlineTextDiff } from "@/components/common/inline-text-diff";
import { TEST_CASE_FIELD_LABELS } from "./test-case-activity-message";
import {
  buildRichTextChange,
  diffSteps,
  parseContentBlocks,
  readRichTextExtra,
  readStepsExtra,
  type TCaseStep,
  type TContentBlock,
  type TStepDiff,
  type TTableDiff,
} from "./test-case-change-model";

const CELL = "border-b border-r border-subtle px-2.5 py-1.5 align-top last:border-r-0";
const GUTTER = "w-7 border-b border-r border-subtle bg-layer-1 text-center font-mono text-12 align-top";

/** 规模徽章：先给量级，用户再决定要不要展开 */
const ScaleBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-layer-1 px-2 py-0.5 text-12 text-tertiary">
    {children}
  </span>
);

const TableDiffView = ({ diff }: { diff: TTableDiff }) => (
  <div className="overflow-x-auto rounded-md border border-subtle bg-surface-1">
    <table className="w-full border-collapse text-13">
      <tbody>
        {diff.rows.map((row, rowIndex) => {
          const tone =
            row.op === "add"
              ? "bg-success-subtle"
              : row.op === "del"
                ? "bg-danger-subtle"
                : row.op === "chg"
                  ? "bg-warning-subtle"
                  : "";
          const marker = row.op === "add" ? "+" : row.op === "del" ? "−" : row.op === "chg" ? "~" : "";
          return (
            <tr key={rowIndex} className={tone}>
              <td
                className={cn(
                  GUTTER,
                  row.op === "add" && "text-success-primary",
                  row.op === "del" && "text-danger-primary",
                  row.op === "chg" && "text-warning-primary"
                )}
              >
                {marker}
              </td>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(CELL, row.op === "same" ? "text-tertiary" : "text-primary", "whitespace-pre-wrap")}
                >
                  {row.op === "chg" && cell.changed ? (
                    <>
                      <del className="rounded-sm bg-danger-subtle px-0.5 text-danger-primary line-through">
                        {cell.before || "空"}
                      </del>{" "}
                      <ins className="rounded-sm bg-success-subtle px-0.5 text-success-primary no-underline">
                        {cell.after || "空"}
                      </ins>
                    </>
                  ) : (
                    (cell.after || cell.before || "")
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const StepFields = ({ step, tone }: { step: TCaseStep | undefined; tone?: string }) => (
  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
    <span className="text-12 text-placeholder">操作</span>
    <span className={cn("text-13 whitespace-pre-wrap", tone ?? "text-secondary")}>{step?.description || "空"}</span>
    <span className="text-12 text-placeholder">预期</span>
    <span className={cn("text-13 whitespace-pre-wrap", tone ?? "text-secondary")}>{step?.result || "空"}</span>
  </div>
);

const StepsDiffView = ({ diffs, hiddenCount }: { diffs: TStepDiff[]; hiddenCount: number }) => (
  <div className="flex flex-col gap-2">
    {diffs.map((diff, index) => (
      <div
        key={`${diff.op}-${diff.index}-${index}`}
        className={cn(
          "grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 rounded-md border border-subtle bg-surface-1 px-2.5 py-2",
          diff.op === "add" && "border-success-subtle bg-success-subtle",
          diff.op === "del" && "border-danger-subtle bg-danger-subtle"
        )}
      >
        <span
          className={cn(
            "text-12 font-semibold text-tertiary tabular-nums",
            diff.op === "add" && "text-success-primary",
            diff.op === "del" && "text-danger-primary"
          )}
        >
          第 {diff.index} 步
        </span>
        {diff.op === "chg" ? (
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
            <span className="text-12 text-placeholder">操作</span>
            <InlineTextDiff before={diff.before?.description} after={diff.after?.description} className="text-13" />
            <span className="text-12 text-placeholder">预期</span>
            <InlineTextDiff before={diff.before?.result} after={diff.after?.result} className="text-13" />
          </div>
        ) : (
          <StepFields
            step={diff.op === "del" ? diff.before : diff.after}
            tone={diff.op === "del" ? "text-danger-primary line-through" : undefined}
          />
        )}
      </div>
    ))}
    {hiddenCount > 0 && <span className="text-12 text-placeholder">未变更的 {hiddenCount} 步已折叠</span>}
  </div>
);

/** 并排对比：两侧都按解析出来的块结构原样渲染，不注入 HTML */
const ContentBlocks = ({ blocks }: { blocks: TContentBlock[] }) => (
  <div className="flex flex-col gap-2.5">
    {blocks.map((block, index) =>
      block.type === "text" ? (
        <p key={index} className="text-13 whitespace-pre-wrap text-secondary">
          {block.text}
        </p>
      ) : (
        <div key={index} className="overflow-x-auto rounded-md border border-subtle">
          <table className="w-full border-collapse text-13">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn(CELL, "text-secondary")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    )}
    {blocks.length === 0 && <span className="text-13 text-placeholder">空</span>}
  </div>
);

const SideBySideModal = ({
  isOpen,
  onClose,
  label,
  oldHtml,
  newHtml,
}: {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  oldHtml: string;
  newHtml: string;
}) => {
  const before = useMemo(() => (isOpen ? parseContentBlocks(oldHtml) : []), [isOpen, oldHtml]);
  const after = useMemo(() => (isOpen ? parseContentBlocks(newHtml) : []), [isOpen, newHtml]);
  return (
    // 用例详情抽屉是 z-[1100]，弹窗必须压在它上面 —— 与同抽屉的版本对比弹窗取同一层级
    <Modal
      title={`${label} · 并排对比`}
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnHidden
      zIndex={1250}
    >
      <div className="grid max-h-[65vh] grid-cols-1 gap-px overflow-y-auto rounded-md border border-subtle bg-subtle md:grid-cols-2">
        <section className="flex flex-col bg-surface-1">
          <h4 className="sticky top-0 border-b border-subtle bg-layer-1 px-4 py-2 text-12 text-placeholder">改前</h4>
          <div className="p-4">
            <ContentBlocks blocks={before} />
          </div>
        </section>
        <section className="flex flex-col bg-surface-1">
          <h4 className="sticky top-0 border-b border-subtle bg-success-subtle px-4 py-2 text-12 text-success-primary">
            改后
          </h4>
          <div className="p-4">
            <ContentBlocks blocks={after} />
          </div>
        </section>
      </div>
    </Modal>
  );
};

type Props = { activity: TTestCaseActivity };

/** 富文本字段：表格逐格对照 + 正文行内词级对照 */
const RichTextChange = ({ activity, label }: Props & { label: string }) => {
  const [open, setOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const raw = readRichTextExtra(activity);
  const change = useMemo(() => (raw ? buildRichTextChange(raw.oldHtml, raw.newHtml) : null), [raw]);

  // 老数据（改版前写入的活动）没有 extra 原文，只能显示 strip 过的摘要
  if (!raw || !change) {
    return (
      <div className="flex flex-col gap-1">
        <InlineTextDiff before={activity.old_value} after={activity.new_value} className="text-13" />
      </div>
    );
  }

  const totals = change.tables.reduce(
    (acc, table) => ({
      added: acc.added + table.addedRows,
      removed: acc.removed + table.removedRows,
      cells: acc.cells + table.changedCells,
    }),
    { added: 0, removed: 0, cells: 0 }
  );
  const firstTable = change.tables[0];
  const textChanged = change.textBefore !== change.textAfter;

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <ScaleBadge>
          {change.tablesComparable && firstTable ? (
            <>
              <FileText className="size-3" aria-hidden />
              <span>
                表格 {firstTable.rows.length}×{firstTable.columns}
              </span>
              {totals.added > 0 && <span className="font-semibold text-success-primary">+{totals.added} 行</span>}
              {totals.removed > 0 && <span className="font-semibold text-danger-primary">−{totals.removed} 行</span>}
              {totals.cells > 0 && <span className="font-semibold text-warning-primary">~{totals.cells} 格</span>}
            </>
          ) : (
            <span className="font-medium text-secondary">内容有变更</span>
          )}
        </ScaleBadge>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-12 font-medium text-accent-primary hover:bg-accent-subtle"
        >
          {open ? "收起" : "展开"}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </span>

      {open && (
        <div className="w-full overflow-hidden rounded-lg border border-subtle bg-surface-2">
          <div className="flex items-center justify-between gap-2 border-b border-subtle bg-layer-1 px-3 py-1.5">
            <span className="text-12 text-tertiary">{label}</span>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-12 text-tertiary hover:bg-layer-2 hover:text-secondary"
            >
              <Columns2 className="size-3" aria-hidden />
              并排看完整内容
            </button>
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            {textChanged && (
              <InlineTextDiff before={change.textBefore} after={change.textAfter} className="text-13" />
            )}
            {change.tables.map((table, index) => (
              <TableDiffView key={index} diff={table} />
            ))}
            {!change.tablesComparable && !textChanged && (
              <span className="text-13 text-placeholder">仅格式调整，文字未变</span>
            )}
          </div>
        </div>
      )}

      <SideBySideModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        label={label}
        oldHtml={raw.oldHtml}
        newHtml={raw.newHtml}
      />
    </>
  );
};

/** 步骤：逐步骤对照，只列变化的那几步 */
const StepsChange = ({ activity }: Props) => {
  const [open, setOpen] = useState(false);
  const raw = readStepsExtra(activity);
  const diffs = useMemo(() => (raw ? diffSteps(raw.before, raw.after) : []), [raw]);

  const oldCount = Number(activity.old_value);
  const newCount = Number(activity.new_value);
  const countLabel =
    Number.isFinite(oldCount) && Number.isFinite(newCount) && oldCount !== newCount
      ? `${oldCount} 步 → ${newCount} 步`
      : `共 ${Number.isFinite(newCount) ? newCount : raw?.after.length} 步`;

  if (!raw || diffs.length === 0) {
    return (
      <ScaleBadge>
        <ListOrdered className="size-3" aria-hidden />
        {countLabel}
      </ScaleBadge>
    );
  }

  const added = diffs.filter((diff) => diff.op === "add").length;
  const removed = diffs.filter((diff) => diff.op === "del").length;
  const changed = diffs.filter((diff) => diff.op === "chg").length;

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <ScaleBadge>
          <ListOrdered className="size-3" aria-hidden />
          <span>{countLabel}</span>
          {added > 0 && <span className="font-semibold text-success-primary">+{added}</span>}
          {removed > 0 && <span className="font-semibold text-danger-primary">−{removed}</span>}
          {changed > 0 && <span className="font-semibold text-warning-primary">~{changed}</span>}
        </ScaleBadge>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-12 font-medium text-accent-primary hover:bg-accent-subtle"
        >
          {open ? "收起" : "展开"}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </span>

      {open && (
        <div className="w-full overflow-hidden rounded-lg border border-subtle bg-surface-2 p-3">
          <StepsDiffView diffs={diffs} hiddenCount={Math.max(0, raw.after.length - (added + changed))} />
        </div>
      )}
    </>
  );
};

/** 内容型改动行的右半部分：规模徽章 + 展开开关 + 展开后的对照面板 */
export const TestCaseContentChange = ({ activity }: Props) => {
  const label = TEST_CASE_FIELD_LABELS[activity.field ?? ""] ?? activity.field ?? "";
  if (activity.field === "steps") return <StepsChange activity={activity} />;
  return <RichTextChange activity={activity} label={label} />;
};
