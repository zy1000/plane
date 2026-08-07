"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementAssetRef,
  TRequirementData,
  TRequirementField,
  TRequirementFormRow,
  TRequirementValue,
} from "@plane/types";
import { cn } from "@plane/utils";
import { getFormRows, LeafEditor, LeafValue } from "@/components/requirements/requirement-grid-shared";

/**
 * 子表单区：一个需求类型可以定义任意多个 form 字段。
 *
 * 每个 form 单独成块并不难，难的是「四五个子表单一路铺下来，子需求和变更轨迹被顶到
 * 几屏之外」。所以全部收进这一个区里：顶部一排索引胶囊给跳转与总量，下面每块各自
 * 折叠。只有一个子表单时索引胶囊不出现，退化成朴素的一块表格，不白加一层。
 */
type TProps = {
  /** 已按 sort_order 排好的 form 字段 */
  forms: TRequirementField[];
  data: TRequirementData;
  workspaceSlug: string;
  /** 富文本内联资源的归属实体 */
  entityId: string;
  readOnly: boolean;
  /** 默认展开几块：抽屉 1、整页 2 —— 版面宽窄不同，能一眼看到的量也不同 */
  defaultOpenCount: number;
  /** 折叠态的存储命名空间，按需求类型区分 */
  storageKey: string;
  onChange: (data: TRequirementData) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
};

export const RequirementSubformSection = (props: TProps) => {
  const { forms, data, workspaceSlug, entityId, readOnly, defaultOpenCount, storageKey, onChange, onUpload } = props;
  const { t } = useTranslation();
  const { storedValue: openIds, setValue: setOpenIds } = useLocalStorage<string[] | null>(storageKey, null);
  /** 点索引胶囊后要滚过去，滚动容器由调用方决定，所以只记 id 让 ref 回调去做 */
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const rowsByForm = useMemo(
    () => Object.fromEntries(forms.map((form) => [form.id, getFormRows(data, form.id)])),
    [data, forms]
  );

  /**
   * 没存过折叠态时的缺省：按顺序展开前 N 块，但空表单一律折叠 —— 展开一块「暂无数据」
   * 只是白占版面。
   */
  const defaultOpenIds = useMemo(() => {
    const withRows = forms.filter((form) => (rowsByForm[form.id]?.length ?? 0) > 0);
    return withRows.slice(0, defaultOpenCount).map((form) => form.id);
  }, [defaultOpenCount, forms, rowsByForm]);

  const effectiveOpenIds = openIds ?? defaultOpenIds;

  const toggle = (formId: string) =>
    setOpenIds(
      effectiveOpenIds.includes(formId)
        ? effectiveOpenIds.filter((id) => id !== formId)
        : [...effectiveOpenIds, formId]
    );

  const jumpTo = (formId: string) => {
    if (!effectiveOpenIds.includes(formId)) setOpenIds([...effectiveOpenIds, formId]);
    setPendingScrollId(formId);
  };

  const writeRows = (formId: string, rows: TRequirementFormRow[]) => onChange({ ...data, [formId]: rows });

  const addRow = (form: TRequirementField) => {
    // 子行自带 UUID：复制整行需求时要靠它重新分配，撞 id 会让两行的表单行互相串写
    writeRows(form.id, [...(rowsByForm[form.id] ?? []), { id: uuidv4(), values: {} }]);
    if (!effectiveOpenIds.includes(form.id)) setOpenIds([...effectiveOpenIds, form.id]);
  };

  const removeRow = (form: TRequirementField, rowId: string) =>
    writeRows(
      form.id,
      (rowsByForm[form.id] ?? []).filter((row) => row.id !== rowId)
    );

  const setCell = (form: TRequirementField, rowId: string, childId: string, value: TRequirementValue) =>
    writeRows(
      form.id,
      (rowsByForm[form.id] ?? []).map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [childId]: value } } : row
      )
    );

  if (!forms.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {forms.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {forms.map((form) => {
            const count = rowsByForm[form.id]?.length ?? 0;
            return (
              <button
                key={form.id}
                type="button"
                onClick={() => jumpTo(form.id)}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-12 transition-colors",
                  "border-subtle bg-surface-1 text-secondary hover:border-accent-subtle hover:text-primary",
                  count === 0 && "text-placeholder"
                )}
              >
                <span className="max-w-40 truncate">{form.name}</span>
                <span className="text-10 font-medium tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {forms.map((form) => {
        const rows = rowsByForm[form.id] ?? [];
        const isOpen = effectiveOpenIds.includes(form.id);
        const columns = form.children.filter((child) => child.is_active);
        return (
          <div
            key={form.id}
            ref={(node) => {
              if (node && pendingScrollId === form.id) {
                node.scrollIntoView({ block: "nearest", behavior: "smooth" });
                setPendingScrollId(null);
              }
            }}
            className="overflow-hidden rounded-md border border-subtle"
          >
            <div className="flex items-center gap-2 bg-layer-1 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => toggle(form.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-12 font-medium text-primary"
              >
                {isOpen ? (
                  <ChevronDown className="size-3 shrink-0 text-tertiary" />
                ) : (
                  <ChevronRight className="size-3 shrink-0 text-tertiary" />
                )}
                <span className="truncate">{form.name}</span>
                <span className="shrink-0 text-11 font-normal text-tertiary">
                  {rows.length
                    ? t("requirement_detail.subform.row_count", { count: rows.length })
                    : t("requirement_detail.subform.empty")}
                </span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => addRow(form)}
                  className="inline-flex shrink-0 items-center gap-1 text-11 text-accent-primary hover:text-accent-primary-hover"
                >
                  <Plus className="size-3" />
                  {t("requirement_detail.subform.add_row")}
                </button>
              )}
            </div>

            {isOpen && columns.length > 0 && rows.length > 0 && (
              // 子字段多时单块表格自己横滚，页面本身永远不横滚
              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-subtle">
                      {columns.map((child) => (
                        <th
                          key={child.id}
                          className="min-w-32 border-r border-subtle px-2.5 py-1.5 text-11 font-medium text-secondary"
                        >
                          {child.name}
                          {child.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
                        </th>
                      ))}
                      {!readOnly && <th className="w-9 px-1 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-subtle last:border-b-0">
                        {columns.map((child) => (
                          <td key={child.id} className="border-r border-subtle px-2.5 py-1.5 align-top">
                            {readOnly ? (
                              <LeafValue
                                field={child}
                                value={row.values?.[child.id]}
                                workspaceSlug={workspaceSlug}
                              />
                            ) : (
                              <LeafEditor
                                field={child}
                                value={row.values?.[child.id]}
                                workspaceSlug={workspaceSlug}
                                entityId={entityId}
                                onChange={(value) => setCell(form, row.id, child.id, value)}
                                onUpload={onUpload}
                              />
                            )}
                          </td>
                        ))}
                        {!readOnly && (
                          <td className="px-1 py-1.5 text-center align-top">
                            <button
                              type="button"
                              onClick={() => removeRow(form, row.id)}
                              className="grid size-6 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
                              aria-label={t("delete")}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isOpen && columns.length === 0 && (
              <p className="px-2.5 py-3 text-12 text-placeholder">{t("requirement_detail.subform.no_fields")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
