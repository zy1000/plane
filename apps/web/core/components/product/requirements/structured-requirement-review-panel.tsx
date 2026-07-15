import { useEffect, useMemo, useState } from "react";
import { Database } from "lucide-react";
import { cn } from "@plane/utils";
import { useRequirementStructure } from "@/hooks/store/use-requirement-structure";
import type { TRequirementChange } from "@/services/requirement.service";
import type { TStructuredDiffEntry, TStructuredField } from "@/services/requirement-structure.service";
import { getChangedFieldKeys } from "./structured-change-detail";
import { StructuredChangeEntry } from "./structured-change-entry";
import { summarizeStructuredDiff } from "./structured-diff-summary";
import type { TStructuredReviewHighlights } from "./structured-data-grid";
import { StructuredRequirementEditor } from "./structured-requirement-editor";

type TStructuredReviewTab = "changes" | "data";

/** 把逐项 diff 汇总成「完整数据」表所需的行/单元格高亮映射。 */
function buildHighlights(entries: TStructuredDiffEntry[], fields: TStructuredField[]): TStructuredReviewHighlights {
  const rowChangeType = new Map<string, "added" | "modified" | "moved">();
  const changedCells = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.scope === "schema" || !entry.row_key) continue;
    // 一行可能同时是「修改」和「移动」，以内容变更优先展示
    const existing = rowChangeType.get(entry.row_key);
    if (entry.change_type === "added" || entry.change_type === "modified") {
      rowChangeType.set(entry.row_key, entry.change_type);
    } else if (entry.change_type === "moved" && !existing) {
      rowChangeType.set(entry.row_key, "moved");
    }
    if (entry.change_type === "modified") {
      changedCells.set(entry.row_key, new Set(getChangedFieldKeys(entry, fields)));
    }
  }
  return { rowChangeType, changedCells };
}

export function StructuredRequirementReviewPanel(props: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  change: TRequirementChange;
}) {
  const { change, productId, requirementId, workspaceSlug } = props;
  const revisionId = change.structured_revision_id ?? "";
  const { service } = useRequirementStructure(workspaceSlug, productId, requirementId, revisionId);
  const [entries, setEntries] = useState<TStructuredDiffEntry[]>([]);
  const [fields, setFields] = useState<TStructuredField[]>([]);
  const [count, setCount] = useState(0);
  // 新建需求所有内容都是「新增」，逐项列表与完整数据几乎重复，默认直接看完整数据
  const isNewRequirement = change.base_version_number == null;
  const [tab, setTab] = useState<TStructuredReviewTab>(isNewRequirement ? "data" : "changes");

  useEffect(() => {
    if (!revisionId) return;
    void service
      .getDiff(workspaceSlug, productId, requirementId, change.id, { page_size: 100 })
      .then((response) => {
        setEntries(response.data);
        setCount(response.count);
      })
      .catch(() => undefined);
    void service
      .getRevision(workspaceSlug, productId, requirementId, revisionId)
      .then((revision) => setFields(revision.fields))
      .catch(() => undefined);
  }, [change.id, productId, requirementId, revisionId, service, workspaceSlug]);

  // 新建需求没有基线可对照，全绿高亮无意义，仅在有基线时点亮「完整数据」表
  const highlights = useMemo(
    () => (isNewRequirement || entries.length === 0 ? undefined : buildHighlights(entries, fields)),
    [entries, fields, isNewRequirement]
  );

  if (!revisionId) return null;

  const summary = summarizeStructuredDiff(change.structured_diff_summary);

  const tabButton = (value: TStructuredReviewTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={cn(
        "rounded px-3 py-1.5 text-11 font-medium transition-colors motion-reduce:transition-none",
        tab === value ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary hover:text-primary"
      )}
    >
      {label}
    </button>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-strong bg-surface-1 shadow-raised-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Database className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-semibold text-primary">结构化数据</h2>
            <p className="mt-0.5 text-10 text-secondary">
              {tab === "changes" ? "对照基线逐项审查本轮改动" : "本轮提交的完整数据，评审期间已冻结、仅可查看"}
            </p>
          </div>
        </div>
        <div className="flex rounded-md bg-layer-1 p-1">
          {tabButton("changes", count > 0 ? `本轮变更 ${count}` : "本轮变更")}
          {tabButton("data", "完整数据")}
        </div>
      </div>

      {tab === "changes" ? (
        entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-11 text-secondary">结构化数据与基线一致</div>
        ) : (
          <>
            {summary.total > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-layer-1 px-5 py-2.5">
                <span className="text-10 font-medium text-primary tabular-nums">共 {summary.total} 处变更</span>
                {summary.groups.map((group) => (
                  <span
                    key={group.scope}
                    className="inline-flex items-center gap-1.5 rounded-md bg-surface-1 px-2 py-0.5 text-10 shadow-raised-100"
                  >
                    <span className="font-medium text-primary">{group.scopeLabel}</span>
                    <span className="text-secondary tabular-nums">{group.detail}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="divide-y divide-subtle">
              {entries.map((entry, index) => (
                <StructuredChangeEntry
                  key={`${entry.scope}-${entry.field_key ?? entry.row_key ?? index}-${entry.change_type}`}
                  entry={entry}
                  fields={fields}
                />
              ))}
            </div>
          </>
        )
      ) : (
        <>
          {highlights && <ReviewHighlightLegend />}
          <StructuredRequirementEditor
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirementId}
            revisionId={revisionId}
            editable={false}
            embedded
            reviewHighlights={highlights}
          />
        </>
      )}
    </section>
  );
}

/** 「完整数据」表的高亮图例：绿=本轮新增记录，黄=本轮修改的字段。 */
function ReviewHighlightLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-subtle bg-layer-1 px-5 py-2 text-10 text-secondary">
      <span className="font-medium text-primary">本轮变化</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-success-primary/30 ring-1 ring-success-primary/40" />
        新增记录
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-warning-primary/30 ring-1 ring-warning-primary/40" />
        修改字段
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-accent-primary/30 ring-1 ring-accent-primary/40" />
        记录移动
      </span>
    </div>
  );
}
