import { ArrowDown, ArrowUp, FileText, GripVertical, Layers, Plus } from "lucide-react";
import { cn } from "@plane/utils";
import type { DragEvent } from "react";
import type { TIssueLayoutEditorState, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";

export type TLayoutDragProps = {
  canEdit: boolean;
  onDrag: (event: DragEvent, node: TLayoutSelection) => void;
  onDrop: (event: DragEvent, node: TLayoutSelection) => void;
};

export function LayoutStructure({
  state,
  canEdit,
  onDrag,
  onDrop,
}: { state: TIssueLayoutEditorState } & TLayoutDragProps) {
  const { draft, selection, setSelection, unassigned, selectedGroup } = state;
  const moveButtons = (node: TLayoutSelection) =>
    canEdit && (
      <span className="flex shrink-0">
        <button
          type="button"
          title="上移"
          aria-label="上移"
          className="rounded p-1 hover:bg-layer-1-hover"
          onClick={() => state.reorder(node, -1)}
        >
          <ArrowUp className="size-3" />
        </button>
        <button
          type="button"
          title="下移"
          aria-label="下移"
          className="rounded p-1 hover:bg-layer-1-hover"
          onClick={() => state.reorder(node, 1)}
        >
          <ArrowDown className="size-3" />
        </button>
      </span>
    );
  return (
    <aside className="min-w-0 rounded-tl-lg border-b border-subtle bg-layer-1/50 p-3 xl:sticky xl:top-4 xl:max-h-[80vh] xl:self-start xl:overflow-y-auto xl:border-r xl:border-b-0">
      <h3 className="mb-3 flex items-center justify-between px-1 text-14 font-medium">
        页面结构<span className="text-12 text-tertiary">{draft.pages.length}</span>
      </h3>
      <div className="mb-1 flex items-center gap-2 px-2 py-2 text-13 text-secondary">
        <FileText className="size-3.5" />
        标题与描述<span className="ml-auto text-11 text-tertiary">页签上方</span>
      </div>
      <div className="space-y-2">
        {draft.pages.map((page) => (
          <div key={page.id}>
            <div
              draggable={canEdit}
              onDragStart={(event) => onDrag(event, { kind: "page", id: page.id })}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, { kind: "page", id: page.id })}
              className={cn(
                "flex items-center gap-1 rounded-md px-1 py-1",
                state.selectedPage.id === page.id && "bg-accent-subtle text-accent-primary"
              )}
            >
              <GripVertical className="size-3.5 shrink-0 text-tertiary" />
              <button
                type="button"
                className="min-w-0 flex-1 py-1 text-left text-13"
                onClick={() => setSelection({ kind: "page", id: page.id })}
              >
                <span className="break-words">{page.name || "未命名页面"}</span>
                <span className="ml-1 text-11 text-tertiary">
                  {page.groups.reduce((n, group) => n + group.fields.length, 0)}
                </span>
              </button>
              {selection.kind === "page" && selection.id === page.id && moveButtons({ kind: "page", id: page.id })}
            </div>
            <div className="ml-3 space-y-0.5">
              {page.groups.map((group) => (
                <div
                  key={group.id}
                  draggable={canEdit}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    onDrag(event, { kind: "group", id: group.id });
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDrop(event, { kind: "group", id: group.id })}
                  className={cn(
                    "flex items-center gap-1 rounded px-1",
                    selection.kind === "group" && selection.id === group.id && "bg-layer-1-hover"
                  )}
                >
                  <Layers className="size-3 shrink-0 text-tertiary" />
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: "group", id: group.id })}
                    className="min-w-0 flex-1 py-2 text-left text-12"
                  >
                    <span className="break-words">{group.name || "未命名分组"}</span>
                    <span className="ml-1 text-tertiary">{group.fields.length}</span>
                  </button>
                  {selection.kind === "group" &&
                    selection.id === group.id &&
                    moveButtons({ kind: "group", id: group.id })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-3 text-12 text-accent-primary">
          <button type="button" className="flex items-center gap-1" onClick={state.addPage}>
            <Plus className="size-3.5" />
            添加页面
          </button>
          <button
            type="button"
            className="flex items-center gap-1"
            onClick={() => state.addGroup(state.selectedPage.id)}
          >
            <Plus className="size-3.5" />
            添加分组
          </button>
        </div>
      )}
      <div className="mt-5 border-t border-subtle pt-4">
        <h4 className="text-13 font-medium">
          未分配字段 <span className="text-tertiary">{unassigned.length}</span>
        </h4>
        <p className="mt-1 text-11 text-tertiary">
          {unassigned.length ? "拖入分组，或点击添加到当前分组。" : "全部字段已放置"}
        </p>
        {unassigned.map((field) => (
          <button
            key={field.id}
            type="button"
            disabled={!canEdit || !selectedGroup}
            draggable={canEdit}
            onDragStart={(event) => onDrag(event, { kind: "field", id: field.id })}
            onClick={() => selectedGroup && state.moveField(field.id, selectedGroup.id)}
            className="mt-2 flex w-full items-center gap-1 rounded border border-subtle bg-surface-1 p-2 text-left text-12 disabled:opacity-50"
          >
            <GripVertical className="size-3" />
            {field.name}
            <Plus className="ml-auto size-3" />
          </button>
        ))}
      </div>
    </aside>
  );
}
