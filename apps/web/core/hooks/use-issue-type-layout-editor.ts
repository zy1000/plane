import { useCallback, useEffect, useMemo, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { v4 as newId } from "uuid";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import type {
  TIssueFieldPlacement,
  TIssueLayoutAreaRef,
  TIssueLayoutColumns,
  TIssueLayoutGroup,
  TIssueLayoutPage,
  TIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";
import {
  createLayoutGroup,
  createLayoutPage,
  findLayoutArea,
  layoutAreas,
  layoutContainers,
  moveLayoutField,
  resolveIssueTypeLayout,
} from "@/utils/issue-type-layout";
import { synchronizeIssueTypeLayout } from "@/hooks/store/use-issue-type-layout";

export type TLayoutSelection = { kind: "page" | "group" | "field"; id: string };
export type TLayoutSave = (id: string, data: Partial<TIssueType>) => Promise<TIssueType | undefined>;

/** 打开设计器时默认选中的节点：第一个字段，没有字段就第一个分组 / 页面 */
const firstSelection = (layout: TIssueTypeFieldLayout): TLayoutSelection | null => {
  const areas = layoutAreas(layout);
  const fieldId = areas.find((item) => item.area.fields.length)?.area.fields[0].field_id;
  if (fieldId) return { kind: "field", id: fieldId };
  const groupArea = areas.find((item) => item.ref.kind === "group");
  if (groupArea && groupArea.ref.kind === "group") return { kind: "group", id: groupArea.ref.id };
  return layout.pages[0] ? { kind: "page", id: layout.pages[0].id } : null;
};

/** 节点所在的页面；在根上（页签上方）返回 null，找不到返回 undefined */
const pageOf = (layout: TIssueTypeFieldLayout, node: TLayoutSelection): string | null | undefined => {
  if (node.kind === "page") return layout.pages.some((page) => page.id === node.id) ? node.id : undefined;
  return layoutAreas(layout).find((item) =>
    node.kind === "group"
      ? item.ref.kind === "group" && item.ref.id === node.id
      : item.area.fields.some((entry) => entry.field_id === node.id)
  )?.pageId;
};

/** 节点和它的同级：字段在所在网格里排，分组在所在容器里排，页面在页签里排 */
const siblingsOf = (layout: TIssueTypeFieldLayout, node: TLayoutSelection) => {
  if (node.kind === "page") return { items: layout.pages, index: layout.pages.findIndex((page) => page.id === node.id) };
  if (node.kind === "group") {
    const groups = layoutContainers(layout).find(({ container }) =>
      container.groups.some((group) => group.id === node.id)
    )?.container.groups;
    return { items: groups ?? [], index: groups?.findIndex((group) => group.id === node.id) ?? -1 };
  }
  const entries = layoutAreas(layout).find((item) => item.area.fields.some((entry) => entry.field_id === node.id))
    ?.area.fields;
  return { items: entries ?? [], index: entries?.findIndex((entry) => entry.field_id === node.id) ?? -1 };
};

/** 布局设计器的草稿：只在设计器打开期间存在，保存成功或放弃后随设计器卸载 */
export function useIssueTypeLayoutEditor(issueType: TIssueType, fields: TTypeExtraField[], onSave: TLayoutSave) {
  const initial = useMemo(
    () => resolveIssueTypeLayout(issueType.field_layout, fields),
    [issueType.field_layout, fields]
  );
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [selection, setSelection] = useState<TLayoutSelection | null>(() => firstSelection(initial));
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = JSON.stringify(draft) !== baseline;
  const blocker = useBlocker(isDirty);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (isDirty) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      [isDirty]
    )
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("布局有未保存的修改，确定离开吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    setDraft((current) => (JSON.stringify(current) === baseline ? initial : resolveIssueTypeLayout(current, fields)));
    setBaseline(JSON.stringify(initial));
    // Reconcile server updates without replacing an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const areas = layoutAreas(draft);
  const activePage = draft.pages.find((page) => page.id === activePageId) ?? draft.pages[0];
  const selectedFieldArea =
    selection?.kind === "field"
      ? areas.find((item) => item.area.fields.some((entry) => entry.field_id === selection.id))
      : undefined;
  const selectedField = selectedFieldArea ? fields.find((field) => field.id === selection?.id) : undefined;
  const selectedPlacement = selectedFieldArea?.area.fields.find((entry) => entry.field_id === selection?.id);
  const selectedGroupLocation =
    selection?.kind === "group"
      ? layoutContainers(draft).find(({ container }) => container.groups.some((group) => group.id === selection.id))
      : undefined;
  const selectedGroup = selectedGroupLocation?.container.groups.find((group) => group.id === selection?.id);
  const selectedPage = selection?.kind === "page" ? draft.pages.find((page) => page.id === selection.id) : undefined;
  const selectedPosition = selection ? siblingsOf(draft, selection) : undefined;

  const change = useCallback((fn: (layout: TIssueTypeFieldLayout) => void) => {
    setDraft((previous) => {
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
    setError(null);
  }, []);
  /** 选中节点；节点在某个页面里时顺带切到那一页 */
  const select = (node: TLayoutSelection) => {
    setSelection(node);
    const pageId = pageOf(draft, node);
    if (pageId) setActivePageId(pageId);
  };
  const setColumns = (ref: TIssueLayoutAreaRef, columns: TIssueLayoutColumns) =>
    change((layout) => {
      const area = findLayoutArea(layout, ref)?.area;
      if (area) area.columns = columns;
    });
  const patchPage = (id: string, patch: Partial<Pick<TIssueLayoutPage, "name">>) =>
    change((layout) => {
      const page = layout.pages.find((item) => item.id === id);
      if (page) Object.assign(page, patch);
    });
  const patchGroup = (
    id: string,
    patch: Partial<Pick<TIssueLayoutGroup, "name" | "collapsible" | "default_collapsed">>
  ) =>
    change((layout) => {
      const group = layoutContainers(layout)
        .flatMap(({ container }) => container.groups)
        .find((item) => item.id === id);
      if (group) {
        Object.assign(group, patch);
        if (!group.collapsible) group.default_collapsed = false;
      }
    });
  const patchField = (id: string, patch: Partial<Omit<TIssueFieldPlacement, "field_id">>) =>
    change((layout) => {
      for (const { area } of layoutAreas(layout)) {
        const entry = area.fields.find((item) => item.field_id === id);
        if (entry) Object.assign(entry, patch);
      }
    });
  /** 有页面时加到当前页，否则加在描述下方 */
  const addGroup = () => {
    const id = newId();
    const pageId = activePage?.id;
    change((layout) =>
      (layout.pages.find((page) => page.id === pageId) ?? layout).groups.push(createLayoutGroup(id, "新分组"))
    );
    setSelection({ kind: "group", id });
  };
  const addPage = () => {
    const id = newId();
    change((layout) => layout.pages.push(createLayoutPage(id, "新页面")));
    setSelection({ kind: "page", id });
    setActivePageId(id);
  };
  const moveField = (fieldId: string, target: TIssueLayoutAreaRef, beforeId?: string) => {
    if (fieldId === beforeId) return;
    setDraft((current) => moveLayoutField(current, fieldId, target, beforeId));
    setError(null);
    setSelection({ kind: "field", id: fieldId });
    const pageId = findLayoutArea(draft, target)?.pageId;
    if (pageId) setActivePageId(pageId);
  };
  /** 分组挪到某个容器（pageId 为 null 即根上）里 beforeId 之前；不给 beforeId 排到末尾 */
  const moveGroup = (groupId: string, pageId: string | null, beforeId?: string) => {
    if (groupId === beforeId) return;
    change((layout) => {
      const containers = layoutContainers(layout);
      const source = containers.find(({ container }) => container.groups.some((group) => group.id === groupId));
      const destination = containers.find((item) => item.pageId === pageId);
      if (!source || !destination) return;
      const [group] = source.container.groups.splice(
        source.container.groups.findIndex((item) => item.id === groupId),
        1
      );
      const index = destination.container.groups.findIndex((item) => item.id === beforeId);
      destination.container.groups.splice(index < 0 ? destination.container.groups.length : index, 0, group);
    });
    if (pageId) setActivePageId(pageId);
  };
  const movePage = (pageId: string, beforeId: string) => {
    if (pageId === beforeId) return;
    change((layout) => {
      const from = layout.pages.findIndex((page) => page.id === pageId);
      if (from < 0) return;
      const [page] = layout.pages.splice(from, 1);
      const to = layout.pages.findIndex((item) => item.id === beforeId);
      layout.pages.splice(to < 0 ? layout.pages.length : to, 0, page);
    });
  };
  const reorder = (node: TLayoutSelection, direction: -1 | 1) =>
    change((layout) => {
      const { items, index } = siblingsOf(layout, node) as { items: unknown[]; index: number };
      const target = index + direction;
      if (index >= 0 && target >= 0 && target < items.length)
        [items[index], items[target]] = [items[target], items[index]];
    });
  /** 移除分组：字段回到所在容器的未分组区；移除页面：页内字段全部回到描述下方 */
  const removeNode = (node: TLayoutSelection) => {
    change((layout) => {
      if (node.kind === "group") {
        const container = layoutContainers(layout).find((item) =>
          item.container.groups.some((group) => group.id === node.id)
        )?.container;
        if (!container) return;
        const [group] = container.groups.splice(
          container.groups.findIndex((item) => item.id === node.id),
          1
        );
        container.fields.push(...group.fields);
      } else if (node.kind === "page") {
        const index = layout.pages.findIndex((page) => page.id === node.id);
        if (index < 0) return;
        const [page] = layout.pages.splice(index, 1);
        layout.fields.push(...page.fields, ...page.groups.flatMap((group) => group.fields));
      }
    });
    setSelection(null);
  };
  const reset = () => {
    const next = resolveIssueTypeLayout(undefined, fields);
    setDraft(next);
    setSelection(firstSelection(next));
    setActivePageId(null);
    setError(null);
  };
  /** 保存成功返回 true */
  const save = async () => {
    if (
      layoutContainers(draft).some(({ container }) => container.groups.some((group) => !group.name.trim())) ||
      draft.pages.some((page) => !page.name.trim())
    ) {
      setError("页面和分组名称不能为空");
      return false;
    }
    setIsSaving(true);
    setError(null);
    try {
      const updated = await onSave(issueType.id, { field_layout: draft });
      if (!updated) throw new Error("当前类型无法保存，请刷新后重试");
      await synchronizeIssueTypeLayout(updated);
      setBaseline(JSON.stringify(draft));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "布局已保存",
        message: "该工作项类型的创建、编辑和详情展示已同步更新。",
      });
      return true;
    } catch (cause) {
      const messages = cause && typeof cause === "object" && "field_layout" in cause ? cause.field_layout : null;
      setError(
        Array.isArray(messages)
          ? messages.join("；")
          : cause instanceof Error
            ? cause.message
            : "保存布局失败，请稍后重试"
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  return {
    draft,
    areas,
    selection,
    select,
    activePage,
    setActivePageId,
    isDirty,
    isSaving,
    error,
    selectedField,
    selectedPlacement,
    selectedFieldArea,
    selectedGroup,
    selectedGroupPageId: selectedGroupLocation?.pageId ?? null,
    selectedPage,
    selectedPosition,
    setColumns,
    patchPage,
    patchGroup,
    patchField,
    addPage,
    addGroup,
    moveField,
    moveGroup,
    movePage,
    reorder,
    removeNode,
    reset,
    save,
  };
}

export type TIssueLayoutEditorState = ReturnType<typeof useIssueTypeLayoutEditor>;
