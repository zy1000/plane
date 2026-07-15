import { useEffect, useState } from "react";
import { Database, GitCompareArrows } from "lucide-react";
import { useRequirementStructure } from "@/hooks/store/use-requirement-structure";
import type { TRequirementChange } from "@/services/requirement.service";
import type { TStructuredDiffEntry } from "@/services/requirement-structure.service";
import { StructuredRequirementEditor } from "./structured-requirement-editor";

const scopeLabel = { schema: "字段方案", root_row: "主记录", child_row: "子表记录" } as const;
const changeLabel = { added: "新增", removed: "删除", modified: "修改", moved: "移动" } as const;

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
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!revisionId) return;
    void service
      .getDiff(workspaceSlug, productId, requirementId, change.id, { page_size: 100 })
      .then((response) => {
        setEntries(response.data);
        setCount(response.count);
      })
      .catch(() => undefined);
  }, [change.id, productId, requirementId, revisionId, service, workspaceSlug]);

  if (!revisionId) return null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-strong bg-surface-1 shadow-raised-200">
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <GitCompareArrows className="size-4" />
            </span>
            <div>
              <h2 className="text-14 font-semibold text-primary">结构化变更</h2>
              <p className="mt-0.5 text-10 text-secondary">按字段、主记录和子表记录分别审查</p>
            </div>
          </div>
          <span className="rounded-md bg-accent-primary px-2.5 py-1.5 text-11 font-semibold text-on-color">
            {count} 处变更
          </span>
        </div>
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-11 text-secondary">结构化数据与基线一致</div>
        ) : (
          <div className="divide-y divide-subtle">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-20 shrink-0 rounded-md bg-layer-1 px-2 py-1 text-center text-10 text-secondary">
                  {scopeLabel[entry.scope]}
                </span>
                <span className="min-w-0 flex-1 truncate text-12 font-medium text-primary">{entry.label}</span>
                <span className="shrink-0 text-10 font-medium text-accent-primary">
                  {changeLabel[entry.change_type]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-strong bg-surface-1 shadow-raised-200">
        <div className="flex items-center gap-3 border-b border-subtle px-5 py-4">
          <Database className="size-4 text-accent-primary" />
          <div>
            <h2 className="text-14 font-semibold text-primary">本轮完整数据</h2>
            <p className="mt-0.5 text-10 text-secondary">评审期间数据已冻结，仅可查看</p>
          </div>
        </div>
        <StructuredRequirementEditor
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirementId}
          revisionId={revisionId}
          editable={false}
          embedded
        />
      </section>
    </div>
  );
}
