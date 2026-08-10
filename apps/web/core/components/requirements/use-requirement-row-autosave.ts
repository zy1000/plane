import { useCallback, useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash-es";
import type {
  TRequirement,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinValues,
  TRequirementData,
} from "@plane/types";
import { pickBuiltinValues } from "./requirement-builtin-fields";

/**
 * 已有需求行的「改一格存一格」。
 *
 * 取代原先的「点编辑 -> 攒一批草稿 -> 点保存更改」：单元格改完立即提交这一行，
 * 与工作项电子表格一致。新增行不走这里 —— 后端建行时强制校验必填字段
 * （serializers/requirement.py 的 enforce_required），空行第一次自动保存就会被
 * 打回来，所以新增走弹窗，填齐了一次落库。
 *
 * ## 为什么要按行串行
 *
 * 后端 bulk_save 的 update 是乐观锁：命中 version 才写，写完 version += 1
 * （utils/requirement.py 的 save_requirement_row_batch）。所以连着改同一行的两格，
 * 第二次必须带上第一次返回的新 version，否则必然 409 version_conflict。
 * 这里给每行挂一条 Promise 链，把该行的保存排成队，并在每次成功后回写 version。
 *
 * 不同行之间不互相阻塞 —— 它们各有各的 version。
 */

export type TRequirementRowSaveState = {
  isSaving: boolean;
  /** 保存失败的原因，展示在该行上。成功后清掉 */
  error: string | null;
};

type TLocalRow = {
  data: TRequirementData;
  builtin: TRequirementBuiltinValues;
  version: number;
};

type TBatchSaveError = {
  error?: string;
  code?: string;
  conflicts?: { id: string; reason: string; current_version?: number }[];
};

const toLocalRow = (requirement: TRequirement): TLocalRow => ({
  data: cloneDeep(requirement.data),
  builtin: pickBuiltinValues(requirement),
  version: requirement.version,
});

export const useRequirementRowAutosave = ({
  requirements,
  onSave,
}: {
  requirements: TRequirement[];
  /**
   * 保存这一行。落库后由 store 把服务端返回的整行回填进当前页（见
   * use-product-requirements 的 saveRequirementBatch），不重拉列表 —— 重拉会让
   * 骨架屏顶掉表格，横向滚动位置随之归零。回填后的列表会经由 requirements
   * 走到下面的重新播种 effect。
   */
  onSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
}) => {
  const [localRows, setLocalRows] = useState<Record<string, TLocalRow>>({});
  const [saveStates, setSaveStates] = useState<Record<string, TRequirementRowSaveState>>({});

  /**
   * 渲染读 state，保存读 ref。保存是在 Promise 链里异步跑的，那时候拿到的 state
   * 闭包已经是旧的了，必须从 ref 取当下最新的值。
   */
  const localRowsRef = useRef<Record<string, TLocalRow>>({});
  const queuesRef = useRef<Record<string, Promise<void>>>({});
  /** 有未落地的改动的行。服务端数据回来时不能拿它盖掉正在编辑的值 */
  const dirtyIdsRef = useRef<Set<string>>(new Set());

  const commitLocalRows = useCallback((next: Record<string, TLocalRow>) => {
    localRowsRef.current = next;
    setLocalRows(next);
  }, []);

  /**
   * 服务端列表变了就重新播种，但**跳过有未落地改动的行** —— 翻页、搜索、别处
   * 触发的刷新都会走到这里，不能把用户刚敲进去还没存完的值冲掉。
   */
  useEffect(() => {
    const next: Record<string, TLocalRow> = {};
    requirements.forEach((requirement) => {
      const pending = dirtyIdsRef.current.has(requirement.id) ? localRowsRef.current[requirement.id] : undefined;
      next[requirement.id] = pending ?? toLocalRow(requirement);
    });
    commitLocalRows(next);
  }, [commitLocalRows, requirements]);

  const setSaveState = useCallback((requirementId: string, patch: Partial<TRequirementRowSaveState>) => {
    setSaveStates((current) => ({
      ...current,
      [requirementId]: { isSaving: false, error: null, ...current[requirementId], ...patch },
    }));
  }, []);

  /**
   * 把这一行当下的值发出去。队列保证同一行不会有两个 flush 并发，所以这里读到的
   * version 一定是上一次保存回写过的。
   */
  const flushRow = useCallback(
    async (requirementId: string) => {
      const row = localRowsRef.current[requirementId];
      if (!row) return;

      setSaveState(requirementId, { isSaving: true, error: null });
      try {
        const response = await onSave({
          creates: [],
          updates: [{ id: requirementId, version: row.version, data: row.data, builtin: row.builtin }],
          deletes: [],
        });

        /*
         * 这一行在保存期间有没有又被改过：updateData / updateBuiltin 每次都换一个新的
         * 行对象，所以引用没变就说明发出去的那份仍是当下最新的。
         *
         * 必须在下面回写 version 之前判断 —— 那一步同样会换掉行对象。
         */
        const isUnchangedSinceSend = localRowsRef.current[requirementId] === row;

        const saved = response.updated?.find((item) => item.id === requirementId);
        if (saved) {
          // 回写 version，否则这一行的下一次改动必然撞 409
          const latest = localRowsRef.current[requirementId];
          commitLocalRows({
            ...localRowsRef.current,
            [requirementId]: { ...(latest ?? toLocalRow(saved)), version: saved.version },
          });
        }
        /*
         * 只有「发出去之后没再改过」才摘掉 dirty。第一格还没存完就改了同一行的第二格
         * 时，第二次改动已经排在队列里等着发，此时若把 dirty 清掉，服务端数据一回来
         * 重新播种就会把这一行当成干净行、拿旧值盖掉第二格。留着 dirty，等排在后面的
         * 那次 flush 成功了再摘。
         */
        if (isUnchangedSinceSend) dirtyIdsRef.current.delete(requirementId);
        setSaveState(requirementId, { isSaving: false, error: null });
      } catch (error) {
        const payload = error as TBatchSaveError;
        const reason = payload?.conflicts?.find((conflict) => conflict.id === requirementId)?.reason;
        /*
         * 冲突不静默吞掉，也不拿服务端值盖掉用户输入 —— 让改动留在格子里，把原因
         * 摆出来由人决定。in_review 是这一行已经进了别的变更单，刷新也改不了。
         */
        setSaveState(requirementId, {
          isSaving: false,
          error: reason ?? payload?.error ?? "Unable to save this requirement.",
        });
      }
    },
    [commitLocalRows, onSave, setSaveState]
  );

  /** 把这一行排进它自己的保存队列。同一行先来后到，不同行互不阻塞 */
  const enqueueSave = useCallback(
    (requirementId: string) => {
      dirtyIdsRef.current.add(requirementId);
      const previous = queuesRef.current[requirementId] ?? Promise.resolve();
      const next = previous.then(() => flushRow(requirementId)).catch(() => undefined);
      queuesRef.current[requirementId] = next;
    },
    [flushRow]
  );

  const updateBuiltin = useCallback(
    (requirementId: string, patch: Partial<TRequirementBuiltinValues>) => {
      const row = localRowsRef.current[requirementId];
      if (!row) return;
      commitLocalRows({
        ...localRowsRef.current,
        [requirementId]: { ...row, builtin: { ...row.builtin, ...patch } },
      });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave]
  );

  const updateData = useCallback(
    (requirementId: string, updater: (data: TRequirementData) => TRequirementData) => {
      const row = localRowsRef.current[requirementId];
      if (!row) return;
      commitLocalRows({
        ...localRowsRef.current,
        [requirementId]: { ...row, data: updater(row.data) },
      });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave]
  );

  /** 冲突后重试：拿服务端最新的 version 重发一次当前的本地值 */
  const retryRow = useCallback(
    (requirementId: string, latestVersion: number) => {
      const row = localRowsRef.current[requirementId];
      if (!row) return;
      commitLocalRows({ ...localRowsRef.current, [requirementId]: { ...row, version: latestVersion } });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave]
  );

  const getRow = useCallback((requirementId: string) => localRows[requirementId], [localRows]);
  const getSaveState = useCallback(
    (requirementId: string): TRequirementRowSaveState =>
      saveStates[requirementId] ?? { isSaving: false, error: null },
    [saveStates]
  );

  return { getRow, getSaveState, updateBuiltin, updateData, retryRow };
};
