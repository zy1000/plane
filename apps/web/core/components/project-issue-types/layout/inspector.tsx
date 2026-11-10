import type { ReactNode } from "react";
import { Button } from "@plane/propel/button";
import { ToggleSwitch } from "@plane/ui";
import type { TIssueLayoutEditorState, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";
import type { TIssueLayoutContext, TIssueLayoutWidth } from "@/services/project/issue-type-layout.types";
import { layoutAreaKey, layoutSpan } from "@/utils/issue-type-layout";
import { getFieldKindLabel } from "../field-display";
import { LayoutSegment } from "./segment";

export const layoutInputClass =
  "mt-1.5 w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-13 text-primary focus:border-accent-primary focus:outline-none disabled:opacity-60";

const CONTEXT_OPTIONS: { value: TIssueLayoutContext; label: string }[] = [
  { value: "create", label: "创建" },
  { value: "edit", label: "编辑" },
  { value: "detail", label: "详情" },
];
const controlClass =
  "h-[38px] w-full rounded-lg border border-strong bg-surface-1 px-3 text-14 text-primary focus:border-accent-strong focus:outline-none disabled:opacity-60";

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-13 font-medium text-secondary">{label}</span>
      {children}
    </div>
  );
}

/** 设计器右栏：选中的字段、分组或页面的设置。排布类的操作都能在这里完成，不依赖拖动 */
export function LayoutInspector({
  state,
  editable,
  onRemove,
}: {
  state: TIssueLayoutEditorState;
  editable: boolean;
  onRemove: (node: TLayoutSelection) => void;
}) {
  const {
    selection,
    selectedField: field,
    selectedPlacement: placement,
    selectedFieldArea: fieldArea,
    selectedGroup: group,
    selectedPage: page,
    selectedPosition: position,
  } = state;

  const renderOrder = (backward: string, forward: string) =>
    selection && (
      <Setting label="顺序">
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            size="xl"
            className="flex-1"
            disabled={!editable || !position || position.index <= 0}
            onClick={() => state.reorder(selection, -1)}
          >
            {backward}
          </Button>
          <Button
            variant="secondary"
            size="xl"
            className="flex-1"
            disabled={!editable || !position || position.index >= position.items.length - 1}
            onClick={() => state.reorder(selection, 1)}
          >
            {forward}
          </Button>
        </div>
      </Setting>
    );
  const renderRemove = (label: string) =>
    selection && (
      <div className="flex border-t border-subtle pt-5">
        <Button
          variant="error-outline"
          size="xl"
          className="px-3"
          disabled={!editable}
          onClick={() => onRemove(selection)}
        >
          {label}
        </Button>
      </div>
    );

  let title = "布局设置";
  let body: ReactNode = <p className="text-13 text-tertiary">请在画布中选择字段、分组或页面。</p>;

  if (field && placement && fieldArea) {
    const columns = fieldArea.area.columns;
    const widthOptions: { value: TIssueLayoutWidth; label: string }[] = [
      ...([1, 2, 3, 4] as const).filter((value) => value < columns).map((value) => ({ value, label: `${value} 列` })),
      { value: "full", label: "整行" },
    ];
    title = "字段设置";
    body = (
      <>
        <div className="flex flex-col gap-1 rounded-[10px] bg-layer-1 px-4 py-3.5">
          <span className="text-14 font-semibold break-words text-primary">{field.name}</span>
          <span className="text-13 text-tertiary">
            {[getFieldKindLabel(field), field.is_required && "必填", field.is_active === false && "已停用"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Setting label="字段宽度">
          <LayoutSegment
            ariaLabel="字段宽度"
            stretch
            disabled={!editable}
            value={layoutSpan(placement.width, columns) >= columns ? "full" : placement.width}
            options={widthOptions}
            onChange={(width) => state.patchField(field.id, { width })}
          />
        </Setting>
        <Setting label="显示场景">
          <div className="flex gap-7 text-14 text-primary">
            {CONTEXT_OPTIONS.map((item) => {
              const locked = !!field.is_required && field.is_active !== false && item.value !== "detail";
              return (
                <label
                  key={item.value}
                  className="flex items-center gap-2"
                  title={locked ? "必填字段在创建和编辑时始终显示" : undefined}
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={placement.contexts.includes(item.value)}
                    disabled={!editable || locked}
                    onChange={(event) => {
                      const contexts = event.target.checked
                        ? [...placement.contexts, item.value]
                        : placement.contexts.filter((value) => value !== item.value);
                      // 至少保留一个场景
                      if (contexts.length) state.patchField(field.id, { contexts });
                    }}
                  />
                  {item.label}
                </label>
              );
            })}
          </div>
        </Setting>
        {state.areas.length > 1 && (
          <Setting label="所在位置">
            <select
              aria-label="所在位置"
              className={controlClass}
              disabled={!editable}
              value={layoutAreaKey(fieldArea.ref)}
              onChange={(event) => {
                const target = state.areas.find((item) => layoutAreaKey(item.ref) === event.target.value);
                if (target) state.moveField(field.id, target.ref);
              }}
            >
              {state.areas.map((item) => (
                <option key={layoutAreaKey(item.ref)} value={layoutAreaKey(item.ref)}>
                  {item.label}
                </option>
              ))}
            </select>
          </Setting>
        )}
        {renderOrder("前移", "后移")}
      </>
    );
  } else if (group) {
    title = "分组设置";
    body = (
      <>
        <Setting label="分组名称">
          <input
            aria-label="分组名称"
            maxLength={100}
            className={controlClass}
            disabled={!editable}
            value={group.name}
            onChange={(event) => state.patchGroup(group.id, { name: event.target.value })}
          />
        </Setting>
        {state.draft.pages.length > 0 && (
          <Setting label="所属页面">
            <select
              aria-label="所属页面"
              className={controlClass}
              disabled={!editable}
              value={state.selectedGroupPageId ?? ""}
              onChange={(event) => state.moveGroup(group.id, event.target.value || null)}
            >
              <option value="">不归属页面</option>
              {state.draft.pages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Setting>
        )}
        <div className="flex flex-col gap-4 py-1 text-14 text-primary">
          <div className="flex items-center justify-between">
            可折叠
            <ToggleSwitch
              size="md"
              label="可折叠"
              disabled={!editable}
              value={group.collapsible}
              onChange={(collapsible) => state.patchGroup(group.id, { collapsible })}
            />
          </div>
          <div className="flex items-center justify-between">
            默认收起
            <ToggleSwitch
              size="md"
              label="默认收起"
              disabled={!editable || !group.collapsible}
              value={group.default_collapsed}
              onChange={(default_collapsed) => state.patchGroup(group.id, { default_collapsed })}
            />
          </div>
        </div>
        {renderOrder("上移", "下移")}
        {renderRemove("移除分组")}
      </>
    );
  } else if (page) {
    title = "页面设置";
    body = (
      <>
        <Setting label="页面名称">
          <input
            aria-label="页面名称"
            maxLength={100}
            className={controlClass}
            disabled={!editable}
            value={page.name}
            onChange={(event) => state.patchPage(page.id, { name: event.target.value })}
          />
        </Setting>
        {renderOrder("前移", "后移")}
        {renderRemove("移除页面")}
      </>
    );
  }

  return (
    <aside className="vertical-scrollbar flex w-[340px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-subtle bg-surface-1 p-6">
      <h3 className="text-16 font-semibold text-primary">{title}</h3>
      {body}
    </aside>
  );
}
