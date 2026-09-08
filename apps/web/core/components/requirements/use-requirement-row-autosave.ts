import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 *
 * ## 为什么不预先播种
 *
 * 本地行（localRows）只在某一行真被编辑时才建：渲染走 getRow，没有本地行就直接看
 * requirements 里的那条（不克隆）。原先是 requirements 一变就给全部行 cloneDeep 一份再
 * setState —— 首屏 20 行意味着表格刚画完立刻再整表渲一遍（实测 ~370ms 冻结），而那一遍
 * 的输出与第一遍完全相同。
 */

export type TRequirementRowSaveState = {
  isSaving: boolean;
  /** 保存失败的原因，展示在该行上。成功后清掉 */
  error: string | null;
};

type TLocalRow = {
  data: TRequirementData;
  builtin: TRequirementBuiltinValues;
  /** 库条目手填编号；产品行恒 null（flush 时 null/空白不随载荷发出） */
  code: string | null;
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
  code: requirement.code ?? null,
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
   * 走到下面的收缩 effect，把已经落地的本地行丢掉。
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

  const requirementsById = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement])),
    [requirements]
  );

  /**
   * 服务端列表变了：丢掉不再需要的本地行，但**保留有未落地改动的行** —— 翻页、搜索、
   * 别处触发的刷新都会走到这里，不能把用户刚敲进去还没存完的值冲掉。
   *
   * 只收缩不扩张：非 dirty 行本来就该镜像 requirements，丢掉后 getRow 自然落回服务端值。
   * 一行都不用丢时不碰 state（首屏就是这种情况），否则等于白让整张表重渲一遍。
   * 保留下来的行必须复用原对象 —— flushRow 靠引用相等判断「发出去之后有没有再改」。
   */
  useEffect(() => {
    const next: Record<string, TLocalRow> = {};
    let dropped = false;
    Object.entries(localRowsRef.current).forEach(([requirementId, row]) => {
      if (dirtyIdsRef.current.has(requirementId) && requirementsById.has(requirementId)) next[requirementId] = row;
      else dropped = true;
    });
    if (dropped) commitLocalRows(next);
  }, [commitLocalRows, requirementsById]);

  /** 取这一行的本地副本；还没有就从服务端那条克隆一份 —— 只在真要改的时候才克隆 */
  const seedRow = useCallback(
    (requirementId: string): TLocalRow | undefined => {
      const existing = localRowsRef.current[requirementId];
      if (existing) return existing;
      const requirement = requirementsById.get(requirementId);
      return requirement ? toLocalRow(requirement) : undefined;
    },
    [requirementsById]
  );

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
          updates: [
            {
              id: requirementId,
              version: row.version,
              data: row.data,
              builtin: row.builtin,
              // 编号只在库作用域存在；产品行恒 null，不进载荷（后端会拒绝）
              ...(row.code != null && row.code.trim() !== "" ? { code: row.code } : {}),
            },
          ],
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
         * 摆出来由人决定。reason 目前有三种：version_conflict（别人先改了）、
         * in_review（这一行已经进了别的变更单，刷新也改不了）、closed（需求已关闭，
         * 内容只读 —— 网格本不该放行编辑，撞上说明列表里的 status 已过期，重拉即可）。
         * 三者都按原样字符串展示，新增的 reason 不需要在这里登记。
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
      const row = seedRow(requirementId);
      if (!row) return;
      commitLocalRows({
        ...localRowsRef.current,
        [requirementId]: { ...row, builtin: { ...row.builtin, ...patch } },
      });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave, seedRow]
  );

  const updateData = useCallback(
    (requirementId: string, updater: (data: TRequirementData) => TRequirementData) => {
      const row = seedRow(requirementId);
      if (!row) return;
      commitLocalRows({
        ...localRowsRef.current,
        [requirementId]: { ...row, data: updater(row.data) },
      });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave, seedRow]
  );

  /** 库条目行内改编号：覆盖本地值并排队保存。空值由调用方拦下，不要传进来 */
  const updateCode = useCallback(
    (requirementId: string, code: string) => {
      const row = seedRow(requirementId);
      if (!row) return;
      commitLocalRows({ ...localRowsRef.current, [requirementId]: { ...row, code } });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave, seedRow]
  );

  /** 冲突后重试：拿服务端最新的 version 重发一次当前的本地值 */
  const retryRow = useCallback(
    (requirementId: string, latestVersion: number) => {
      const row = seedRow(requirementId);
      if (!row) return;
      commitLocalRows({ ...localRowsRef.current, [requirementId]: { ...row, version: latestVersion } });
      enqueueSave(requirementId);
    },
    [commitLocalRows, enqueueSave, seedRow]
  );

  /**
   * 渲染读的行：有本地副本用本地副本，没有就直接看服务端那条（不克隆，调用方只读）。
   * 依赖里必须带 requirementsById —— 只改 store 不动本地行的更新（详情抽屉回填、翻页）
   * 不会换 localRows，得靠它让网格拿到新值。
   */
  const getRow = useCallback(
    (requirementId: string): TLocalRow | undefined => {
      const local = localRows[requirementId];
      if (local) return local;
      const requirement = requirementsById.get(requirementId);
      if (!requirement) return undefined;
      return {
        data: requirement.data,
        builtin: pickBuiltinValues(requirement),
        code: requirement.code ?? null,
        version: requirement.version,
      };
    },
    [localRows, requirementsById]
  );
  const getSaveState = useCallback(
    (requirementId: string): TRequirementRowSaveState =>
      saveStates[requirementId] ?? { isSaving: false, error: null },
    [saveStates]
  );

  return { getRow, getSaveState, updateBuiltin, updateData, updateCode, retryRow };
};
