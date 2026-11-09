import { useCallback, useEffect, useMemo, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { v4 as newId } from "uuid";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import type {
  TIssueFieldPlacement,
  TIssueLayoutGroup,
  TIssueLayoutPage,
  TIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";
import {
  createLayoutGroup,
  defaultPlacement,
  moveLayoutField,
  resolveIssueTypeLayout,
} from "@/utils/issue-type-layout";
import { synchronizeIssueTypeLayout } from "@/hooks/store/use-issue-type-layout";

export type TLayoutSelection = { kind: "page" | "group" | "field"; id: string };
export type TLayoutSave = (id: string, data: Partial<TIssueType>) => Promise<TIssueType | undefined>;

export function useIssueTypeLayoutEditor(issueType: TIssueType, fields: TTypeExtraField[], onSave: TLayoutSave) {
  const initial = useMemo(
    () => resolveIssueTypeLayout(issueType.field_layout, fields, false),
    [issueType.field_layout, fields]
  );
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [selection, setSelection] = useState<TLayoutSelection>({ kind: "page", id: initial.pages[0].id });
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
    setDraft((current) =>
      JSON.stringify(current) === baseline ? initial : resolveIssueTypeLayout(current, fields, false)
    );
    setBaseline(JSON.stringify(initial));
    // Reconcile server updates without replacing an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const groups = draft.pages.flatMap((page) => page.groups.map((group) => ({ page, group })));
  const placedIds = new Set(groups.flatMap(({ group }) => group.fields.map((field) => field.field_id)));
  const unassigned = fields.filter((field) => !placedIds.has(field.id));
  const selectedLocation = groups.find(({ page, group }) =>
    selection.kind === "page"
      ? page.id === selection.id
      : selection.kind === "group"
        ? group.id === selection.id
        : group.fields.some((field) => field.field_id === selection.id)
  );
  const selectedPage =
    draft.pages.find((page) => selection.kind === "page" && page.id === selection.id) ??
    selectedLocation?.page ??
    draft.pages[0];
  const selectedGroup = selectedLocation?.group ?? selectedPage.groups[0];
  const selectedField = selection.kind === "field" ? fields.find((field) => field.id === selection.id) : undefined;
  const selectedPlacement = selectedGroup?.fields.find((field) => field.field_id === selectedField?.id);

  const change = useCallback((fn: (layout: TIssueTypeFieldLayout) => void) => {
    setDraft((previous) => {
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
    setError(null);
  }, []);
  const patchPage = (id: string, patch: Partial<Pick<TIssueLayoutPage, "name">>) =>
    change((layout) => {
      const page = layout.pages.find((item) => item.id === id);
      if (page) Object.assign(page, patch);
    });
  const patchGroup = (id: string, patch: Partial<Omit<TIssueLayoutGroup, "id" | "fields">>) =>
    change((layout) => {
      const group = layout.pages.flatMap((page) => page.groups).find((item) => item.id === id);
      if (group) {
        Object.assign(group, patch);
        if (!group.collapsible) group.default_collapsed = false;
      }
    });
  const patchField = (id: string, patch: Partial<Omit<TIssueFieldPlacement, "field_id">>) =>
    change((layout) => {
      for (const page of layout.pages)
        for (const group of page.groups) {
          const entry = group.fields.find((item) => item.field_id === id);
          if (entry) Object.assign(entry, patch);
        }
    });
  const addPage = () => {
    const id = newId();
    change((layout) => layout.pages.push({ id, name: "新页面", groups: [createLayoutGroup(newId(), "新分组")] }));
    setSelection({ kind: "page", id });
  };
  const addGroup = (pageId: string) => {
    const id = newId();
    change((layout) => layout.pages.find((page) => page.id === pageId)?.groups.push(createLayoutGroup(id, "新分组")));
    setSelection({ kind: "group", id });
  };
  const moveField = (fieldId: string, groupId: string, beforeId?: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field || fieldId === beforeId) return;
    setDraft((current) => {
      if (
        current.pages.some((page) =>
          page.groups.some((group) => group.fields.some((entry) => entry.field_id === fieldId))
        )
      )
        return moveLayoutField(current, fieldId, groupId, beforeId);
      const next = structuredClone(current);
      const target = next.pages.flatMap((page) => page.groups).find((group) => group.id === groupId);
      const index = target?.fields.findIndex((entry) => entry.field_id === beforeId) ?? -1;
      target?.fields.splice(index < 0 ? target.fields.length : index, 0, defaultPlacement(field));
      return next;
    });
    setSelection({ kind: "field", id: fieldId });
  };
  const moveNode = (node: TLayoutSelection, target: TLayoutSelection) => {
    if (node.id === target.id) return;
    if (node.kind === "field") {
      const destinationGroup = groups.find(({ group, page }) =>
        target.kind === "field"
          ? group.fields.some((entry) => entry.field_id === target.id)
          : target.kind === "group"
            ? group.id === target.id
            : page.id === target.id
      )?.group;
      if (destinationGroup) moveField(node.id, destinationGroup.id, target.kind === "field" ? target.id : undefined);
      return;
    }
    change((layout) => {
      if (node.kind === "page" && target.kind === "page") {
        const from = layout.pages.findIndex((page) => page.id === node.id);
        const to = layout.pages.findIndex((page) => page.id === target.id);
        if (from >= 0 && to >= 0) layout.pages.splice(to, 0, layout.pages.splice(from, 1)[0]);
      } else if (node.kind === "group") {
        const source = layout.pages.find((page) => page.groups.some((group) => group.id === node.id));
        const destination =
          target.kind === "page"
            ? layout.pages.find((page) => page.id === target.id)
            : layout.pages.find((page) => page.groups.some((group) => group.id === target.id));
        if (!source || !destination) return;
        const movingGroup = source.groups.splice(
          source.groups.findIndex((group) => group.id === node.id),
          1
        )[0];
        const to = destination.groups.findIndex((item) => item.id === target.id);
        destination.groups.splice(to < 0 ? destination.groups.length : to, 0, movingGroup);
      }
    });
  };
  const reorder = (node: TLayoutSelection, direction: -1 | 1) =>
    change((layout) => {
      const containingGroup = layout.pages
        .flatMap((page) => page.groups)
        .find((group) => group.fields.some((entry) => entry.field_id === node.id));
      const containingPage = layout.pages.find((page) => page.groups.some((group) => group.id === node.id));
      const items =
        node.kind === "page" ? layout.pages : node.kind === "group" ? containingPage?.groups : containingGroup?.fields;
      if (!items) return;
      const index = items.findIndex((item) => ("field_id" in item ? item.field_id : item.id) === node.id);
      const target = index + direction;
      if (index >= 0 && target >= 0 && target < items.length)
        [items[index], items[target]] = [items[target], items[index]];
    });
  const removeNode = (node: TLayoutSelection, destinationId: string) => {
    const layout = structuredClone(draft);
    const removed = layout.pages.flatMap((page) =>
      page.groups.filter((group) => (node.kind === "page" ? page.id === node.id : group.id === node.id))
    );
    const entries = removed.flatMap((group) => group.fields);
    layout.pages = layout.pages.filter((page) => node.kind !== "page" || page.id !== node.id);
    for (const page of layout.pages)
      page.groups = page.groups.filter((group) => node.kind !== "group" || group.id !== node.id);
    if (!layout.pages.length) layout.pages.push({ id: newId(), name: "基本信息", groups: [] });
    let target = layout.pages.flatMap((page) => page.groups).find((group) => group.id === destinationId);
    if (!target) {
      target = createLayoutGroup(newId(), "默认分组");
      layout.pages[0].groups.push(target);
    }
    target.fields.push(...entries);
    setDraft(layout);
    setError(null);
    setSelection({ kind: "group", id: target.id });
  };
  const reset = () => {
    const next = resolveIssueTypeLayout(undefined, fields);
    setDraft(next);
    setSelection({ kind: "page", id: next.pages[0].id });
    setError(null);
  };
  const cancel = () => {
    setDraft(initial);
    setBaseline(JSON.stringify(initial));
    setError(null);
  };
  const save = async () => {
    if (unassigned.length) {
      setError(`请先放置 ${unassigned.length} 个未分配字段`);
      return;
    }
    if (draft.pages.some((page) => !page.name.trim() || page.groups.some((group) => !group.name.trim()))) {
      setError("页面和分组名称不能为空");
      return;
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
    } catch (cause) {
      const messages = cause && typeof cause === "object" && "field_layout" in cause ? cause.field_layout : null;
      setError(
        Array.isArray(messages)
          ? messages.join("；")
          : cause instanceof Error
            ? cause.message
            : "保存布局失败，请稍后重试"
      );
    } finally {
      setIsSaving(false);
    }
  };
  return {
    draft,
    selection,
    setSelection,
    isDirty,
    isSaving,
    error,
    groups,
    unassigned,
    selectedPage,
    selectedGroup,
    selectedField,
    selectedPlacement,
    change,
    patchPage,
    patchGroup,
    patchField,
    addPage,
    addGroup,
    moveField,
    moveNode,
    reorder,
    removeNode,
    reset,
    cancel,
    save,
  };
}

export type TIssueLayoutEditorState = ReturnType<typeof useIssueTypeLayoutEditor>;
