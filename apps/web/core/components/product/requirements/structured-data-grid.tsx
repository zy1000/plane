import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Database, Loader2, Plus, Table2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { useRequirementStructure } from "@/hooks/store/use-requirement-structure";
import type { TStructuredField, TStructuredRow } from "@/services/requirement-structure.service";
import { fieldValue, seedDraft, StructuredFieldCell } from "./structured-field-cell";

type TStructure = ReturnType<typeof useRequirementStructure>;
type RowStatus = "saving" | "saved" | "error";
type GroupSlot =
  | { type: "child"; row: TStructuredRow }
  | { type: "add" }
  | { type: "more" };

const groupKey = (rowKey: string, tableKey: string) => `${rowKey}::${tableKey}`;

const HEAD_CELL = "border-b border-r border-subtle bg-layer-1 px-2.5 py-2.5 text-left align-middle text-12 font-medium text-secondary";
const BODY_CELL = "border-b border-r border-subtle bg-surface-1 align-middle";
const LEAD_CELL = "sticky left-0 z-[1] w-14 border-b border-r border-subtle bg-surface-1 text-center align-middle";
const ROOT_ACTION_CELL = "sticky right-0 z-[1] w-11 border-b border-l border-subtle bg-surface-1 align-middle";
const CHILD_ACTION_CELL = "w-11 border-b border-r border-subtle bg-surface-1 align-middle";

function FieldHeadLabel(props: { field: TStructuredField }) {
  const { field } = props;
  const unit = field.config.unit ? String(field.config.unit) : "";
  return (
    <span className="flex items-center gap-1">
      <span className="truncate">{field.name}</span>
      {unit && <span className="font-normal text-tertiary">({unit})</span>}
      {field.is_required && <span className="text-danger-primary">*</span>}
    </span>
  );
}

function RowStatusIndicator(props: { status?: RowStatus }) {
  const { status } = props;
  if (status === "saving") return <Loader2 className="size-3.5 animate-spin text-tertiary" aria-label="保存中" />;
  if (status === "saved") return <Check className="size-3.5 text-success-primary" aria-label="已保存" />;
  if (status === "error")
    return <AlertCircle className="size-3.5 text-danger-primary" aria-label="保存失败，请重新编辑该行" />;
  return null;
}

/** 悬浮出现的行操作菜单：上移 / 下移 / 在上方插入 / 删除 */
function RowMenu(props: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsert: () => void;
  onDelete: () => void;
  insertLabel: string;
  deleteLabel: string;
}) {
  const { deleteLabel, insertLabel, onDelete, onInsert, onMoveDown, onMoveUp } = props;
  return (
    <CustomMenu
      ellipsis
      placement="bottom-end"
      closeOnSelect
      buttonClassName="grid size-6 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
    >
      <CustomMenu.MenuItem onClick={onMoveUp}>上移</CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onMoveDown}>下移</CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onInsert}>{insertLabel}</CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onDelete}>
        <span className="text-danger-primary">{deleteLabel}</span>
      </CustomMenu.MenuItem>
    </CustomMenu>
  );
}

export function StructuredDataGrid(props: { editable: boolean; fields: TStructuredField[]; structure: TStructure }) {
  const { editable, fields, structure } = props;
  const { createRow, deleteRow, fetchRows, isMutating, nextCursor, reorderRow, rows, updateRow } = structure;

  const rootValueFields = useMemo(
    () => fields.filter((field) => !field.parent_key && field.field_type !== "table"),
    [fields]
  );
  const tableFields = useMemo(
    () => fields.filter((field) => !field.parent_key && field.field_type === "table"),
    [fields]
  );
  const childFieldsByTable = useMemo(() => {
    const map: Record<string, TStructuredField[]> = {};
    for (const table of tableFields) map[table.key] = fields.filter((field) => field.parent_key === table.key);
    return map;
  }, [fields, tableFields]);

  const [childrenMap, setChildrenMap] = useState<Record<string, TStructuredRow[]>>({});
  const [childCursors, setChildCursors] = useState<Record<string, string | null>>({});
  const [statusMap, setStatusMap] = useState<Record<string, RowStatus>>({});

  const loadedRef = useRef<Set<string>>(new Set());
  const draftsRef = useRef<Record<string, Record<string, ReturnType<typeof fieldValue>>>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const savedTimersRef = useRef<Record<string, number>>({});

  const showError = (error: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: (error as { error?: string })?.error ?? "请刷新后重试。" });

  const setStatus = (key: string, status?: RowStatus) =>
    setStatusMap((current) => {
      if (!status) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: status };
    });

  const markSaved = (key: string) => {
    setStatus(key, "saved");
    window.clearTimeout(savedTimersRef.current[key]);
    savedTimersRef.current[key] = window.setTimeout(() => setStatus(key, undefined), 1600);
  };

  useEffect(() => {
    const timers = savedTimersRef.current;
    return () => Object.values(timers).forEach((timer) => window.clearTimeout(timer));
  }, []);

  // 拉取每个（主记录 × 子表）分组的子行，loadedRef 去重，避免重复请求
  useEffect(() => {
    if (tableFields.length === 0) return;
    for (const root of rows) {
      for (const table of tableFields) {
        const gk = groupKey(root.key, table.key);
        if (loadedRef.current.has(gk)) continue;
        loadedRef.current.add(gk);
        void fetchRows({ parent_row_key: root.key, table_field_key: table.key })
          .then((response) => {
            setChildrenMap((current) => ({ ...current, [gk]: response.data }));
            setChildCursors((current) => ({ ...current, [gk]: response.next_cursor }));
          })
          .catch(() => setChildrenMap((current) => ({ ...current, [gk]: [] })));
      }
    }
  }, [rows, tableFields, fetchRows]);

  const handleCellChange = (
    rowKey: string,
    rowFields: TStructuredField[],
    row: TStructuredRow,
    fieldKey: string,
    value: ReturnType<typeof fieldValue>
  ) => {
    const base = draftsRef.current[rowKey] ?? seedDraft(rowFields, row);
    base[fieldKey] = value;
    draftsRef.current[rowKey] = base;
    dirtyRef.current.add(rowKey);
  };

  const flushRow = (rowKey: string, isChild: boolean, gk?: string) => {
    if (!dirtyRef.current.has(rowKey)) return;
    const values = draftsRef.current[rowKey];
    if (!values) return;
    dirtyRef.current.delete(rowKey);
    setStatus(rowKey, "saving");
    queueRef.current = queueRef.current
      .then(async () => {
        try {
          const updated = await updateRow(rowKey, values);
          if (isChild && gk)
            setChildrenMap((current) => ({
              ...current,
              [gk]: (current[gk] ?? []).map((item) => (item.key === rowKey ? updated : item)),
            }));
          delete draftsRef.current[rowKey];
          markSaved(rowKey);
        } catch (error) {
          dirtyRef.current.add(rowKey);
          setStatus(rowKey, "error");
          showError(error);
        }
      })
      .catch(() => undefined);
  };

  const addRoot = (beforeKey?: string) =>
    void createRow(beforeKey ? { before_row_key: beforeKey } : {}).catch(showError);

  const deleteRoot = (rowKey: string) => void deleteRow(rowKey).catch(showError);

  const moveRoot = (rowKey: string, direction: -1 | 1) => {
    const index = rows.findIndex((row) => row.key === rowKey);
    const target = rows[index + direction];
    if (!target) return;
    void reorderRow(
      rowKey,
      direction < 0 ? { before_row_key: target.key } : { after_row_key: target.key }
    ).catch(showError);
  };

  const addChild = async (root: TStructuredRow, table: TStructuredField, beforeKey?: string) => {
    const gk = groupKey(root.key, table.key);
    try {
      const created = await createRow({
        parent_row_key: root.key,
        table_field_key: table.key,
        ...(beforeKey ? { before_row_key: beforeKey } : {}),
      });
      setChildrenMap((current) => {
        const list = current[gk] ? [...current[gk]] : [];
        const insertAt = beforeKey ? list.findIndex((item) => item.key === beforeKey) : -1;
        if (insertAt >= 0) list.splice(insertAt, 0, created);
        else list.push(created);
        return { ...current, [gk]: list };
      });
    } catch (error) {
      showError(error);
    }
  };

  const deleteChild = async (root: TStructuredRow, table: TStructuredField, rowKey: string) => {
    const gk = groupKey(root.key, table.key);
    try {
      await deleteRow(rowKey, true);
      setChildrenMap((current) => ({ ...current, [gk]: (current[gk] ?? []).filter((item) => item.key !== rowKey) }));
    } catch (error) {
      showError(error);
    }
  };

  const moveChild = async (root: TStructuredRow, table: TStructuredField, rowKey: string, direction: -1 | 1) => {
    const gk = groupKey(root.key, table.key);
    const list = childrenMap[gk] ?? [];
    const index = list.findIndex((item) => item.key === rowKey);
    const target = list[index + direction];
    if (!target) return;
    try {
      await reorderRow(
        rowKey,
        direction < 0 ? { before_row_key: target.key } : { after_row_key: target.key },
        true
      );
      const response = await fetchRows({ parent_row_key: root.key, table_field_key: table.key });
      setChildrenMap((current) => ({ ...current, [gk]: response.data }));
      setChildCursors((current) => ({ ...current, [gk]: response.next_cursor }));
    } catch (error) {
      showError(error);
    }
  };

  const loadMoreChildren = async (root: TStructuredRow, table: TStructuredField, gk: string) => {
    const cursor = childCursors[gk];
    if (!cursor) return;
    try {
      const response = await fetchRows({ parent_row_key: root.key, table_field_key: table.key, cursor });
      setChildrenMap((current) => ({ ...current, [gk]: [...(current[gk] ?? []), ...response.data] }));
      setChildCursors((current) => ({ ...current, [gk]: response.next_cursor }));
    } catch (error) {
      showError(error);
    }
  };

  const groupWidth = (table: TStructuredField) => (childFieldsByTable[table.key]?.length ?? 0) + (editable ? 1 : 0);
  const totalCols =
    1 +
    rootValueFields.length +
    tableFields.reduce((sum, table) => sum + groupWidth(table), 0) +
    (editable ? 1 : 0);

  if (rows.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center p-6 text-center">
        <div>
          <Database className="mx-auto size-7 text-placeholder" />
          <p className="mt-3 text-14 font-medium text-primary">还没有数据记录</p>
          <p className="mt-1 text-12 text-secondary">新增记录时会立即分配自动 ID。</p>
          {editable && (
            <Button type="button" variant="primary" size="lg" className="mt-4" prependIcon={<Plus className="size-4" />} onClick={() => addRoot()}>
              新增第一条记录
            </Button>
          )}
        </div>
      </div>
    );
  }

  const renderGroupCells = (root: TStructuredRow, table: TStructuredField, slots: GroupSlot[], cursor: string | null, r: number): ReactNode => {
    const gk = groupKey(root.key, table.key);
    const childFields = childFieldsByTable[table.key] ?? [];
    const slot = slots[r];

    if (!slot)
      return (
        <>
          <td colSpan={childFields.length} className={BODY_CELL} />
          {editable && <td className={CHILD_ACTION_CELL} />}
        </>
      );

    if (slot.type === "child")
      return (
        <>
          {childFields.map((childField) => (
            <td key={childField.key} className={cn(BODY_CELL, "min-w-40 p-0")}>
              <StructuredFieldCell
                field={childField}
                value={fieldValue(childField, slot.row)}
                editable={editable}
                onChange={(value) => handleCellChange(slot.row.key, childFields, slot.row, childField.key, value)}
                onCommit={() => flushRow(slot.row.key, true, gk)}
              />
            </td>
          ))}
          {editable && (
            <td className={CHILD_ACTION_CELL}>
              <div className="flex items-center justify-center gap-0.5">
                <RowStatusIndicator status={statusMap[slot.row.key]} />
                <RowMenu
                  insertLabel="在上方插入行"
                  deleteLabel="删除行"
                  onMoveUp={() => void moveChild(root, table, slot.row.key, -1)}
                  onMoveDown={() => void moveChild(root, table, slot.row.key, 1)}
                  onInsert={() => void addChild(root, table, slot.row.key)}
                  onDelete={() => void deleteChild(root, table, slot.row.key)}
                />
              </div>
            </td>
          )}
        </>
      );

    if (slot.type === "add")
      return (
        <>
          <td colSpan={childFields.length} className={cn(BODY_CELL, "p-0")}>
            <div className="flex items-center gap-3 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => void addChild(root, table)}
                className="inline-flex items-center gap-1 text-12 font-medium text-tertiary transition-colors hover:text-accent-primary"
              >
                <Plus className="size-3.5" />
                添加行
              </button>
              {cursor && (
                <button
                  type="button"
                  onClick={() => void loadMoreChildren(root, table, gk)}
                  className="text-12 text-tertiary transition-colors hover:text-primary"
                >
                  加载更多
                </button>
              )}
            </div>
          </td>
          <td className={CHILD_ACTION_CELL} />
        </>
      );

    // read-only 下的"加载更多子行"
    return (
      <td colSpan={childFields.length} className={cn(BODY_CELL, "p-0")}>
        <button
          type="button"
          onClick={() => void loadMoreChildren(root, table, gk)}
          className="px-2.5 py-1.5 text-12 text-tertiary transition-colors hover:text-primary"
        >
          加载更多子行
        </button>
      </td>
    );
  };

  return (
    <table className="w-full min-w-max border-separate border-spacing-0 text-left">
      <thead className="text-11">
        <tr>
          <th rowSpan={tableFields.length > 0 ? 2 : 1} className={cn(HEAD_CELL, "sticky top-0 left-0 z-[4] w-14 text-center")}>
            序号
          </th>
          {rootValueFields.map((field) => (
            <th key={field.key} rowSpan={tableFields.length > 0 ? 2 : 1} className={cn(HEAD_CELL, "sticky top-0 z-[3] min-w-40")}>
              <FieldHeadLabel field={field} />
            </th>
          ))}
          {tableFields.map((table) => (
            <th key={table.key} colSpan={groupWidth(table)} className={cn(HEAD_CELL, "sticky top-0 z-[3] h-9 text-center")}>
              <span className="flex items-center justify-center gap-1.5 text-primary">
                <Table2 className="size-3.5 text-accent-primary" />
                {table.name}
              </span>
            </th>
          ))}
          {editable && (
            <th rowSpan={tableFields.length > 0 ? 2 : 1} className={cn(HEAD_CELL, "sticky top-0 right-0 z-[4] w-11 border-l text-center")}>
              操作
            </th>
          )}
        </tr>
        {tableFields.length > 0 && (
          <tr>
            {tableFields.flatMap((table) => {
              const cells = (childFieldsByTable[table.key] ?? []).map((childField) => (
                <th key={childField.key} className={cn(HEAD_CELL, "sticky top-9 z-[2] min-w-40")}>
                  <FieldHeadLabel field={childField} />
                </th>
              ));
              if (editable)
                cells.push(<th key={`${table.key}-action`} className={cn(HEAD_CELL, "sticky top-9 z-[2] w-11")} />);
              return cells;
            })}
          </tr>
        )}
      </thead>
      <tbody>
        {rows.flatMap((root, rootIndex) => {
          const groups = tableFields.map((table) => {
            const gk = groupKey(root.key, table.key);
            const children = childrenMap[gk] ?? [];
            const cursor = childCursors[gk] ?? null;
            const slots: GroupSlot[] = children.map((child) => ({ type: "child", row: child }));
            if (editable) slots.push({ type: "add" });
            else if (cursor) slots.push({ type: "more" });
            return { table, cursor, slots };
          });
          const blockRows = Math.max(1, ...groups.map((group) => group.slots.length));

          return Array.from({ length: blockRows }).map((_unused, r) => (
            <tr key={`${root.key}-${r}`}>
              {r === 0 && (
                <>
                  <td rowSpan={blockRows} className={LEAD_CELL}>
                    <span className="text-12 tabular-nums text-tertiary">{rootIndex + 1}</span>
                  </td>
                  {rootValueFields.map((field) => (
                    <td key={field.key} rowSpan={blockRows} className={cn(BODY_CELL, "min-w-40 p-0")}>
                      <StructuredFieldCell
                        field={field}
                        value={fieldValue(field, root)}
                        editable={editable}
                        onChange={(value) => handleCellChange(root.key, rootValueFields, root, field.key, value)}
                        onCommit={() => flushRow(root.key, false)}
                      />
                    </td>
                  ))}
                </>
              )}
              {groups.map((group) => (
                <GroupCells key={group.table.key}>
                  {renderGroupCells(root, group.table, group.slots, group.cursor, r)}
                </GroupCells>
              ))}
              {r === 0 && editable && (
                <td rowSpan={blockRows} className={ROOT_ACTION_CELL}>
                  <div className="flex items-center justify-center gap-0.5">
                    <RowStatusIndicator status={statusMap[root.key]} />
                    <RowMenu
                      insertLabel="在上方插入记录"
                      deleteLabel="删除记录"
                      onMoveUp={() => moveRoot(root.key, -1)}
                      onMoveDown={() => moveRoot(root.key, 1)}
                      onInsert={() => addRoot(root.key)}
                      onDelete={() => deleteRoot(root.key)}
                    />
                  </div>
                </td>
              )}
            </tr>
          ));
        })}
        {editable && (
          <tr>
            <td colSpan={totalCols} className="border-b border-subtle bg-surface-1 p-0">
              <button
                type="button"
                disabled={isMutating}
                onClick={() => addRoot()}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-13 font-medium text-tertiary transition-colors hover:bg-layer-1 hover:text-accent-primary disabled:opacity-60"
              >
                <Plus className="size-4" />
                新增主记录
              </button>
            </td>
          </tr>
        )}
        {nextCursor && (
          <tr>
            <td colSpan={totalCols} className="border-b border-subtle bg-surface-1 p-0 text-center">
              <button
                type="button"
                onClick={() => void fetchRows({ cursor: nextCursor, append: true }).catch(showError)}
                className="px-3 py-2.5 text-12 text-tertiary transition-colors hover:text-primary"
              >
                加载更多主记录
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** 透传 fragment，仅用于给分组单元格挂 key（避免多余 DOM 包裹） */
function GroupCells(props: { children: ReactNode }) {
  return <>{props.children}</>;
}
