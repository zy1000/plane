import { useEffect, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { CalendarDays, ChevronDown, GripVertical } from "lucide-react";
import { Button } from "@plane/propel/button";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TIssueLayoutEditorState, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
import type {
  TIssueLayoutArea,
  TIssueLayoutAreaRef,
  TIssueLayoutContainer,
  TIssueLayoutGroup,
  TIssueLayoutWidth,
  TIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";
import {
  isLongLayoutField,
  LAYOUT_COLUMN_OPTIONS,
  LAYOUT_ROOT_AREA,
  layoutGridCells,
} from "@/utils/issue-type-layout";
import { LayoutSegment } from "./segment";

type TProps = {
  layout: TIssueTypeFieldLayout;
  fields: TTypeExtraField[];
  /** 传了就是设计器画布：可选中、拖动、改每行字段数；不传只读展示 */
  editor?: TIssueLayoutEditorState;
  /** 设计器里是否可操作（无权限或保存中为 false） */
  editable?: boolean;
  onRemove?: (node: TLayoutSelection) => void;
};

const COLUMN_OPTIONS = LAYOUT_COLUMN_OPTIONS.map((value) => ({ value, label: String(value) }));
const SELECTED_RING = "border-accent-strong shadow-[0_0_0_1px_var(--border-accent-strong)]";
const allowDrop = (event: DragEvent) => event.preventDefault();

/** 字段控件的示意：只表达类型和占位，不可操作 */
function FieldControlMock({ field, selected }: { field: TTypeExtraField; selected: boolean }) {
  if (field.field_type === "boolean")
    return (
      <span className="flex h-[34px] items-center">
        <span className="size-4 rounded border border-strong bg-surface-1" />
      </span>
    );
  const isPicker = field.field_type === "select" || field.field_type === "user";
  return (
    <span
      className={cn(
        "flex justify-between rounded-[7px] px-2.5 text-13 text-tertiary",
        selected ? "bg-surface-1" : "bg-layer-1",
        isLongLayoutField(field) ? "h-[58px] items-start pt-2" : "h-[34px] items-center"
      )}
    >
      {field.field_type === "date"
        ? "选择日期"
        : field.field_type === "user"
          ? "选择成员"
          : isPicker
            ? "请选择"
            : "请输入"}
      {isPicker && <ChevronDown className="size-3.5 shrink-0" />}
      {field.field_type === "date" && <CalendarDays className="size-3.5 shrink-0" />}
    </span>
  );
}

/**
 * 工作项字段布局的画布：标题、描述（固定）之下，依次是未分组字段、分组、页面页签和页内内容。
 * 「布局」页签用它做只读展示，布局设计器用它做可编辑画布，两处看到的排布一致。
 */
export function LayoutCanvas({ layout, fields, editor, editable = false, onRemove }: TProps) {
  const [viewPageId, setViewPageId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<TLayoutSelection | null>(null);
  const resizing = useRef(false);
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const activePage = editor ? editor.activePage : (layout.pages.find((page) => page.id === viewPageId) ?? layout.pages[0]);
  const isSelected = (kind: TLayoutSelection["kind"], id: string) =>
    editor?.selection?.kind === kind && editor.selection.id === id;
  // 新增的分组 / 页面可能落在可视区之外：选中项变化时把它滚进来
  const selectionKey = editor?.selection ? `${editor.selection.kind}:${editor.selection.id}` : null;
  useEffect(() => {
    if (!selectionKey) return;
    rootRef.current
      ?.querySelector(`[data-layout-node="${CSS.escape(selectionKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectionKey]);

  const startDrag = (event: DragEvent, node: TLayoutSelection) => {
    if (!editable || resizing.current) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    dragging.current = node;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  };
  /** 取走正在拖的节点；拖放只处理一次，不再冒泡给外层的落点 */
  const takeDrag = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const node = editable ? dragging.current : null;
    dragging.current = null;
    return node;
  };
  const dropOnArea = (event: DragEvent, ref: TIssueLayoutAreaRef, beforeId?: string) => {
    const node = takeDrag(event);
    if (node?.kind === "field") editor?.moveField(node.id, ref, beforeId);
  };
  const dropOnGroup = (event: DragEvent, group: TIssueLayoutGroup, pageId: string | null) => {
    const node = takeDrag(event);
    if (node?.kind === "field") editor?.moveField(node.id, { kind: "group", id: group.id });
    else if (node?.kind === "group") editor?.moveGroup(node.id, pageId, group.id);
  };
  const dropOnPage = (event: DragEvent, pageId: string) => {
    const node = takeDrag(event);
    if (node?.kind === "field") editor?.moveField(node.id, { kind: "page", id: pageId });
    else if (node?.kind === "group") editor?.moveGroup(node.id, pageId);
    else if (node?.kind === "page") editor?.movePage(node.id, pageId);
  };

  /** 拖选中字段的右边缘改占用列数：按指针离字段左边的距离折算成列 */
  const startResize = (event: ReactPointerEvent<HTMLElement>, fieldId: string, columns: number) => {
    const tile = event.currentTarget.closest<HTMLElement>("[data-layout-tile]");
    const grid = tile?.parentElement;
    if (!editor || !tile || !grid) return;
    event.preventDefault();
    event.stopPropagation();
    resizing.current = true;
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const track = (grid.clientWidth - gap * (columns - 1)) / columns;
    const left = tile.getBoundingClientRect().left;
    let last = 0;
    const move = (moveEvent: PointerEvent) => {
      const span = Math.max(1, Math.min(columns, Math.round((moveEvent.clientX - left + gap) / (track + gap))));
      if (span === last) return;
      last = span;
      editor.patchField(fieldId, { width: span >= columns ? "full" : (span as TIssueLayoutWidth) });
    };
    const stop = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const renderGrid = (area: TIssueLayoutArea, ref: TIssueLayoutAreaRef) => (
    <div
      className="grid gap-x-3.5 gap-y-3"
      style={{ gridTemplateColumns: `repeat(${area.columns}, minmax(0, 1fr))` }}
      onDragOver={editor ? allowDrop : undefined}
      onDrop={editor ? (event) => dropOnArea(event, ref) : undefined}
    >
      {layoutGridCells(area).map((cell) => {
        if (cell.kind === "slot")
          return editor ? (
            <div
              key={cell.key}
              className="min-h-[87px] rounded-[10px] border border-dashed border-strong"
              onDragOver={allowDrop}
              onDrop={(event) => dropOnArea(event, ref, cell.beforeId)}
            />
          ) : null;
        const field = fieldMap.get(cell.entry.field_id);
        if (!field) return null;
        const selected = isSelected("field", field.id);
        const widthTag =
          area.columns > 1 && cell.span >= area.columns ? "整行" : cell.span > 1 ? `${cell.span} 列` : null;
        const tileClass = cn(
          "relative flex min-w-0 flex-col gap-2 rounded-[10px] border bg-surface-1 px-3 pt-[11px] pb-3 text-left",
          selected ? cn(SELECTED_RING, "bg-accent-subtle") : "border-subtle",
          editor && !selected && "hover:border-strong"
        );
        const content = (
          <>
            <span className="flex min-h-5 items-center gap-2">
              {editor && (
                <GripVertical className={cn("size-3.5 shrink-0", selected ? "text-accent-primary" : "text-placeholder")} />
              )}
              <span
                className={cn("min-w-0 flex-1 truncate text-14", selected ? "font-medium text-primary" : "text-secondary")}
              >
                {field.name}
                {field.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
                {field.is_active === false && <span className="ml-1.5 text-11 text-tertiary">已停用</span>}
              </span>
              {editor && widthTag && (
                <span className={cn("shrink-0 text-12", selected ? "font-semibold text-accent-primary" : "text-tertiary")}>
                  {widthTag}
                </span>
              )}
            </span>
            <FieldControlMock field={field} selected={selected} />
          </>
        );
        const style = { gridColumn: `span ${cell.span} / span ${cell.span}` };
        if (!editor)
          return (
            <div key={field.id} className={tileClass} style={style}>
              {content}
            </div>
          );
        return (
          <button
            key={field.id}
            type="button"
            data-layout-tile
            data-layout-node={`field:${field.id}`}
            className={tileClass}
            style={style}
            draggable={editable}
            onDragStart={(event) => startDrag(event, { kind: "field", id: field.id })}
            onDragOver={allowDrop}
            onDrop={(event) => dropOnArea(event, ref, field.id)}
            onClick={() => editor.select({ kind: "field", id: field.id })}
          >
            {content}
            {selected && editable && area.columns > 1 && (
              <span
                title="拖动调整宽度"
                className="absolute top-1/2 -right-1.5 h-8 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-full bg-accent-primary shadow-[0_0_0_2px_var(--bg-surface-1)]"
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => startResize(event, field.id, area.columns)}
              />
            )}
          </button>
        );
      })}
      {editor && area.fields.length === 0 && (
        <div className="col-span-full rounded-[10px] border border-dashed border-strong py-6 text-center text-13 text-tertiary">
          将字段拖到此处
        </div>
      )}
    </div>
  );

  /** 容器里不在分组内的字段。设计器里带「每行字段」；容器只有分组、没有散字段时不占位 */
  const renderUngrouped = (container: TIssueLayoutContainer, ref: TIssueLayoutAreaRef, isOnlyContent: boolean) => {
    if (!container.fields.length && !(editor && isOnlyContent)) return null;
    return (
      <div className="flex flex-col gap-3.5">
        {editor && (
          <div className="flex h-[34px] items-center gap-2.5">
            <span className="text-14 font-semibold text-primary">字段</span>
            <span className="text-13 text-tertiary tabular-nums">{container.fields.length}</span>
            <span className="flex-1" />
            <span className="text-13 text-secondary">每行字段</span>
            <LayoutSegment
              ariaLabel="每行字段"
              value={container.columns}
              options={COLUMN_OPTIONS}
              disabled={!editable}
              onChange={(columns) => editor.setColumns(ref, columns)}
            />
          </div>
        )}
        {renderGrid(container, ref)}
      </div>
    );
  };

  const renderGroup = (group: TIssueLayoutGroup, pageId: string | null) => {
    const selected = isSelected("group", group.id);
    const node: TLayoutSelection = { kind: "group", id: group.id };
    return (
      <section
        key={group.id}
        data-layout-node={editor ? `group:${group.id}` : undefined}
        className={cn("rounded-xl border bg-surface-1", selected ? SELECTED_RING : "border-subtle")}
        onDragOver={editor ? allowDrop : undefined}
        onDrop={editor ? (event) => dropOnGroup(event, group, pageId) : undefined}
      >
        <div
          className={cn(
            "flex h-[54px] items-center gap-2.5 rounded-t-xl border-b border-subtle pr-3 pl-4",
            selected ? "bg-accent-subtle" : "bg-surface-2"
          )}
        >
          {editor && (
            <span
              draggable={editable}
              onDragStart={(event) => startDrag(event, node)}
              className={cn("shrink-0", editable && "cursor-grab")}
            >
              <GripVertical className={cn("size-3.5", selected ? "text-accent-primary" : "text-placeholder")} />
            </span>
          )}
          {editor ? (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left"
              onClick={() => editor.select(node)}
            >
              <span className="truncate text-14 font-semibold text-primary">{group.name || "未命名分组"}</span>
              <span className="text-13 text-tertiary tabular-nums">{group.fields.length}</span>
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="truncate text-14 font-semibold text-primary">{group.name}</span>
              <span className="text-13 text-tertiary tabular-nums">{group.fields.length}</span>
            </span>
          )}
          {editor && (
            <>
              <span className="text-13 text-secondary">每行字段</span>
              <LayoutSegment
                ariaLabel={`${group.name}每行字段`}
                value={group.columns}
                options={COLUMN_OPTIONS}
                disabled={!editable}
                onChange={(columns) => editor.setColumns({ kind: "group", id: group.id }, columns)}
              />
              <CustomMenu ellipsis placement="bottom-end" closeOnSelect disabled={!editable} ariaLabel={`${group.name}更多操作`}>
                <CustomMenu.MenuItem onClick={() => editor.reorder(node, -1)}>上移</CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => editor.reorder(node, 1)}>下移</CustomMenu.MenuItem>
                <CustomMenu.MenuItem className="text-danger-primary" onClick={() => onRemove?.(node)}>
                  移除分组
                </CustomMenu.MenuItem>
              </CustomMenu>
            </>
          )}
        </div>
        <div className="px-4 pt-3.5 pb-4">{renderGrid(group, { kind: "group", id: group.id })}</div>
      </section>
    );
  };

  const hasPages = layout.pages.length > 0;
  const rootUngrouped = renderUngrouped(layout, LAYOUT_ROOT_AREA, !hasPages && !layout.groups.length);
  return (
    <div ref={rootRef} className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-4">
        <div className="text-24 leading-[34px] font-semibold text-placeholder">工作项标题</div>
        <div className="flex flex-col gap-2">
          <div className="text-14 font-semibold text-tertiary">描述</div>
          <div className="rounded-[10px] border border-dashed border-strong bg-surface-2 px-4 py-3.5 text-14 text-tertiary">
            工作项描述
          </div>
        </div>
      </div>

      {rootUngrouped && <div className="border-t border-subtle pt-5">{rootUngrouped}</div>}
      {layout.groups.map((group) => renderGroup(group, null))}

      {hasPages && (
        <div className="flex flex-col gap-[18px]">
          <div role="tablist" aria-label="页面" className="flex h-11 items-center gap-7 border-b border-subtle">
            {layout.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                data-layout-node={editor ? `page:${page.id}` : undefined}
                aria-selected={page.id === activePage?.id}
                draggable={editable}
                onDragStart={(event) => startDrag(event, { kind: "page", id: page.id })}
                onDragOver={editor ? allowDrop : undefined}
                onDrop={editor ? (event) => dropOnPage(event, page.id) : undefined}
                onClick={() => (editor ? editor.select({ kind: "page", id: page.id }) : setViewPageId(page.id))}
                className={cn(
                  "-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-0.5 text-14",
                  page.id === activePage?.id
                    ? "border-accent-primary font-semibold text-primary"
                    : "border-transparent text-secondary hover:text-primary",
                  isSelected("page", page.id) && "text-accent-primary"
                )}
              >
                {page.name || "未命名页面"}
                <span className="text-12 font-medium text-tertiary tabular-nums">
                  {page.fields.length + page.groups.reduce((sum, group) => sum + group.fields.length, 0)}
                </span>
              </button>
            ))}
            {editor && (
              <button
                type="button"
                disabled={!editable}
                className="shrink-0 text-14 font-medium text-accent-primary"
                onClick={editor.addPage}
              >
                添加页面
              </button>
            )}
          </div>
          {activePage && (
            <>
              {renderUngrouped(activePage, { kind: "page", id: activePage.id }, !activePage.groups.length)}
              {activePage.groups.map((group) => renderGroup(group, activePage.id))}
            </>
          )}
          {editor && (
            <div className="flex">
              <Button variant="secondary" size="xl" className="px-3" disabled={!editable} onClick={editor.addGroup}>
                添加分组
              </Button>
            </div>
          )}
        </div>
      )}

      {editor && !hasPages && (
        <div className="flex gap-2.5">
          <Button variant="secondary" size="xl" className="px-3" disabled={!editable} onClick={editor.addGroup}>
            添加分组
          </Button>
          <Button variant="secondary" size="xl" className="px-3" disabled={!editable} onClick={editor.addPage}>
            添加页面
          </Button>
        </div>
      )}
    </div>
  );
}
