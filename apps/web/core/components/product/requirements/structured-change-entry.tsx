import { useState } from "react";
import { ArrowRight, ChevronRight, Copy } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, copyTextToClipboard } from "@plane/utils";
import type { TStructuredDiffEntry, TStructuredField } from "@/services/requirement-structure.service";
import { getRowFieldChanges, type TFieldChangeRow } from "./structured-change-detail";

const scopeLabel: Record<TStructuredDiffEntry["scope"], string> = {
  schema: "字段方案",
  root_row: "主记录",
  child_row: "子表记录",
};

const changeMeta: Record<TStructuredDiffEntry["change_type"], { label: string; className: string }> = {
  added: { label: "新增", className: "bg-success-subtle text-success-primary" },
  removed: { label: "删除", className: "bg-danger-subtle text-danger-primary" },
  modified: { label: "修改", className: "bg-warning-subtle text-warning-primary" },
  moved: { label: "移动", className: "bg-accent-subtle text-accent-primary" },
};

/** 把内部 UUID 收敛成一个可复制的短标识，避免评审人被一长串字符干扰。 */
function RowIdChip(props: { id: string }) {
  const { id } = props;
  return (
    <button
      type="button"
      title={`记录标识 ${id}（点击复制）`}
      onClick={(event) => {
        event.stopPropagation();
        void copyTextToClipboard(id).then(() =>
          setToast({ type: TOAST_TYPE.SUCCESS, title: "已复制记录标识", message: id })
        );
      }}
      className="group/id inline-flex shrink-0 items-center gap-1 rounded bg-layer-1 px-1.5 py-0.5 font-mono text-10 text-tertiary transition-colors hover:bg-layer-2 hover:text-secondary"
    >
      <span>#{id.slice(0, 8)}</span>
      <Copy className="size-2.5 opacity-0 transition-opacity group-hover/id:opacity-100" aria-hidden="true" />
    </button>
  );
}

/** 一个字段值的展示块：变更前(红) / 变更后(绿)，空值以占位提示；色板与 DiffField「新增」tag 对齐。 */
function ValueChip(props: { tone: "before" | "after"; text: string }) {
  const { text, tone } = props;
  return (
    <span
      className={cn(
        "inline-block max-w-full whitespace-pre-wrap break-words rounded-md px-1.5 py-0.5 align-top text-10 font-medium",
        text
          ? tone === "before"
            ? "bg-danger-subtle text-danger-primary"
            : "bg-success-subtle text-success-primary"
          : "bg-layer-2 text-tertiary italic"
      )}
    >
      {text || "空"}
    </span>
  );
}

/** 修改：逐字段「变更前 → 变更后」；新增/删除：字段值同样用 tag，与 DiffField「新增」语义一致。 */
function ChangeDetailTable(props: { rows: TFieldChangeRow[]; changeType: TStructuredDiffEntry["change_type"] }) {
  const { changeType, rows } = props;
  return (
    <div className="space-y-1.5 border-t border-subtle bg-layer-1/50 py-3 pr-5 pl-12">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2 text-11 leading-5">
          <span className="w-24 shrink-0 truncate pt-0.5 text-tertiary" title={row.name}>
            {row.name}
          </span>
          {changeType === "modified" ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <ValueChip tone="before" text={row.before} />
              <ArrowRight className="size-3 shrink-0 text-tertiary" aria-hidden="true" />
              <ValueChip tone="after" text={row.after} />
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <ValueChip
                tone={changeType === "removed" ? "before" : "after"}
                text={changeType === "removed" ? row.before : row.after}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 单条结构化变更：范围标签 + 可读标题（+ 记录短标识）+ 语义化变更类型。
 * 行级改动可展开逐字段对照：修改默认展开并给出「变更前 → 变更后」，新增/删除按需展开看字段值。
 */
export function StructuredChangeEntry(props: { entry: TStructuredDiffEntry; fields?: TStructuredField[] }) {
  const { entry, fields = [] } = props;
  const meta = changeMeta[entry.change_type];
  const isRow = entry.scope !== "schema";

  const fieldChanges = isRow ? getRowFieldChanges(entry, fields) : [];
  const detailRows =
    entry.change_type === "modified"
      ? fieldChanges.filter((row) => row.changed)
      : entry.change_type === "added"
        ? fieldChanges.filter((row) => row.after !== "")
        : entry.change_type === "removed"
          ? fieldChanges.filter((row) => row.before !== "")
          : [];
  const hasDetail = detailRows.length > 0;
  // 「修改」最需要一眼看清前后差异，默认展开；新增/删除标题已足够，按需展开。
  const [open, setOpen] = useState(entry.change_type === "modified");

  return (
    <div>
      <div
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onClick={hasDetail ? () => setOpen((value) => !value) : undefined}
        onKeyDown={
          hasDetail
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpen((value) => !value);
                }
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-3 px-5 py-3",
          hasDetail && "cursor-pointer select-none outline-none hover:bg-layer-1/60 focus-visible:bg-layer-1/60"
        )}
      >
        {hasDetail ? (
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-tertiary transition-transform motion-reduce:transition-none", open && "rotate-90")}
            aria-hidden="true"
          />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="w-16 shrink-0 rounded-md bg-layer-1 px-2 py-1 text-center text-10 text-secondary">
          {scopeLabel[entry.scope]}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-12 font-medium text-primary" title={entry.label}>
            {entry.label}
          </span>
          {isRow && entry.row_key && <RowIdChip id={entry.row_key} />}
        </div>
        <span className={cn("shrink-0 rounded-md px-2 py-1 text-10 font-medium", meta.className)}>{meta.label}</span>
      </div>
      {hasDetail && open && <ChangeDetailTable rows={detailRows} changeType={entry.change_type} />}
    </div>
  );
}
