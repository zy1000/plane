import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { v4 as newId } from "uuid";
import type { TIssueLayoutEditorState, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";
import type { TIssueLayoutContext, TIssueLayoutWidth } from "@/services/project/issue-type-layout.types";

export const layoutInputClass =
  "mt-1.5 w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-13 text-primary focus:border-accent-primary focus:outline-none disabled:opacity-60";

export function LayoutInspector({
  state,
  canEdit,
  onDelete,
}: {
  state: TIssueLayoutEditorState;
  canEdit: boolean;
  onDelete: (node: TLayoutSelection) => void;
}) {
  const {
    selection,
    selectedField: field,
    selectedPlacement: placement,
    selectedPage: page,
    selectedGroup: group,
  } = state;
  return (
    <aside className="min-w-0 border-t border-subtle p-4 xl:sticky xl:top-4 xl:max-h-[80vh] xl:self-start xl:overflow-y-auto xl:border-t-0 xl:border-l">
      <h3 className="mb-5 text-14 font-medium">
        {selection.kind === "field" ? "字段设置" : selection.kind === "group" ? "分组设置" : "页面设置"}
      </h3>
      <div className="space-y-5 text-13 text-secondary">
        {selection.kind === "page" && (
          <>
            <label className="block">
              页面名称
              <input
                maxLength={100}
                className={layoutInputClass}
                value={page.name}
                onChange={(event) => state.patchPage(page.id, { name: event.target.value })}
              />
            </label>
            <p className="text-12 text-tertiary">每个页面对应一个顶部页签，页内分组按顺序连续展示，可分别折叠。</p>
          </>
        )}
        {selection.kind === "group" && group && (
          <>
            <label className="block">
              分组名称
              <input
                maxLength={100}
                className={layoutInputClass}
                value={group.name}
                onChange={(event) => state.patchGroup(group.id, { name: event.target.value })}
              />
            </label>
            <label className="block">
              所属页面
              <select
                className={layoutInputClass}
                value={page.id}
                onChange={(event) =>
                  state.moveNode({ kind: "group", id: group.id }, { kind: "page", id: event.target.value })
                }
              >
                {state.draft.pages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              每行字段
              <select
                className={layoutInputClass}
                value={group.columns}
                onChange={(event) => state.patchGroup(group.id, { columns: Number(event.target.value) as 1 | 2 | 3 })}
              >
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {value} 列
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={group.collapsible}
                onChange={(event) => state.patchGroup(group.id, { collapsible: event.target.checked })}
              />
              允许折叠
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={group.default_collapsed}
                disabled={!group.collapsible}
                onChange={(event) => state.patchGroup(group.id, { default_collapsed: event.target.checked })}
              />
              默认收起
            </label>
          </>
        )}
        {selection.kind === "field" && field && placement && (
          <>
            <div>
              <span className="block text-14 font-medium text-primary">{field.name}</span>
              {field.is_required && <span className="text-11 text-danger-primary">必填字段</span>}
            </div>
            <label className="block">
              所属页面
              <select
                className={layoutInputClass}
                value={page.id}
                onChange={(event) => {
                  const target = state.draft.pages.find((item) => item.id === event.target.value);
                  if (target?.groups[0]) state.moveField(field.id, target.groups[0].id);
                  else if (target)
                    state.change((layout) => {
                      const source = layout.pages
                        .flatMap((p) => p.groups)
                        .find((g) => g.fields.some((f) => f.field_id === field.id));
                      const entry = source?.fields.find((f) => f.field_id === field.id);
                      if (!entry) return;
                      source!.fields = source!.fields.filter((f) => f.field_id !== field.id);
                      layout.pages
                        .find((p) => p.id === target.id)
                        ?.groups.push({
                          id: newId(),
                          name: "默认分组",
                          columns: 2,
                          collapsible: true,
                          default_collapsed: false,
                          fields: [entry],
                        });
                    });
                }}
              >
                {state.draft.pages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              所属分组
              <select
                className={layoutInputClass}
                value={group.id}
                onChange={(event) => state.moveField(field.id, event.target.value)}
              >
                {state.groups.map(({ page: targetPage, group: targetGroup }) => (
                  <option key={targetGroup.id} value={targetGroup.id}>
                    {targetPage.name} / {targetGroup.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              字段宽度
              <select
                className={layoutInputClass}
                value={placement.width}
                onChange={(event) => state.patchField(field.id, { width: event.target.value as TIssueLayoutWidth })}
              >
                <option value="auto">跟随分组</option>
                <option value="third">三分之一行</option>
                <option value="half">半行</option>
                <option value="full">独占整行</option>
              </select>
            </label>
            <div>
              <span>显示场景</span>
              <div className="mt-2 flex flex-wrap gap-3">
                {(
                  [
                    { value: "create", label: "创建" },
                    { value: "edit", label: "编辑" },
                    { value: "detail", label: "详情" },
                  ] as { value: TIssueLayoutContext; label: string }[]
                ).map((item) => (
                  <label key={item.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={placement.contexts.includes(item.value)}
                      disabled={field.is_required && field.is_active !== false && item.value !== "detail"}
                      onChange={(event) => {
                        const contexts = event.target.checked
                          ? [...placement.contexts, item.value]
                          : placement.contexts.filter((value) => value !== item.value);
                        if (contexts.length) state.patchField(field.id, { contexts });
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-11 text-tertiary">至少保留一个场景；必填字段在创建和编辑时始终可见。</p>
            </div>
            {field.description && (
              <div>
                <span>字段说明</span>
                <p className="mt-1 text-12 break-words text-tertiary">{field.description}</p>
              </div>
            )}
          </>
        )}
        {canEdit && (
          <div className="space-y-4 border-t border-subtle pt-4">
            <div className="flex gap-3">
              <button
                type="button"
                className="flex items-center gap-1 text-12"
                onClick={() => state.reorder(selection, -1)}
              >
                <ArrowUp className="size-3.5" />
                上移
              </button>
              <button
                type="button"
                className="flex items-center gap-1 text-12"
                onClick={() => state.reorder(selection, 1)}
              >
                <ArrowDown className="size-3.5" />
                下移
              </button>
            </div>
            {selection.kind !== "field" && (
              <button
                type="button"
                className="flex items-center gap-1 text-12 text-danger-primary"
                onClick={() => onDelete(selection)}
              >
                <Trash2 className="size-3.5" />
                移除{selection.kind === "page" ? "页面" : "分组"}
              </button>
            )}
          </div>
        )}
        <p className="text-11 leading-relaxed text-tertiary">
          布局只调整展示位置。字段名称、选项和校验规则请在「属性」中维护。
        </p>
      </div>
    </aside>
  );
}
