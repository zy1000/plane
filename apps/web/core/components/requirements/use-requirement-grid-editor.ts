import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, isEqual } from "lodash-es";
import { useBlocker } from "react-router";
import { v4 as uuidv4 } from "uuid";
import type {
  TRequirement,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinValues,
  TRequirementData,
  TRequirementValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { FileService } from "@/services/file.service";
import { createEmptyBuiltinValues, pickBuiltinValues } from "./requirement-builtin-fields";

const fileService = new FileService();

export type TRequirementDraftRow = {
  key: string;
  mode: "create" | "update";
  /** 自定义字段值 */
  data: TRequirementData;
  /** 八个内置列的值，与 data 平级 */
  builtin: TRequirementBuiltinValues;
  originalData?: TRequirementData;
  originalBuiltin?: TRequirementBuiltinValues;
  requirementId?: string;
  clientId?: string;
  version?: number;
  /** 该行绑定的需求类型；新增行取自当前视图，已有行取自后端 */
  requirementTypeId?: string;
  isDeleted: boolean;
  isCopy?: boolean;
  /**
   * 这一行正在评审中，内容不可改。**服务端权威**（requirement.is_locked）—— 前端从
   * pending_change_request_id 反推会漏掉权限这一维。
   */
  isLocked?: boolean;
  pendingChangeType?: TRequirement["pending_change_type"];
  pendingChangeRequestId?: string | null;
};

type TBatchSaveError = {
  code?: string;
  error?: string;
  conflicts?: {
    id: string;
    reason: string;
    current_version?: number;
  }[];
};

const initialLeafValue = (field: TRequirementField): TRequirementValue => {
  if (field.default_value !== null && field.default_value !== undefined) return cloneDeep(field.default_value);
  if (field.field_type === "attachment" || field.field_type === "image") return [];
  if (field.field_type === "select" && field.config.selection_mode === "multiple") return [];
  return null;
};

export const createEmptyRequirementData = (fields: TRequirementField[]): TRequirementData =>
  Object.fromEntries(fields.map((field) => [field.id, field.field_type === "form" ? [] : initialLeafValue(field)]));

export const copyRequirementData = (
  data: TRequirementData,
  fields: TRequirementField[]
): TRequirementData => {
  const copied = cloneDeep(data);
  fields
    .filter((field) => field.field_type === "form")
    .forEach((field) => {
      const rows = copied[field.id];
      if (!Array.isArray(rows)) return;
      copied[field.id] = rows.map((row) =>
        Object.assign({}, row as TRequirementFormRow, {
          id: uuidv4(),
        })
      );
    });
  return copied;
};

const createDraftRows = (requirements: TRequirement[]): TRequirementDraftRow[] =>
  requirements.map((requirement) => ({
    key: requirement.id,
    mode: "update",
    requirementId: requirement.id,
    version: requirement.version,
    requirementTypeId: requirement.requirement_type_id,
    data: cloneDeep(requirement.data),
    builtin: pickBuiltinValues(requirement),
    originalData: cloneDeep(requirement.data),
    originalBuiltin: pickBuiltinValues(requirement),
    isDeleted: false,
    isLocked: requirement.is_locked,
    pendingChangeType: requirement.pending_change_type,
    pendingChangeRequestId: requirement.pending_change_request_id,
  }));

const collectAssetIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    if ("asset_id" in item && typeof item.asset_id === "string") return [item.asset_id];
    if ("values" in item) return Object.values((item as TRequirementFormRow).values).flatMap(collectAssetIds);
    return [];
  });
};

const getDraftAssetIds = (data: TRequirementData) => Object.values(data).flatMap(collectAssetIds);

export const useRequirementGridEditor = ({
  requirements,
  fields,
  workspaceSlug,
  createRequirementTypeId,
  discardMessage,
  onSave,
  onEditingChange,
}: {
  requirements: TRequirement[];
  fields: TRequirementField[];
  workspaceSlug: string;
  /** 新增行绑定到的类型 —— 就是当前视图的类型 */
  createRequirementTypeId?: string;
  discardMessage: string;
  onSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onEditingChange?: (isEditing: boolean) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<TRequirementDraftRow[]>([]);
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const draftRowsRef = useRef<TRequirementDraftRow[]>([]);
  const pendingAssetIdsRef = useRef<string[]>([]);

  const commitDraftRows = useCallback((nextRows: TRequirementDraftRow[]) => {
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
  }, []);

  const commitPendingAssetIds = useCallback((nextIds: string[]) => {
    pendingAssetIdsRef.current = nextIds;
    setPendingAssetIds(nextIds);
  }, []);

  const cleanupPendingAssets = useCallback(
    async (assetIds: string[] = pendingAssetIdsRef.current) => {
      const ids = [...new Set(assetIds)].filter((assetId) => pendingAssetIdsRef.current.includes(assetId));
      if (!ids.length) return;
      commitPendingAssetIds(pendingAssetIdsRef.current.filter((assetId) => !ids.includes(assetId)));
      await Promise.allSettled(ids.map((assetId) => fileService.deleteWorkspaceAsset(workspaceSlug, assetId)));
    },
    [commitPendingAssetIds, workspaceSlug]
  );

  const resetEditor = useCallback(() => {
    commitDraftRows([]);
    setSaveError(null);
    setConflictIds([]);
    setIsEditing(false);
  }, [commitDraftRows]);

  const startEditing = useCallback(() => {
    commitDraftRows(createDraftRows(requirements));
    setSaveError(null);
    setConflictIds([]);
    setIsEditing(true);
  }, [commitDraftRows, requirements]);

  const stageCreate = useCallback(
    ({
      data,
      builtin,
      beforeId,
      afterId,
      beforeKey,
      afterKey,
      isCopy = false,
      requirementTypeId,
    }: {
      data?: TRequirementData;
      builtin?: TRequirementBuiltinValues;
      beforeId?: string;
      afterId?: string;
      beforeKey?: string;
      afterKey?: string;
      isCopy?: boolean;
      /** 复制行时沿用源行的类型，其余情况用当前视图的类型 */
      requirementTypeId?: string;
    } = {}) => {
      const currentRows = isEditing ? [...draftRowsRef.current] : createDraftRows(requirements);
      const nextRow: TRequirementDraftRow = {
        key: uuidv4(),
        mode: "create",
        clientId: uuidv4(),
        requirementTypeId: requirementTypeId ?? createRequirementTypeId,
        data: data ? copyRequirementData(data, fields) : createEmptyRequirementData(fields),
        // 复制行时父项不跟着拷贝：两行互为兄弟，让副本继承同一个父项没问题，但
        // 复制的是标题与内容，父子关系由用户自己再指
        builtin: builtin ? { ...builtin } : createEmptyBuiltinValues(),
        isDeleted: false,
        isCopy,
      };
      let insertAt = currentRows.length;
      if (beforeKey || beforeId) {
        const beforeIndex = currentRows.findIndex((row) => row.key === beforeKey || row.requirementId === beforeId);
        if (beforeIndex >= 0) insertAt = beforeIndex;
      } else if (afterKey || afterId) {
        const afterIndex = currentRows.findIndex((row) => row.key === afterKey || row.requirementId === afterId);
        if (afterIndex >= 0) insertAt = afterIndex + 1;
      }
      currentRows.splice(insertAt, 0, nextRow);
      commitDraftRows(currentRows);
      setSaveError(null);
      setConflictIds([]);
      setIsEditing(true);
    },
    [commitDraftRows, createRequirementTypeId, requirements, fields, isEditing]
  );

  const updateRowData = useCallback(
    (rowKey: string, updater: (data: TRequirementData) => TRequirementData) => {
      // 评审中的行不可改。渲染层也已经降级成只读，这里是最后一道 —— 键盘操作、
      // 粘贴、撤销都会绕过渲染层。
      if (draftRowsRef.current.find((row) => row.key === rowKey)?.isLocked) return;
      commitDraftRows(
        draftRowsRef.current.map((row) => (row.key === rowKey ? { ...row, data: updater(row.data) } : row))
      );
      setSaveError(null);
      setConflictIds((current) => current.filter((id) => id !== rowKey));
    },
    [commitDraftRows]
  );

  const updateRowBuiltin = useCallback(
    (rowKey: string, patch: Partial<TRequirementBuiltinValues>) => {
      if (draftRowsRef.current.find((row) => row.key === rowKey)?.isLocked) return;
      commitDraftRows(
        draftRowsRef.current.map((row) =>
          row.key === rowKey ? { ...row, builtin: { ...row.builtin, ...patch } } : row
        )
      );
      setSaveError(null);
      setConflictIds((current) => current.filter((id) => id !== rowKey));
    },
    [commitDraftRows]
  );

  const stageDelete = useCallback(
    (rowKeys: string[]) => {
      const currentRows = isEditing ? draftRowsRef.current : createDraftRows(requirements);
      // 锁定行不能进删除队列 —— 它已经在别的变更单里了
      const keySet = new Set(
        rowKeys.filter((rowKey) => !currentRows.find((row) => row.key === rowKey)?.isLocked)
      );
      if (!keySet.size) return;
      const removedCreateRows = currentRows.filter((row) => keySet.has(row.key) && row.mode === "create");
      const pendingIdsToDelete = removedCreateRows
        .flatMap((row) => getDraftAssetIds(row.data))
        .filter((assetId) => pendingAssetIdsRef.current.includes(assetId));
      commitDraftRows(
        currentRows
          .filter((row) => !(keySet.has(row.key) && row.mode === "create"))
          .map((row) => (keySet.has(row.key) ? Object.assign({}, row, { isDeleted: true }) : row))
      );
      if (pendingIdsToDelete.length) void cleanupPendingAssets(pendingIdsToDelete);
      setSaveError(null);
      setConflictIds([]);
      setIsEditing(true);
    },
    [cleanupPendingAssets, commitDraftRows, requirements, isEditing]
  );

  const undoDelete = useCallback(
    (rowKey: string) => {
      commitDraftRows(draftRowsRef.current.map((row) => (row.key === rowKey ? { ...row, isDeleted: false } : row)));
      setSaveError(null);
      setConflictIds([]);
    },
    [commitDraftRows]
  );

  const registerPendingAsset = useCallback(
    (assetId: string) => commitPendingAssetIds([...pendingAssetIdsRef.current, assetId]),
    [commitPendingAssetIds]
  );

  const discardPendingAsset = useCallback(
    (assetId: string) => {
      if (pendingAssetIdsRef.current.includes(assetId)) void cleanupPendingAssets([assetId]);
    },
    [cleanupPendingAssets]
  );

  const dirtyRows = useMemo(
    () =>
      draftRows.filter(
        (row) =>
          !row.isLocked &&
          (row.mode === "create" ||
          row.isDeleted ||
          (row.originalData !== undefined &&
            (!isEqual(row.data, row.originalData) || !isEqual(row.builtin, row.originalBuiltin))))
      ),
    [draftRows]
  );
  const isDirty = dirtyRows.length > 0;

  const cancelEditing = useCallback(
    async (force = false) => {
      if (!force && isDirty && !window.confirm(discardMessage)) return false;
      await cleanupPendingAssets();
      resetEditor();
      return true;
    },
    [cleanupPendingAssets, discardMessage, isDirty, resetEditor]
  );

  const saveChanges = useCallback(async () => {
    if (!dirtyRows.length) return null;
    const activeRows = draftRowsRef.current.filter((row) => !row.isDeleted);
    const creates = activeRows
      .map((row, index) => {
        if (row.mode !== "create" || !row.clientId) return null;
        const nextExisting = activeRows.slice(index + 1).find((item) => item.mode === "update" && item.requirementId);
        let previousExisting: TRequirementDraftRow | undefined;
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          const item = activeRows[previousIndex];
          if (item.mode === "update" && item.requirementId) {
            previousExisting = item;
            break;
          }
        }
        const create = {
          client_id: row.clientId,
          data: row.data,
          builtin: row.builtin,
          // 标准库不用传（库本身固定了需求类型），产品需求必须传当前视图的类型
          ...(row.requirementTypeId ? { requirement_type_id: row.requirementTypeId } : {}),
        };
        if (nextExisting?.requirementId) return Object.assign(create, { before_id: nextExisting.requirementId });
        if (previousExisting?.requirementId) return Object.assign(create, { after_id: previousExisting.requirementId });
        return create;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const updates = draftRowsRef.current
      .filter(
        (row) =>
          row.mode === "update" &&
          !row.isDeleted &&
          !row.isLocked &&
          row.requirementId &&
          row.version &&
          row.originalData !== undefined &&
          (!isEqual(row.data, row.originalData) || !isEqual(row.builtin, row.originalBuiltin))
      )
      .map((row) => ({
        id: row.requirementId as string,
        version: row.version as number,
        data: row.data,
        builtin: row.builtin,
      }));
    const deletes = draftRowsRef.current
      .filter((row) => row.mode === "update" && row.isDeleted && !row.isLocked && row.requirementId && row.version)
      .map((row) => ({
        id: row.requirementId as string,
        version: row.version as number,
      }));

    setSaveError(null);
    setConflictIds([]);
    try {
      const response = await onSave({ creates, updates, deletes });
      commitPendingAssetIds([]);
      resetEditor();
      return response;
    } catch (error) {
      const payload = error as TBatchSaveError;
      setSaveError(payload?.error ?? "Unable to save requirements.");
      setConflictIds(payload?.conflicts?.map((conflict) => conflict.id) ?? []);
      throw error;
    }
  }, [commitPendingAssetIds, dirtyRows.length, onSave, resetEditor]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const blocker = useBlocker(isDirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(discardMessage)) {
      void cleanupPendingAssets();
      resetEditor();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, cleanupPendingAssets, discardMessage, resetEditor]);

  /** 服务端说这一行被别的单锁住了（409 REQUIREMENT_BATCH_CONFLICT / reason=in_review） */
  const lockedIds = useMemo(
    () =>
      draftRows
        .filter((row) => row.isLocked && row.requirementId)
        .map((row) => row.requirementId as string),
    [draftRows]
  );

  return {
    isEditing,
    isDirty,
    changedCount: dirtyRows.length,
    draftRows,
    saveError,
    conflictIds,
    lockedIds,
    pendingAssetIds,
    startEditing,
    stageCreate,
    updateRowData,
    updateRowBuiltin,
    stageDelete,
    undoDelete,
    registerPendingAsset,
    discardPendingAsset,
    cancelEditing,
    saveChanges,
  };
};
