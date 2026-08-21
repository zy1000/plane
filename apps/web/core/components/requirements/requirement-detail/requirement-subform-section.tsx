"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { getFormRows, LeafEditor, LeafValue, MenuRowLabel } from "@/components/requirements/requirement-grid-shared";
import { SubformRowHandle } from "@/components/requirements/subform-row-handle";
import {
  getSubformDropEdgeClass,
  moveFormRow,
  useSubformRowDnd,
} from "@/components/requirements/use-subform-row-dnd";

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
  /**
   * 空表单是否也进默认展开。只读详情关掉（展开一块「暂无数据」白占版面）；
   * 可编辑时要开 —— 没行也得看见表头和「添加行」，否则空表单等于没法填。
   */
  defaultOpenEmpty?: boolean;
  /** 折叠态的存储命名空间，按需求类型区分 */
  storageKey: string;
  onChange: (data: TRequirementData) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
};

export const RequirementSubformSection = (props: TProps) => {
  const {
    forms,
    data,
    workspaceSlug,
    entityId,
    readOnly,
    defaultOpenCount,
    defaultOpenEmpty = false,
    storageKey,
    onChange,
    onUpload,
  } = props;
  const { t } = useTranslation();
  const { storedValue: openIds, setValue: setOpenIds } = useLocalStorage<string[] | null>(storageKey, null);
  /** 行菜单 portal 宿主：表格自己会横滚，菜单挂在滚动容器里会被裁掉 */
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLDivElement | null>(null);
  /** 点索引胶囊后要滚过去，滚动容器由调用方决定，所以只记 id 让 ref 回调去做 */
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const rowsByForm = useMemo(
    () => Object.fromEntries(forms.map((form) => [form.id, getFormRows(data, form.id)])),
    [data, forms]
  );

  /**
   * 没存过折叠态时的缺省：按顺序展开前 N 块。
   * 只读空表单默认折叠；可编辑（含建行弹窗）靠 defaultOpenEmpty 把空表单也展开。
   */
  const defaultOpenIds = useMemo(() => {
    const candidates = defaultOpenEmpty
      ? forms
      : forms.filter((form) => (rowsByForm[form.id]?.length ?? 0) > 0);
    return candidates.slice(0, defaultOpenCount).map((form) => form.id);
  }, [defaultOpenCount, defaultOpenEmpty, forms, rowsByForm]);

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

  /** 在指定位置插入空行。addRow 是它的「插到末尾」特例，但还要负责展开本块，所以分开写 */
  const insertRow = (form: TRequirementField, index: number) => {
    const rows = [...(rowsByForm[form.id] ?? [])];
    rows.splice(index, 0, { id: uuidv4(), values: {} });
    writeRows(form.id, rows);
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

  /**
   * 拖拽只重排数组，写回复用 writeRows —— 保存链路与增删行完全一致。
   *
   * 作用域带上 entityId：建行弹窗盖在详情页上时，同一个需求类型的两份子表单区会同时挂着，
   * 只用 form.id 划范围的话两边的行会互为放置目标，一拖就写错记录。
   */
  const { getRowRef, getDropRef, isDragging, dropEdgeOf } = useSubformRowDnd({
    onReorder: ({ groupId, sourceRowId, targetRowId, edge }) => {
      const formId = groupId.slice(entityId.length + 1);
      const rows = rowsByForm[formId] ?? [];
      const next = moveFormRow(rows, sourceRowId, targetRowId, edge);
      // 落在相邻那条边上等于没动，别白发一次 PATCH
      if (next !== rows) writeRows(formId, next);
    },
  });

  if (!forms.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={setMenuPortalEl} />
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

            {isOpen && columns.length > 0 && (rows.length > 0 || !readOnly) && (
              // 子字段多时单块表格自己横滚，页面本身永远不横滚
              // 可编辑的空表也要把表头和「添加行」露出来，否则没数据就等于没入口
              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-subtle">
                      <th className="w-12 border-r border-subtle px-2.5 py-1.5 text-11 font-medium text-secondary">
                        {t("requirement_detail.subform.row_number")}
                      </th>
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
                    {rows.map((row, index) => {
                      const rowKey = `${form.id}:${row.id}`;
                      // 指示线与拖动态画在每个单元格上：<tr> 在 border-collapse 下吃不住阴影
                      const dragClass = readOnly
                        ? ""
                        : cn(getSubformDropEdgeClass(dropEdgeOf(rowKey)), isDragging(rowKey) && "opacity-40");
                      const dragPayload = { groupId: `${entityId}:${form.id}`, rowId: row.id, rowKey };
                      return (
                        <tr key={row.id} className="group border-b border-subtle last:border-b-0">
                          <td
                            /*
                             * 可拖的是编号格本身，不是整条 <tr> —— 与网格保持同一套结构。
                             * 其余单元格只注册成放置目标，于是落点范围仍然是整行。
                             */
                            ref={readOnly ? undefined : getRowRef(rowKey, dragPayload)}
                            className={cn(
                              "relative border-r border-subtle px-2.5 py-1.5 text-center align-top text-12 text-tertiary tabular-nums",
                              !readOnly && "cursor-grab active:cursor-grabbing",
                              dragClass
                            )}
                          >
                            <SubformRowHandle
                              index={index + 1}
                              label={t("requirement_detail.subform.reorder_row")}
                              draggable={!readOnly}
                            />
                          </td>
                          {columns.map((child) => (
                            <td
                              key={child.id}
                              ref={readOnly ? undefined : getDropRef(`${rowKey}#${child.id}`, dragPayload)}
                              className={cn("border-r border-subtle px-2.5 py-1.5 align-top", dragClass)}
                            >
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
                                  deferTextCommit
                                />
                              )}
                            </td>
                          ))}
                          {!readOnly && (
                            <td
                              ref={getDropRef(`${rowKey}#actions`, dragPayload)}
                              className={cn("px-1 py-1.5 text-center align-top", dragClass)}
                            >
                              <CustomMenu
                                ariaLabel={t("requirement_detail.subform.row_actions")}
                                customButton={
                                  <span className="grid size-6 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 hover:bg-layer-transparent-hover hover:text-primary">
                                    <MoreHorizontal className="size-3.5" />
                                  </span>
                                }
                                placement="bottom-end"
                                portalElement={menuPortalEl}
                              >
                                <CustomMenu.MenuItem onClick={() => insertRow(form, index)}>
                                  <MenuRowLabel
                                    icon={ArrowUpToLine}
                                    label={t("requirement_detail.subform.insert_above")}
                                  />
                                </CustomMenu.MenuItem>
                                <CustomMenu.MenuItem onClick={() => insertRow(form, index + 1)}>
                                  <MenuRowLabel
                                    icon={ArrowDownToLine}
                                    label={t("requirement_detail.subform.insert_below")}
                                  />
                                </CustomMenu.MenuItem>
                                <CustomMenu.MenuItem onClick={() => removeRow(form, row.id)}>
                                  <MenuRowLabel icon={Trash2} label={t("delete")} tone="danger" />
                                </CustomMenu.MenuItem>
                              </CustomMenu>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {rows.length === 0 && !readOnly && (
                      <tr>
                        <td
                          colSpan={columns.length + 2}
                          className="px-2.5 py-3 text-center"
                        >
                          <button
                            type="button"
                            onClick={() => addRow(form)}
                            className="inline-flex items-center gap-1 text-12 text-accent-primary hover:text-accent-primary-hover"
                          >
                            <Plus className="size-3.5" />
                            {t("requirement_detail.subform.add_row")}
                          </button>
                          <p className="mt-1 text-11 text-placeholder">
                            {t("requirement_detail.subform.empty_add")}
                          </p>
                        </td>
                      </tr>
                    )}
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
