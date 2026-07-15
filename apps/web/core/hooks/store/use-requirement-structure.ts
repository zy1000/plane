import { useCallback, useMemo, useRef, useState } from "react";
import {
  RequirementStructureService,
  type TStructuredField,
  type TStructuredRow,
  type TStructuredValue,
} from "@/services/requirement-structure.service";

const requirementStructureService = new RequirementStructureService();

export const useRequirementStructure = (
  workspaceSlug?: string,
  productId?: string,
  requirementId?: string,
  revisionId?: string
) => {
  const [revision, setRevision] = useState<
    Awaited<ReturnType<typeof requirementStructureService.getRevision>> | undefined
  >();
  const [rows, setRows] = useState<TStructuredRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<unknown>();
  // 始终指向最新的 lock_version，避免连续自动保存时读到闭包里过期的乐观锁版本
  const lockVersionRef = useRef(0);

  const requireProductScope = useCallback(() => {
    if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
    return { workspaceSlug, productId };
  }, [productId, workspaceSlug]);

  const requireRevisionScope = useCallback(() => {
    const productScope = requireProductScope();
    if (!requirementId || !revisionId) throw new Error("缺少结构化修订参数");
    return { ...productScope, requirementId, revisionId };
  }, [requireProductScope, requirementId, revisionId]);

  const fetchRevision = useCallback(async () => {
    const scope = requireRevisionScope();
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await requirementStructureService.getRevision(
        scope.workspaceSlug,
        scope.productId,
        scope.requirementId,
        scope.revisionId
      );
      setRevision(response);
      lockVersionRef.current = response.lock_version;
      return response;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [requireRevisionScope]);

  const fetchRows = useCallback(
    async (params?: { cursor?: string; parent_row_key?: string; table_field_key?: string; append?: boolean }) => {
      const scope = requireRevisionScope();
      const response = await requirementStructureService.getRows(
        scope.workspaceSlug,
        scope.productId,
        scope.requirementId,
        scope.revisionId,
        { ...params, page_size: 100 }
      );
      if (!params?.parent_row_key) {
        setRows((current) => (params?.append ? [...current, ...response.data] : response.data));
        setNextCursor(response.next_cursor);
      }
      lockVersionRef.current = response.lock_version;
      setRevision((current) => (current ? { ...current, lock_version: response.lock_version } : current));
      return response;
    },
    [requireRevisionScope]
  );

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const [revisionResponse, rowResponse] = await Promise.all([fetchRevision(), fetchRows()]);
      return { revision: revisionResponse, rows: rowResponse.data };
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchRevision, fetchRows]);

  const saveSchema = useCallback(
    async (fields: TStructuredField[]) => {
      const scope = requireRevisionScope();
      if (!revision) throw new Error("字段方案尚未加载");
      setIsMutating(true);
      try {
        const response = await requirementStructureService.updateRevisionSchema(
          scope.workspaceSlug,
          scope.productId,
          scope.requirementId,
          scope.revisionId,
          lockVersionRef.current,
          fields
        );
        setRevision(response);
        lockVersionRef.current = response.lock_version;
        await fetchRows();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRows, requireRevisionScope, revision]
  );

  const createRow = useCallback(
    async (data: {
      values?: Record<string, TStructuredValue>;
      parent_row_key?: string;
      table_field_key?: string;
      before_row_key?: string;
      after_row_key?: string;
    }) => {
      const scope = requireRevisionScope();
      if (!revision) throw new Error("结构化修订尚未加载");
      setIsMutating(true);
      try {
        const response = await requirementStructureService.createRow(
          scope.workspaceSlug,
          scope.productId,
          scope.requirementId,
          scope.revisionId,
          { lock_version: lockVersionRef.current, ...data }
        );
        lockVersionRef.current = response.lock_version;
        setRevision((current) => (current ? { ...current, lock_version: response.lock_version } : current));
        if (!data.parent_row_key) await fetchRows();
        await fetchRevision();
        return response.row;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRevision, fetchRows, requireRevisionScope, revision]
  );

  const updateRow = useCallback(
    async (rowKey: string, values: Record<string, TStructuredValue>) => {
      const scope = requireRevisionScope();
      if (!revision) throw new Error("结构化修订尚未加载");
      const response = await requirementStructureService.updateRow(
        scope.workspaceSlug,
        scope.productId,
        scope.requirementId,
        scope.revisionId,
        rowKey,
        lockVersionRef.current,
        values
      );
      lockVersionRef.current = response.lock_version;
      setRevision((current) => (current ? { ...current, lock_version: response.lock_version } : current));
      setRows((current) => current.map((row) => (row.key === rowKey ? response.row : row)));
      return response.row;
    },
    [requireRevisionScope, revision]
  );

  const deleteRow = useCallback(
    async (rowKey: string, isChild = false) => {
      const scope = requireRevisionScope();
      if (!revision) throw new Error("结构化修订尚未加载");
      const response = await requirementStructureService.deleteRow(
        scope.workspaceSlug,
        scope.productId,
        scope.requirementId,
        scope.revisionId,
        rowKey,
        lockVersionRef.current
      );
      lockVersionRef.current = response.lock_version;
      setRevision((current) => (current ? { ...current, lock_version: response.lock_version } : current));
      if (!isChild) setRows((current) => current.filter((row) => row.key !== rowKey));
      await fetchRevision();
    },
    [fetchRevision, requireRevisionScope, revision]
  );

  const reorderRow = useCallback(
    async (rowKey: string, position: { before_row_key?: string; after_row_key?: string }, isChild = false) => {
      const scope = requireRevisionScope();
      if (!revision) throw new Error("结构化修订尚未加载");
      const response = await requirementStructureService.reorderRow(
        scope.workspaceSlug,
        scope.productId,
        scope.requirementId,
        scope.revisionId,
        rowKey,
        { lock_version: lockVersionRef.current, ...position }
      );
      lockVersionRef.current = response.lock_version;
      setRevision((current) => (current ? { ...current, lock_version: response.lock_version } : current));
      if (!isChild) await fetchRows();
      return response.row;
    },
    [fetchRows, requireRevisionScope, revision]
  );

  const service = useMemo(() => requirementStructureService, []);

  return {
    createRow,
    deleteRow,
    error,
    fetchRevision,
    fetchRows,
    initialize,
    isLoading,
    isMutating,
    nextCursor,
    reorderRow,
    revision,
    rows,
    saveSchema,
    service,
    updateRow,
  };
};
