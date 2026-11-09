import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { GripVertical, Plus, Settings2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { FIELD_TYPE_ICON } from "@/components/issues/extra-fields";
import { useIssueTypeLayoutEditor } from "@/hooks/use-issue-type-layout-editor";
import type { TLayoutSave, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import { layoutFieldSpan } from "@/utils/issue-type-layout";
import { LayoutInspector, layoutInputClass } from "./inspector";
import { LayoutPreview } from "./preview";
import { LayoutStructure } from "./structure";

type TProps = {
  issueType: TIssueType;
  fields: TTypeExtraField[];
  canEdit: boolean;
  onSave: TLayoutSave;
  onDirtyChange?: (dirty: boolean) => void;
};

export function IssueTypeLayoutEditor({ issueType, fields, canEdit, onSave, onDirtyChange }: TProps) {
  const state = useIssueTypeLayoutEditor(issueType, fields, onSave);
  useEffect(() => {
    onDirtyChange?.(state.isDirty);
    return () => onDirtyChange?.(false);
  }, [state.isDirty, onDirtyChange]);
  const [preview, setPreview] = useState(false);
  const [removal, setRemoval] = useState<TLayoutSelection | null>(null);
  const [destination, setDestination] = useState("");
  const [resetting, setResetting] = useState(false);
  const dragging = useRef<TLayoutSelection | null>(null);
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const editable = canEdit && !state.isSaving;
  const onDrag = (event: DragEvent, node: TLayoutSelection) => {
    if (!editable) return;
    dragging.current = node;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  };
  const onDrop = (event: DragEvent, target: TLayoutSelection) => {
    event.preventDefault();
    event.stopPropagation();
    if (editable && dragging.current) state.moveNode(dragging.current, target);
    dragging.current = null;
  };
  const removalTargets = state.groups.filter(({ page, group }) =>
    removal?.kind === "page" ? page.id !== removal.id : group.id !== removal?.id
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-16 font-medium">字段布局</h3>
          <p className="mt-1 text-12 text-secondary">
            页面作为顶部页签，每页内按顺序展示分组，可设置列数、字段宽度与折叠。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPreview(true)}>
          预览
        </Button>
      </div>
      <fieldset
        disabled={!editable}
        className="min-w-0 space-y-4 disabled:opacity-80"
        onDragEnd={() => {
          dragging.current = null;
        }}
      >
        <legend className="sr-only">工作项类型布局配置</legend>
        <div className="grid min-w-0 grid-cols-1 rounded-lg border border-subtle xl:grid-cols-[minmax(170px,0.8fr)_minmax(0,2.4fr)_minmax(210px,1fr)]">
          <LayoutStructure state={state} canEdit={editable} onDrag={onDrag} onDrop={onDrop} />
          <div className="@container/layout min-w-0 space-y-5 p-4">
            <label className="block text-12 text-secondary">
              页面名称
              <input
                maxLength={100}
                className={layoutInputClass}
                value={state.selectedPage.name}
                onChange={(event) => state.patchPage(state.selectedPage.id, { name: event.target.value })}
              />
            </label>
            <nav aria-label="编辑页面" className="flex gap-4 overflow-x-auto border-b border-subtle text-13">
              {state.draft.pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => state.setSelection({ kind: "page", id: page.id })}
                  className={cn(
                    "shrink-0 border-b-2 px-1 pb-2",
                    state.selectedPage.id === page.id
                      ? "border-accent-primary text-accent-primary"
                      : "border-transparent text-secondary"
                  )}
                >
                  {page.name || "未命名页面"}
                </button>
              ))}
            </nav>
            {state.selectedPage.groups.map((group) => (
              <section
                key={group.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, { kind: "group", id: group.id })}
                className={cn(
                  "rounded-md border border-subtle",
                  state.selection.kind === "group" && state.selection.id === group.id && "border-accent-primary"
                )}
              >
                <div className="flex items-center gap-2 rounded-t-md bg-layer-1 px-3 py-2">
                  <span draggable={editable} onDragStart={(event) => onDrag(event, { kind: "group", id: group.id })}>
                    <GripVertical className="size-3.5 shrink-0 text-tertiary" />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-14 font-medium"
                    onClick={() => state.setSelection({ kind: "group", id: group.id })}
                  >
                    {group.name || "未命名分组"}
                    <span className="ml-2 text-12 text-tertiary">{group.fields.length}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`配置${group.name}`}
                    onClick={() => state.setSelection({ kind: "group", id: group.id })}
                  >
                    <Settings2 className="size-3.5 text-secondary" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-3 pt-3 text-12 text-secondary">
                  <label className="flex items-center gap-2">
                    每行字段
                    <select
                      value={group.columns}
                      onChange={(event) =>
                        state.patchGroup(group.id, { columns: Number(event.target.value) as 1 | 2 | 3 })
                      }
                      className="rounded border border-subtle bg-surface-1 px-2 py-1"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={group.collapsible}
                      onChange={(event) => state.patchGroup(group.id, { collapsible: event.target.checked })}
                    />
                    可折叠
                  </label>
                  <select
                    aria-label={`${group.name}默认状态`}
                    disabled={!group.collapsible}
                    value={String(group.default_collapsed)}
                    onChange={(event) =>
                      state.patchGroup(group.id, { default_collapsed: event.target.value === "true" })
                    }
                    className="rounded border border-subtle bg-surface-1 px-2 py-1"
                  >
                    <option value="false">默认展开</option>
                    <option value="true">默认收起</option>
                  </select>
                </div>
                <div className="grid grid-cols-6 gap-2 p-3">
                  {group.fields.map((entry) => {
                    const field = fieldMap.get(entry.field_id);
                    if (!field) return null;
                    const Icon = FIELD_TYPE_ICON[field.field_type];
                    return (
                      <button
                        key={field.id}
                        type="button"
                        draggable={editable}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          onDrag(event, { kind: "field", id: field.id });
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => onDrop(event, { kind: "field", id: field.id })}
                        onClick={() => state.setSelection({ kind: "field", id: field.id })}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded border px-2 py-3 text-left text-13",
                          layoutFieldSpan(entry.width, group.columns, false),
                          state.selection.kind === "field" && state.selection.id === field.id
                            ? "border-accent-primary bg-accent-subtle"
                            : "border-subtle hover:bg-layer-1"
                        )}
                      >
                        <GripVertical className="size-3 shrink-0 text-tertiary" />
                        <Icon className="size-3.5 shrink-0 text-secondary" />
                        <span className="min-w-0 flex-1 break-words">
                          {field.name}
                          {field.is_active === false && <span className="ml-1 text-11 text-tertiary">已停用</span>}
                        </span>
                        {entry.width !== "auto" && (
                          <span className="shrink-0 text-11 text-tertiary">
                            {entry.width === "full" ? "整行" : entry.width === "half" ? "1/2" : "1/3"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {group.fields.length === 0 && (
                  <div className="px-3 pb-4 text-12 text-tertiary">拖入字段，或在左侧未分配区点击添加。</div>
                )}
              </section>
            ))}
            <button
              type="button"
              onClick={() => state.addGroup(state.selectedPage.id)}
              className="flex items-center gap-1 text-13 text-accent-primary"
            >
              <Plus className="size-4" />
              添加分组
            </button>
            <p className="text-11 text-tertiary">窄屏按字段顺序自动减少列数。也可以通过右侧设置移动字段，无需拖动。</p>
          </div>
          <LayoutInspector
            state={state}
            canEdit={editable}
            onDelete={(node) => {
              setRemoval(node);
              setDestination("");
            }}
          />
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-13 text-danger-primary">
          {state.error}
        </p>
      )}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1 py-3 text-12">
        <span className="text-secondary">
          {state.isDirty ? "有未保存的修改" : "布局已同步"} · {fields.length} 个字段 · {state.groups.length} 个分组
        </span>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={state.isSaving}
              onClick={() => setResetting(true)}
              className="text-accent-primary"
            >
              恢复默认
            </button>
            <Button variant="secondary" size="sm" disabled={!state.isDirty || state.isSaving} onClick={state.cancel}>
              取消修改
            </Button>
            <Button size="sm" disabled={state.isSaving || !state.isDirty} onClick={() => void state.save()}>
              {state.isSaving ? "保存中…" : "保存布局"}
            </Button>
          </div>
        )}
      </div>
      {preview && <LayoutPreview layout={state.draft} fields={fields} onClose={() => setPreview(false)} />}
      <AlertModalCore
        isOpen={Boolean(removal)}
        isSubmitting={false}
        handleClose={() => setRemoval(null)}
        handleSubmit={() => {
          if (removal) state.removeNode(removal, destination);
          setRemoval(null);
        }}
        variant="danger"
        title={`移除${removal?.kind === "page" ? "页面" : "分组"}`}
        primaryButtonText={{ default: "移动字段并移除", loading: "移除中" }}
        secondaryButtonText="取消"
        content={
          <span className="block space-y-3">
            <span className="block">选择其中字段的去向。字段定义与已有数据会保留。</span>
            <label className="block">
              目标分组
              <select
                className={layoutInputClass}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                <option value="">新建默认分组</option>
                {removalTargets.map(({ page, group }) => (
                  <option key={group.id} value={group.id}>
                    {page.name} / {group.name}
                  </option>
                ))}
              </select>
            </label>
          </span>
        }
      />
      <AlertModalCore
        isOpen={resetting}
        isSubmitting={false}
        handleClose={() => setResetting(false)}
        handleSubmit={() => {
          state.reset();
          setResetting(false);
        }}
        variant="danger"
        title="恢复默认布局"
        primaryButtonText={{ default: "恢复默认", loading: "恢复中" }}
        secondaryButtonText="取消"
        content="将全部字段按原顺序放回「基本信息」页面的默认分组。保存后生效。"
      />
    </div>
  );
}
