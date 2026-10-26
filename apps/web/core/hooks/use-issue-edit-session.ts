/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, isEqual } from "lodash-es";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { TIssue, TNameDescriptionLoader } from "@plane/types";
// components
import type { TIssueOperations } from "@/components/issues/issue-detail/root";
import { mergeIds } from "@/components/issues/issue-detail/release-operations";
// hooks
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
// store
import { StoreContext } from "@/lib/store-context";

/** 只会由标题 / 描述的自动保存回调带出来的键：会话结束后迟到的这类调用一律丢弃，否则取消掉的内容会被写回 */
const AUTOSAVE_ONLY_KEYS = new Set(["name", "description_html", "skip_activity"]);
/** 随 PATCH 一起发、但不是工作项字段，不能铺到本地 store 上 */
const PAYLOAD_ONLY_KEYS = new Set(["approval_reason", "skip_activity"]);
/** 不走 PATCH、各有专用接口的字段 */
const RELATION_KEYS = new Set(["cycle_id", "module_ids", "release_ids"]);

const LEAVE_MESSAGE = "有未保存的修改，确定离开吗？";

type TSessionState = {
  active: boolean;
  issueId: string;
  /** 本次会话里改过的字段（含 approval_reason 这类随 PATCH 走的附加键） */
  draft: Record<string, unknown>;
  /** 改动前的值，只记录被改过的键，取消时据此回滚本地 store */
  snapshot: Record<string, unknown>;
  /** 进入编辑时编辑器里的 HTML，保存时与之比较决定要不要把描述一并提交 */
  descriptionBaseline: string | null;
  /** 标题框里还没经过防抖提交的最新值 */
  pendingTitle: string | null;
};

export type TUseIssueEditSessionArgs = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** 真正落库的操作集（各 root 现有的 issueOperations） */
  issueOperations: TIssueOperations;
  editorRef: React.RefObject<EditorRefApi>;
  isSubmitting: TNameDescriptionLoader;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
};

export type TIssueEditSession = {
  isEditing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  /** 取消后自增，作为标题 / 描述编辑器的 key，让它们丢掉本地状态回到快照 */
  sessionKey: number;
  /** 传给详情各控件的操作集：编辑态暂存在本地，保存时一次提交 */
  operations: TIssueOperations;
  startEditing: () => void;
  save: () => Promise<boolean>;
  cancel: () => void;
  /** 标题框每次输入都调，保存时据此把还在防抖里的标题收进来 */
  onTitleChange: (value: string) => void;
};

const getDirtyKeys = (state: TSessionState) =>
  Object.keys(state.draft).filter(
    (key) => !PAYLOAD_ONLY_KEYS.has(key) && !isEqual(state.draft[key], state.snapshot[key])
  );

const diffIds = (before: unknown, after: unknown) => {
  const prev = Array.isArray(before) ? (before as string[]) : [];
  const next = Array.isArray(after) ? (after as string[]) : [];
  return {
    add: next.filter((id) => !prev.includes(id)),
    remove: prev.filter((id) => !next.includes(id)),
  };
};

/**
 * 工作项详情的「编辑 → 保存 / 取消」会话。
 * 详情各控件仍然按原来的方式调 issueOperations，但拿到的是这里返回的 operations：
 * 编辑态下所有改动只写本地 store（界面立刻反映）并记进草稿，点保存时按字段类型分别调真实接口；
 * 取消时用快照回滚本地 store。
 */
export const useIssueEditSession = (args: TUseIssueEditSessionArgs): TIssueEditSession => {
  const { workspaceSlug, projectId, issueId, issueOperations, editorRef, isSubmitting, setIsSubmitting } = args;
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useIssueEditSession must be used within StoreProvider");
  const issueStore = context.issue.issues;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  // 草稿存在 ref 里，这个计数器只负责让 hasChanges 重新计算
  const [draftVersion, setDraftVersion] = useState(0);

  const stateRef = useRef<TSessionState>({
    active: false,
    issueId,
    draft: {},
    snapshot: {},
    descriptionBaseline: null,
    pendingTitle: null,
  });
  const realOpsRef = useRef(issueOperations);
  realOpsRef.current = issueOperations;
  const setIsSubmittingRef = useRef(setIsSubmitting);
  setIsSubmittingRef.current = setIsSubmitting;
  const scopeRef = useRef({ workspaceSlug, projectId });
  scopeRef.current = { workspaceSlug, projectId };

  /** 把一段改动铺到本地 store，第一次碰到的键先把原值记进快照 */
  const applyLocal = useCallback(
    (patch: Record<string, unknown>) => {
      const state = stateRef.current;
      const current = issueStore.getIssueById(state.issueId) as unknown as Record<string, unknown> | undefined;
      if (!current) return;
      const localPatch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (PAYLOAD_ONLY_KEYS.has(key)) continue;
        if (!(key in state.snapshot)) state.snapshot[key] = cloneDeep(current[key]);
        localPatch[key] = value;
      }
      if (Object.keys(localPatch).length > 0) issueStore.updateIssue(state.issueId, localPatch as Partial<TIssue>);
    },
    [issueStore]
  );

  const stage = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(stateRef.current.draft, patch);
      applyLocal(patch);
      setDraftVersion((version) => version + 1);
    },
    [applyLocal]
  );

  /** 本地 store 回到快照（updated_at 也在快照里，一并还原） */
  const revertLocal = useCallback(() => {
    const state = stateRef.current;
    if (Object.keys(state.snapshot).length === 0) return;
    issueStore.updateIssue(state.issueId, state.snapshot as Partial<TIssue>);
  }, [issueStore]);

  const endSession = useCallback((remount: boolean) => {
    const state = stateRef.current;
    state.active = false;
    state.draft = {};
    state.snapshot = {};
    state.descriptionBaseline = null;
    state.pendingTitle = null;
    setIsEditing(false);
    setIsSaving(false);
    setDraftVersion(0);
    if (remount) setSessionKey((key) => key + 1);
    // 标题 / 描述可能还停在 submitting，统一收口，免得离开提醒一直挂着
    setIsSubmittingRef.current("saved");
  }, []);

  const operations = useMemo<TIssueOperations>(() => {
    const isActiveFor = (id: string) => stateRef.current.active && stateRef.current.issueId === id;
    const currentIssue = () => issueStore.getIssueById(stateRef.current.issueId);
    return {
      fetch: async (ws, pid, iid, loader) => {
        // 编辑中拉远端会把草稿冲掉
        if (isActiveFor(iid)) return;
        await realOpsRef.current.fetch(ws, pid, iid, loader);
      },
      update: async (ws, pid, iid, data) => {
        if (isActiveFor(iid)) {
          stage(data as Record<string, unknown>);
          return;
        }
        if (Object.keys(data).every((key) => AUTOSAVE_ONLY_KEYS.has(key))) return;
        await realOpsRef.current.update(ws, pid, iid, data);
      },
      remove: (ws, pid, iid) => realOpsRef.current.remove(ws, pid, iid),
      archive: async (ws, pid, iid) => {
        await realOpsRef.current.archive?.(ws, pid, iid);
      },
      restore: async (ws, pid, iid) => {
        await realOpsRef.current.restore?.(ws, pid, iid);
      },
      addCycleToIssue: async (ws, pid, cycleId, iid) => {
        if (isActiveFor(iid)) {
          stage({ cycle_id: cycleId });
          return;
        }
        await realOpsRef.current.addCycleToIssue?.(ws, pid, cycleId, iid);
      },
      addIssueToCycle: async (ws, pid, cycleId, issueIds) => {
        await realOpsRef.current.addIssueToCycle?.(ws, pid, cycleId, issueIds);
      },
      removeIssueFromCycle: async (ws, pid, cycleId, iid) => {
        if (isActiveFor(iid)) {
          stage({ cycle_id: null });
          return;
        }
        await realOpsRef.current.removeIssueFromCycle?.(ws, pid, cycleId, iid);
      },
      removeIssueFromModule: async (ws, pid, moduleId, iid) => {
        if (isActiveFor(iid)) {
          stage({ module_ids: mergeIds(currentIssue()?.module_ids, [], [moduleId]) });
          return;
        }
        await realOpsRef.current.removeIssueFromModule?.(ws, pid, moduleId, iid);
      },
      changeModulesInIssue: async (ws, pid, iid, addModuleIds, removeModuleIds) => {
        if (isActiveFor(iid)) {
          stage({ module_ids: mergeIds(currentIssue()?.module_ids, addModuleIds, removeModuleIds) });
          return;
        }
        await realOpsRef.current.changeModulesInIssue?.(ws, pid, iid, addModuleIds, removeModuleIds);
      },
      changeReleasesInIssue: async (ws, pid, iid, addReleaseIds, removeReleaseIds) => {
        if (isActiveFor(iid)) {
          stage({ release_ids: mergeIds(currentIssue()?.release_ids, addReleaseIds, removeReleaseIds) });
          return;
        }
        await realOpsRef.current.changeReleasesInIssue?.(ws, pid, iid, addReleaseIds, removeReleaseIds);
      },
    };
  }, [issueStore, stage]);

  const startEditing = useCallback(() => {
    const state = stateRef.current;
    const current = issueStore.getIssueById(issueId);
    if (!current || state.active) return;
    state.active = true;
    state.issueId = issueId;
    state.draft = {};
    state.snapshot = { updated_at: current.updated_at };
    state.descriptionBaseline = editorRef.current?.getDocument().html ?? null;
    state.pendingTitle = null;
    setDraftVersion(0);
    setIsEditing(true);
  }, [editorRef, issueId, issueStore]);

  const onTitleChange = useCallback((value: string) => {
    if (stateRef.current.active) stateRef.current.pendingTitle = value;
  }, []);

  const cancel = useCallback(() => {
    if (!stateRef.current.active) return;
    revertLocal();
    endSession(true);
  }, [endSession, revertLocal]);

  const save = useCallback(async (): Promise<boolean> => {
    const state = stateRef.current;
    if (!state.active) return true;
    const { workspaceSlug: ws, projectId: pid } = scopeRef.current;
    const iid = state.issueId;

    // 1. 把还在防抖里的标题 / 描述收进草稿
    if (state.pendingTitle !== null) {
      const name = state.pendingTitle.trim();
      if (name.length > 0) stage({ name });
    }
    const html = editorRef.current?.getDocument().html;
    if (html && state.descriptionBaseline !== null && html !== state.descriptionBaseline) {
      stage({ description_html: html });
    }

    // 2. 只提交真的变了的字段
    const dirtyKeys = getDirtyKeys(state);
    if (dirtyKeys.length === 0) {
      endSession(false);
      return true;
    }
    const patch: Record<string, unknown> = {};
    for (const key of dirtyKeys) if (!RELATION_KEYS.has(key)) patch[key] = state.draft[key];
    if ("state_id" in patch && "approval_reason" in state.draft) patch.approval_reason = state.draft.approval_reason;

    setIsSaving(true);
    // 3. 本地先回到修改前：真实操作自己做乐观更新，列表分组 / 迭代归属都以它读到的「修改前」为准
    revertLocal();
    const real = realOpsRef.current;
    if (Object.keys(patch).length > 0) await real.update(ws, pid, iid, patch as Partial<TIssue>);
    if (dirtyKeys.includes("cycle_id")) {
      const next = state.draft.cycle_id as string | null;
      const prev = state.snapshot.cycle_id as string | null | undefined;
      if (next) await real.addCycleToIssue?.(ws, pid, next, iid);
      else if (prev) await real.removeIssueFromCycle?.(ws, pid, prev, iid);
    }
    if (dirtyKeys.includes("module_ids")) {
      const { add, remove } = diffIds(state.snapshot.module_ids, state.draft.module_ids);
      await real.changeModulesInIssue?.(ws, pid, iid, add, remove);
    }
    if (dirtyKeys.includes("release_ids")) {
      const { add, remove } = diffIds(state.snapshot.release_ids, state.draft.release_ids);
      await real.changeReleasesInIssue?.(ws, pid, iid, add, remove);
    }

    // 4. 真实操作内部吞错并回滚本地，这里按「本地是否等于草稿」判断有没有没落下去的；
    //    有失败的字段就重挂标题 / 描述，让界面回到服务端真实值
    const after = issueStore.getIssueById(iid) as unknown as Record<string, unknown> | undefined;
    const failed = dirtyKeys.some((key) => !isEqual(after?.[key], state.draft[key]));
    endSession(failed);
    return !failed;
  }, [editorRef, endSession, issueStore, revertLocal, stage]);

  // 切换到别的工作项：上一个的草稿直接丢弃
  useEffect(() => {
    const state = stateRef.current;
    if (state.active && state.issueId !== issueId) {
      revertLocal();
      endSession(true);
    }
  }, [endSession, issueId, revertLocal]);

  // 卸载时把本地 store 还原，列表页不要带着没保存的值
  useEffect(
    () => () => {
      const state = stateRef.current;
      if (!state.active) return;
      revertLocal();
      state.active = false;
    },
    [revertLocal]
  );

  const hasChanges = useMemo(
    () => isEditing && (getDirtyKeys(stateRef.current).length > 0 || isSubmitting === "submitting"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEditing, isSubmitting, draftVersion]
  );

  const { setShowAlert } = useReloadConfirmations(true, LEAVE_MESSAGE);
  useEffect(() => {
    setShowAlert(hasChanges);
  }, [hasChanges, setShowAlert]);

  return { isEditing, isSaving, hasChanges, sessionKey, operations, startEditing, save, cancel, onTitleChange };
};
