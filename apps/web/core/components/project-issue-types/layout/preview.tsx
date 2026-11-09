import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { X } from "lucide-react";
import type { TIssueExtraFieldValue } from "@plane/types";
import { cn } from "@plane/utils";
import { IssueFieldLayout } from "@/components/issues/extra-fields/field-layout";
import { findValueForField, getSelectOptions, upsertValue } from "@/components/issues/extra-fields";
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
import type { TIssueLayoutContext, TIssueTypeFieldLayout } from "@/services/project/issue-type-layout.types";
import { isLongLayoutField } from "@/utils/issue-type-layout";
import { layoutInputClass } from "./inspector";

export function LayoutPreview({
  layout,
  fields,
  onClose,
}: {
  layout: TIssueTypeFieldLayout;
  fields: TTypeExtraField[];
  onClose: () => void;
}) {
  const [context, setContext] = useState<TIssueLayoutContext>("detail");
  const [narrow, setNarrow] = useState(false);
  const [values, setValues] = useState<TIssueExtraFieldValue[]>([]);
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-8">
        <Dialog.Panel className="mx-auto max-w-6xl rounded-lg border border-subtle bg-surface-1 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-4">
            <Dialog.Title className="text-16 font-medium">布局预览</Dialog.Title>
            <div className="flex items-center gap-3 text-13">
              <select
                aria-label="预览场景"
                value={context}
                onChange={(event) => setContext(event.target.value as TIssueLayoutContext)}
                className="rounded border border-subtle bg-surface-1 px-2 py-1"
              >
                <option value="detail">详情查看</option>
                <option value="create">创建表单</option>
                <option value="edit">编辑表单</option>
              </select>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />
                窄屏
              </label>
              <button type="button" aria-label="关闭预览" onClick={onClose}>
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className={cn("mx-auto max-w-full p-5", narrow ? "w-[375px]" : "w-full")}>
            <h3 className="mb-2 text-20 font-semibold">工作项标题</h3>
            <p className="mb-5 text-12 text-tertiary">预览数据仅用于检查布局，不会保存为工作项。</p>
            <section className="mb-6 space-y-3 border-t border-subtle pt-5">
              <h4 className="text-13 font-semibold text-primary">描述</h4>
              <p className="text-14 leading-relaxed text-secondary">
                工作项的背景和目标显示在这里。切换下方业务页签时，标题与描述始终保留。
              </p>
            </section>
            <IssueFieldLayout
              layout={layout}
              fields={fields}
              context={context}
              values={values}
              renderField={(field) => {
                const value = findValueForField(values, field.id);
                const set = (next: TIssueExtraFieldValue["value"]) =>
                  setValues((previous) => upsertValue(previous, field.id, field.field_type, next));
                return (
                  <label className="block text-13 text-secondary">
                    {field.name}
                    {context !== "detail" && field.is_required && <span className="ml-1 text-danger-primary">*</span>}
                    {context === "detail" ? (
                      <span className="mt-1 block whitespace-pre-wrap text-primary">
                        {value === undefined || value === "" ? "未填写" : String(value)}
                      </span>
                    ) : isLongLayoutField(field) ? (
                      <textarea
                        className={layoutInputClass}
                        value={String(value ?? "")}
                        rows={3}
                        onChange={(event) => set(event.target.value)}
                      />
                    ) : field.field_type === "boolean" ? (
                      <input
                        className="ml-3"
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) => set(event.target.checked)}
                      />
                    ) : field.field_type === "select" ? (
                      <select
                        className={layoutInputClass}
                        value={String(value ?? "")}
                        onChange={(event) => set(event.target.value)}
                      >
                        <option value="">请选择</option>
                        {getSelectOptions(field).map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={layoutInputClass}
                        type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                        value={String(value ?? "")}
                        onChange={(event) => set(event.target.value)}
                      />
                    )}
                  </label>
                );
              }}
            />
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
