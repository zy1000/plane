import { useEffect, useMemo, useState } from "react";
import { Database, FileSliders, Send } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { useRequirementStructure } from "@/hooks/store/use-requirement-structure";
import { RequirementStructuredSchemaBuilder } from "./requirement-structured-schema-builder";
import { StructuredDataGrid } from "./structured-data-grid";

export function StructuredRequirementEditor(props: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  revisionId: string;
  editable: boolean;
  onSubmit?: () => Promise<unknown>;
  embedded?: boolean;
}) {
  const { editable, embedded = false, onSubmit, productId, requirementId, revisionId, workspaceSlug } = props;
  const structure = useRequirementStructure(workspaceSlug, productId, requirementId, revisionId);
  const { initialize, revision, saveSchema } = structure;
  const [tab, setTab] = useState<"data" | "schema">("data");
  const [schemaDraft, setSchemaDraft] = useState(revision?.fields ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (revision) setSchemaDraft(revision.fields);
  }, [revision]);

  const activeFields = useMemo(() => (revision?.fields ?? []).filter((field) => field.is_active), [revision]);
  const showError = (error: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: (error as { error?: string })?.error ?? "请刷新后重试。" });

  if (structure.isLoading && !revision) {
    return <div className="h-72 animate-pulse rounded-xl border border-subtle bg-layer-1" />;
  }

  if (!revision) {
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border border-subtle bg-layer-1 text-12 text-secondary">
        结构化数据加载失败
      </div>
    );
  }

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden bg-surface-1", !embedded && "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Database className="size-4" />
          </span>
          <div>
            <h2 className="text-13 font-semibold text-primary">结构化需求数据</h2>
            <p className="mt-0.5 text-10 text-tertiary">
              {revision.root_row_count} 条主记录 · {revision.child_row_count} 条子记录 · 数据修订{" "}
              {revision.lock_version}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md bg-layer-1 p-1">
            <button
              type="button"
              onClick={() => setTab("data")}
              className={cn(
                "rounded px-3 py-1.5 text-11 font-medium",
                tab === "data" ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary"
              )}
            >
              数据条目
            </button>
            <button
              type="button"
              onClick={() => setTab("schema")}
              className={cn(
                "rounded px-3 py-1.5 text-11 font-medium",
                tab === "schema" ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary"
              )}
            >
              字段方案
            </button>
          </div>
          {editable && onSubmit && (
            <Button
              type="button"
              variant="primary"
              size="lg"
              prependIcon={<Send className="size-4" />}
              loading={isSubmitting}
              onClick={() => {
                setIsSubmitting(true);
                void onSubmit()
                  .then(() =>
                    setToast({ type: TOAST_TYPE.SUCCESS, title: "已提交评审", message: "字段方案和数据已冻结。" })
                  )
                  .catch(showError)
                  .finally(() => setIsSubmitting(false));
              }}
            >
              提交评审
            </Button>
          )}
        </div>
      </div>

      {tab === "schema" ? (
        <div className={cn("vertical-scrollbar overflow-y-auto p-4", embedded ? "max-h-[640px]" : "min-h-0 flex-1")}>
          <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-subtle bg-layer-1 px-4 py-3">
            <div className="flex gap-3">
              <FileSliders className="mt-0.5 size-4 text-accent-primary" />
              <div>
                <p className="text-12 font-medium text-primary">字段结构与校验规则</p>
                <p className="mt-1 text-10 leading-4 text-secondary">
                  自动 ID 发号后不可修改前缀；已录入数据的字段不可更换类型或层级。
                </p>
              </div>
            </div>
            {editable && (
              <Button
                type="button"
                variant="primary"
                size="lg"
                loading={structure.isMutating}
                onClick={() =>
                  void saveSchema(schemaDraft)
                    .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "字段方案已更新。" }))
                    .catch(showError)
                }
              >
                保存字段方案
              </Button>
            )}
          </div>
          <RequirementStructuredSchemaBuilder fields={schemaDraft} onChange={setSchemaDraft} readOnly={!editable} />
        </div>
      ) : activeFields.length === 0 ? (
        <div className="grid min-h-72 place-items-center p-6 text-center">
          <div>
            <FileSliders className="mx-auto size-7 text-placeholder" />
            <p className="mt-3 text-13 font-medium text-primary">请先定义字段方案</p>
            <p className="mt-1 text-11 text-secondary">字段保存后即可录入多条数据。</p>
            {editable && (
              <Button type="button" variant="primary" size="lg" className="mt-4" onClick={() => setTab("schema")}>
                开始定义字段
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn("min-h-0", embedded ? "" : "flex-1 overflow-hidden")}>
          <div className={cn("vertical-scrollbar horizontal-scrollbar overflow-auto", embedded ? "max-h-[680px]" : "h-full")}>
            <StructuredDataGrid editable={editable} fields={activeFields} structure={structure} />
          </div>
        </div>
      )}

      {tab === "data" && editable && activeFields.length > 0 && (
        <div className="flex shrink-0 items-center border-t border-subtle bg-surface-1 px-4 py-2.5">
          <p className="text-10 text-tertiary">
            单元格失焦即自动保存 · 删除会保留编号缺口，已发号永不重用 · 调整顺序不会改变 ID。
          </p>
        </div>
      )}
    </section>
  );
}
