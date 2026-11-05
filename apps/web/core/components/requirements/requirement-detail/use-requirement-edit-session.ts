import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import type {
  TRequirement,
  TRequirementBuiltinKey,
  TRequirementBuiltinValues,
  TRequirementData,
  TRequirementItemStatus,
} from "@plane/types";
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
import type { TRequirementDetailPatch } from "./use-requirement-detail";

const LEAVE_MESSAGE = "有未保存的修改，确定离开吗？";

/** 本次会话里改过的东西；每一项「没碰过」与「改成空」要分得开，所以用 null 表示没碰过 */
type TDraft = {
  builtin: Partial<TRequirementBuiltinValues>;
  data: TRequirementData | null;
  code: string | null;
  /** 状态与模块各走旁路接口，不在内容 PATCH 里，单独记 */
  status: TRequirementItemStatus | null;
  module: { id: string | null; name: string | null } | null;
};

const emptyDraft = (): TDraft => ({ builtin: {}, data: null, code: null, status: null, module: null });

type TStatusHandler = (status: TRequirementItemStatus) => void;
type TModuleHandler = (moduleId: string | null, moduleName: string | null) => void;

export type TRequirementEditSession = {
  isEditing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  /** 叠加了草稿的行：详情各控件渲染它，而不是服务端那一行 */
  requirement: TRequirement | null;
  /** 传给详情正文 / 属性栏的 onPatch：编辑态暂存，会话之外迟到的提交一律丢弃 */
  onPatch: (patch: TRequirementDetailPatch) => Promise<unknown>;
  /**
   * 传给详情的状态 / 模块回调。编辑态暂存、随保存提交；非编辑态下内容可改时为 undefined
   * （只读，要改先点编辑）；内容锁死（评审中 / 已关闭）进不了编辑态时直通旁路接口 ——
   * 已关闭的需求只能靠改状态重开，评审中的也还允许挪模块。
   */
  onStatusChange?: TStatusHandler;
  onModuleChange?: TModuleHandler;
  startEditing: () => void;
  /**
   * 提交全部草稿：内容并成一次 PATCH，状态 / 模块随后各走旁路接口。全部成功退出编辑态；
   * 有失败的（各接口自己 toast）已落库的部分清出草稿、没落下去的保留，留在编辑态让用户修正
   */
  save: () => Promise<boolean>;
  cancel: () => void;
};

type TArgs = {
  /** 服务端那一行（use-requirement-detail 的 requirement） */
  requirement: TRequirement | null;
  /** 内容可改：页面级写权限 + 未锁定 + 未关闭。为 false 时进不了编辑态，已在编辑态会被踢出 */
  enabled: boolean;
  /** 真正落库的内容提交（use-requirement-detail 的 submitPatch 或其包装）。失败时它自己 toast 并 resolve 成空 */
  onPatch: (patch: TRequirementDetailPatch) => Promise<unknown>;
  /**
   * 真正改状态 / 模块的旁路提交（updateStatus / updateModule 或其包装），成功要 resolve 成真值。
   * 不传 = 这一页没有这条轴（标准库没有状态）或没有页面级写权限。
   */
  onStatusChange?: (status: TRequirementItemStatus) => Promise<unknown>;
  onModuleChange?: (moduleId: string | null, moduleName: string | null) => Promise<unknown>;
};

/**
 * 需求详情（抽屉 / 整页）的「编辑 → 保存 / 取消」会话。
 *
 * 详情各控件照旧调 onPatch / onStatusChange / onModuleChange，但拿到的是这里返回的那套：
 * 编辑态下改动只记进草稿，由 `requirement` 叠加后回显；点保存把内容并成一次 PATCH、状态与
 * 模块各走旁路接口。与工作项的 use-issue-edit-session 同一思路，差别是需求详情本来就以本地
 * 状态为准、没有 store 要回滚，所以取消只是把草稿扔掉。
 *
 * 不进会话的东西：附件（上传即落库，由调用方直接走真实 onPatch）、关联 / 子需求 / 历史回滚。
 */
export const useRequirementEditSession = ({
  requirement,
  enabled,
  onPatch,
  onStatusChange,
  onModuleChange,
}: TArgs): TRequirementEditSession => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 草稿存在 ref 里：失焦提交与紧跟着的保存点击在同一轮事件里，不能等 state 过一帧；
  // 这个计数器只负责让叠加行与 hasChanges 重新计算
  const [draftVersion, setDraftVersion] = useState(0);
  const draftRef = useRef<TDraft>(emptyDraft());
  const activeRef = useRef(false);
  const requirementRef = useRef(requirement);
  requirementRef.current = requirement;
  const realPatchRef = useRef(onPatch);
  realPatchRef.current = onPatch;
  const realStatusRef = useRef(onStatusChange);
  realStatusRef.current = onStatusChange;
  const realModuleRef = useRef(onModuleChange);
  realModuleRef.current = onModuleChange;
  const requirementId = requirement?.id ?? null;

  const endSession = useCallback(() => {
    activeRef.current = false;
    draftRef.current = emptyDraft();
    setIsEditing(false);
    setIsSaving(false);
    setDraftVersion(0);
  }, []);

  // 换一条需求（抽屉里跳父项 / 子需求）：上一条的草稿直接丢弃
  useEffect(() => {
    if (activeRef.current) endSession();
  }, [endSession, requirementId]);

  // 编辑中被提交评审 / 关闭（别处操作后重拉了这一行）：内容已不可改，退出编辑态
  useEffect(() => {
    if (!enabled && activeRef.current) endSession();
  }, [enabled, endSession]);

  const bump = useCallback(() => setDraftVersion((version) => version + 1), []);

  const stage = useCallback(
    (patch: TRequirementDetailPatch) => {
      const draft = draftRef.current;
      if (patch.builtin) draft.builtin = { ...draft.builtin, ...patch.builtin };
      if (patch.data !== undefined) draft.data = patch.data;
      if (patch.code !== undefined) draft.code = patch.code;
      bump();
    },
    [bump]
  );

  const stagedPatch = useCallback(
    async (patch: TRequirementDetailPatch): Promise<unknown> => {
      // 附件不进会话：上传即落库，直接交给真实提交（正常情况下调用方会走单独的通道，这里兜底）
      if (patch.attachments) return realPatchRef.current({ attachments: patch.attachments });
      // 会话结束后迟到的提交（描述 / 富文本编辑器卸载时的补提交）一律丢弃，否则取消掉的内容会被写回
      if (!activeRef.current) return null;
      stage(patch);
      return null;
    },
    [stage]
  );

  const stageStatus = useCallback<TStatusHandler>(
    (status) => {
      if (!activeRef.current) return;
      draftRef.current.status = status;
      bump();
    },
    [bump]
  );

  const stageModule = useCallback<TModuleHandler>(
    (moduleId, moduleName) => {
      if (!activeRef.current) return;
      draftRef.current.module = { id: moduleId, name: moduleName };
      bump();
    },
    [bump]
  );

  const startEditing = useCallback(() => {
    if (!enabled || !requirementRef.current || activeRef.current) return;
    draftRef.current = emptyDraft();
    activeRef.current = true;
    setDraftVersion(0);
    setIsEditing(true);
  }, [enabled]);

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    endSession();
  }, [endSession]);

  /** 只挑真的变了的键：内置列整组会由 sendPatch 按当前行补齐，这里不必凑满 */
  const diffDraft = useCallback((base: TRequirement): TRequirementDetailPatch => {
    const draft = draftRef.current;
    const patch: TRequirementDetailPatch = {};
    const builtin: Partial<TRequirementBuiltinValues> = {};
    for (const key of Object.keys(draft.builtin) as TRequirementBuiltinKey[]) {
      if (!isEqual(draft.builtin[key], base[key])) (builtin as Record<string, unknown>)[key] = draft.builtin[key];
    }
    if (Object.keys(builtin).length > 0) patch.builtin = builtin;
    if (draft.data !== null && !isEqual(draft.data, base.data)) patch.data = draft.data;
    if (draft.code !== null && draft.code !== (base.code ?? "")) patch.code = draft.code;
    return patch;
  }, []);

  /** 状态 / 模块与当前行不同才算改了 */
  const pendingStatus = (base: TRequirement) => {
    const { status } = draftRef.current;
    return status !== null && status !== base.status ? status : null;
  };
  const pendingModule = (base: TRequirement) => {
    const { module } = draftRef.current;
    return module !== null && module.id !== base.module_id ? module : null;
  };

  const save = useCallback(async (): Promise<boolean> => {
    const base = requirementRef.current;
    if (!activeRef.current || !base) return true;
    const draft = draftRef.current;
    const patch = diffDraft(base);
    const nextStatus = pendingStatus(base);
    const nextModule = pendingModule(base);
    if (Object.keys(patch).length === 0 && !nextStatus && !nextModule) {
      endSession();
      return true;
    }
    setIsSaving(true);
    let failed = false;
    // 内容先走（带版本号的那一笔），状态 / 模块随后 —— 三者在 use-requirement-detail 的同一条队列里串行，
    // 各接口失败时自己 toast 并 resolve 成空
    if (Object.keys(patch).length > 0) {
      const saved = await realPatchRef.current(patch);
      if (saved) {
        draft.builtin = {};
        draft.data = null;
        draft.code = null;
      } else failed = true;
    }
    if (nextStatus) {
      const saved = await realStatusRef.current?.(nextStatus);
      if (saved) draft.status = null;
      else failed = true;
    }
    if (nextModule) {
      const saved = await realModuleRef.current?.(nextModule.id, nextModule.name);
      if (saved) draft.module = null;
      else failed = true;
    }
    if (!failed) {
      endSession();
      return true;
    }
    // 已落库的部分清出了草稿；没落下去的原样保留，留在编辑态让用户修正后再点保存
    setIsSaving(false);
    bump();
    return false;
  }, [bump, diffDraft, endSession]);

  const display = useMemo(() => {
    if (!requirement || !isEditing) return requirement;
    const draft = draftRef.current;
    return {
      ...requirement,
      ...draft.builtin,
      data: draft.data ?? requirement.data,
      ...(draft.code !== null ? { code: draft.code } : {}),
      ...(draft.status !== null ? { status: draft.status } : {}),
      ...(draft.module ? { module_id: draft.module.id, module_name: draft.module.name } : {}),
    };
    // draftVersion 是 ref 变化的信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirement, isEditing, draftVersion]);

  const hasChanges = useMemo(
    () =>
      Boolean(
        isEditing &&
          requirement &&
          (Object.keys(diffDraft(requirement)).length > 0 || pendingStatus(requirement) || pendingModule(requirement))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diffDraft, isEditing, requirement, draftVersion]
  );

  /**
   * 状态 / 模块回调按三态分发：编辑中 → 暂存；内容可改但没在编辑 → 只读；内容锁死
   * （评审中 / 已关闭）→ 直通旁路接口（已关闭的需求只能这样重开）。没有真实回调的轴一律只读。
   */
  const statusHandler = useMemo<TStatusHandler | undefined>(() => {
    if (!onStatusChange) return undefined;
    if (isEditing) return stageStatus;
    if (enabled) return undefined;
    return (status) => void onStatusChange(status);
  }, [enabled, isEditing, onStatusChange, stageStatus]);

  const moduleHandler = useMemo<TModuleHandler | undefined>(() => {
    if (!onModuleChange) return undefined;
    if (isEditing) return stageModule;
    if (enabled) return undefined;
    return (moduleId, moduleName) => void onModuleChange(moduleId, moduleName);
  }, [enabled, isEditing, onModuleChange, stageModule]);

  const { setShowAlert } = useReloadConfirmations(true, LEAVE_MESSAGE);
  useEffect(() => {
    setShowAlert(hasChanges);
  }, [hasChanges, setShowAlert]);

  return {
    isEditing,
    isSaving,
    hasChanges,
    requirement: display,
    onPatch: stagedPatch,
    onStatusChange: statusHandler,
    onModuleChange: moduleHandler,
    startEditing,
    save,
    cancel,
  };
};
