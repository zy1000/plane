import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, isEqual } from "lodash-es";
import { useBlocker } from "react-router";
import { v4 as uuidv4 } from "uuid";
import type {
  TRequirementDetail,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailBatchSaveResponse,
  TRequirementDetailData,
  TRequirementDetailValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { FileService } from "@/services/file.service";

const fileService = new FileService();

export type TRequirementDetailDraftRow = {
  key: string;
  mode: "create" | "update";
  data: TRequirementDetailData;
  originalData?: TRequirementDetailData;
  detailId?: string;
  clientId?: string;
  version?: number;
  isDeleted: boolean;
  isCopy?: boolean;
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

const initialLeafValue = (field: TRequirementField): TRequirementDetailValue => {
  if (field.default_value !== null && field.default_value !== undefined) return cloneDeep(field.default_value);
  if (field.field_type === "attachment" || field.field_type === "image") return [];
  if (field.field_type === "select" && field.config.selection_mode === "multiple") return [];
  return null;
};

export const createEmptyRequirementDetailData = (fields: TRequirementField[]): TRequirementDetailData =>
  Object.fromEntries(fields.map((field) => [field.id, field.field_type === "form" ? [] : initialLeafValue(field)]));

export const copyRequirementDetailData = (
  data: TRequirementDetailData,
  fields: TRequirementField[]
): TRequirementDetailData => {
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

const createDraftRows = (details: TRequirementDetail[]): TRequirementDetailDraftRow[] =>
  details.map((detail) => ({
    key: detail.id,
    mode: "update",
    detailId: detail.id,
    version: detail.version,
    data: cloneDeep(detail.data),
    originalData: cloneDeep(detail.data),
    isDeleted: false,
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

const getDraftAssetIds = (data: TRequirementDetailData) => Object.values(data).flatMap(collectAssetIds);

export const useRequirementDetailGridEditor = ({
  details,
  fields,
  workspaceSlug,
  expectedUpdatedAt,
  discardMessage,
  onSave,
  onEditingChange,
}: {
  details: TRequirementDetail[];
  fields: TRequirementField[];
  workspaceSlug: string;
  expectedUpdatedAt?: string;
  discardMessage: string;
  onSave: (payload: TRequirementDetailBatchSavePayload) => Promise<TRequirementDetailBatchSaveResponse>;
  onEditingChange?: (isEditing: boolean) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<TRequirementDetailDraftRow[]>([]);
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const draftRowsRef = useRef<TRequirementDetailDraftRow[]>([]);
  const pendingAssetIdsRef = useRef<string[]>([]);

  const commitDraftRows = useCallback((nextRows: TRequirementDetailDraftRow[]) => {
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
    commitDraftRows(createDraftRows(details));
    setSaveError(null);
    setConflictIds([]);
    setIsEditing(true);
  }, [commitDraftRows, details]);

  const stageCreate = useCallback(
    ({
      data,
      beforeId,
      afterId,
      beforeKey,
      afterKey,
      isCopy = false,
    }: {
      data?: TRequirementDetailData;
      beforeId?: string;
      afterId?: string;
      beforeKey?: string;
      afterKey?: string;
      isCopy?: boolean;
    } = {}) => {
      const currentRows = isEditing ? [...draftRowsRef.current] : createDraftRows(details);
      const nextRow: TRequirementDetailDraftRow = {
        key: uuidv4(),
        mode: "create",
        clientId: uuidv4(),
        data: data ? copyRequirementDetailData(data, fields) : createEmptyRequirementDetailData(fields),
        isDeleted: false,
        isCopy,
      };
      let insertAt = currentRows.length;
      if (beforeKey || beforeId) {
        const beforeIndex = currentRows.findIndex((row) => row.key === beforeKey || row.detailId === beforeId);
        if (beforeIndex >= 0) insertAt = beforeIndex;
      } else if (afterKey || afterId) {
        const afterIndex = currentRows.findIndex((row) => row.key === afterKey || row.detailId === afterId);
        if (afterIndex >= 0) insertAt = afterIndex + 1;
      }
      currentRows.splice(insertAt, 0, nextRow);
      commitDraftRows(currentRows);
      setSaveError(null);
      setConflictIds([]);
      setIsEditing(true);
    },
    [commitDraftRows, details, fields, isEditing]
  );

  const updateRowData = useCallback(
    (rowKey: string, updater: (data: TRequirementDetailData) => TRequirementDetailData) => {
      commitDraftRows(
        draftRowsRef.current.map((row) => (row.key === rowKey ? { ...row, data: updater(row.data) } : row))
      );
      setSaveError(null);
      setConflictIds((current) => current.filter((id) => id !== rowKey));
    },
    [commitDraftRows]
  );

  const stageDelete = useCallback(
    (rowKeys: string[]) => {
      const currentRows = isEditing ? draftRowsRef.current : createDraftRows(details);
      const keySet = new Set(rowKeys);
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
    [cleanupPendingAssets, commitDraftRows, details, isEditing]
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
          row.mode === "create" ||
          row.isDeleted ||
          (row.originalData !== undefined && !isEqual(row.data, row.originalData))
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
    if (!expectedUpdatedAt || !dirtyRows.length) return null;
    const activeRows = draftRowsRef.current.filter((row) => !row.isDeleted);
    const creates = activeRows
      .map((row, index) => {
        if (row.mode !== "create" || !row.clientId) return null;
        const nextExisting = activeRows.slice(index + 1).find((item) => item.mode === "update" && item.detailId);
        let previousExisting: TRequirementDetailDraftRow | undefined;
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          const item = activeRows[previousIndex];
          if (item.mode === "update" && item.detailId) {
            previousExisting = item;
            break;
          }
        }
        const create = {
          client_id: row.clientId,
          data: row.data,
        };
        if (nextExisting?.detailId) return Object.assign(create, { before_id: nextExisting.detailId });
        if (previousExisting?.detailId) return Object.assign(create, { after_id: previousExisting.detailId });
        return create;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const updates = draftRowsRef.current
      .filter(
        (row) =>
          row.mode === "update" &&
          !row.isDeleted &&
          row.detailId &&
          row.version &&
          row.originalData !== undefined &&
          !isEqual(row.data, row.originalData)
      )
      .map((row) => ({
        id: row.detailId as string,
        version: row.version as number,
        data: row.data,
      }));
    const deletes = draftRowsRef.current
      .filter((row) => row.mode === "update" && row.isDeleted && row.detailId && row.version)
      .map((row) => ({
        id: row.detailId as string,
        version: row.version as number,
      }));

    setSaveError(null);
    setConflictIds([]);
    try {
      const response = await onSave({
        expected_updated_at: expectedUpdatedAt,
        creates,
        updates,
        deletes,
      });
      commitPendingAssetIds([]);
      resetEditor();
      return response;
    } catch (error) {
      const payload = error as TBatchSaveError;
      setSaveError(payload?.error ?? "Unable to save requirement details.");
      setConflictIds(payload?.conflicts?.map((conflict) => conflict.id) ?? []);
      throw error;
    }
  }, [commitPendingAssetIds, dirtyRows.length, expectedUpdatedAt, onSave, resetEditor]);

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

  return {
    isEditing,
    isDirty,
    changedCount: dirtyRows.length,
    draftRows,
    saveError,
    conflictIds,
    pendingAssetIds,
    startEditing,
    stageCreate,
    updateRowData,
    stageDelete,
    undoDelete,
    registerPendingAsset,
    discardPendingAsset,
    cancelEditing,
    saveChanges,
  };
};
