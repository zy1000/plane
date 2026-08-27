import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementBaseline,
  TRequirementBaselineCompareResponse,
  TRequirementBaselineCreated,
  TRequirementBaselineEntriesResponse,
  TRequirementBaselinePayload,
  TRequirementBaselinePreview,
  TRequirementBaselinesResponse,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  return fallback;
};

const EMPTY_BASELINES: TRequirementBaselinesResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

const EMPTY_ENTRIES: TRequirementBaselineEntriesResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/** 基线列表 + 打基线 / 改名 / 删除。基线内容不可改，所以这里没有「编辑条目」这回事 */
export const useRequirementBaselines = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const [baselinesPage, setBaselinesPage] = useState<TRequirementBaselinesResponse>(EMPTY_BASELINES);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchBaselines = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_BASELINES;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listBaselines(workspaceSlug, productId, { cursor, perPage });
      setBaselinesPage(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load baselines."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [cursor, perPage, productId, workspaceSlug]);

  useEffect(() => {
    void fetchBaselines().catch(() => undefined);
  }, [fetchBaselines]);

  /**
   * 打基线前先算一遍。
   *
   * 与真正落库共用服务端同一份判定，所以预览说的数字就是最后会写进去的数字 ——
   * 「将纳入 128 条」不会在确认之后变成 126 条。
   */
  const previewBaseline = useCallback(
    async (payload: TRequirementBaselinePayload = {}): Promise<TRequirementBaselinePreview> => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      return requirementService.previewBaseline(workspaceSlug, productId, payload);
    },
    [productId, workspaceSlug]
  );

  const createBaseline = useCallback(
    async (payload: TRequirementBaselinePayload): Promise<TRequirementBaselineCreated> => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createBaseline(workspaceSlug, productId, payload);
        await fetchBaselines().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchBaselines, productId, workspaceSlug]
  );

  const renameBaseline = useCallback(
    async (baselineId: string, payload: { name?: string; description?: string }): Promise<TRequirementBaseline> => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateBaseline(workspaceSlug, productId, baselineId, payload);
        setBaselinesPage((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === response.id ? { ...item, ...response } : item)),
        }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const deleteBaseline = useCallback(
    async (baselineId: string) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        await requirementService.deleteBaseline(workspaceSlug, productId, baselineId);
        await fetchBaselines().catch(() => undefined);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchBaselines, productId, workspaceSlug]
  );

  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    baselinesPage,
    isLoading,
    isMutating,
    error,
    cursor,
    perPage,
    setCursor,
    setPerPage: updatePerPage,
    fetchBaselines,
    previewBaseline,
    createBaseline,
    renameBaseline,
    deleteBaseline,
  };
};

/** 一份基线的详情与它收录的条目。条目内容取自被收录的那一版，不跟随需求现状 */
export const useRequirementBaselineDetail = ({
  workspaceSlug,
  productId,
  baselineId,
  requirementTypeId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  baselineId: string | undefined;
  requirementTypeId?: string;
}) => {
  const isScoped = Boolean(workspaceSlug && productId && baselineId);
  const [baseline, setBaseline] = useState<TRequirementBaseline | null>(null);
  const [entriesPage, setEntriesPage] = useState<TRequirementBaselineEntriesResponse>(EMPTY_ENTRIES);
  const [isLoading, setIsLoading] = useState(isScoped);
  const [isEntriesLoading, setIsEntriesLoading] = useState(isScoped);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchBaseline = useCallback(async () => {
    if (!workspaceSlug || !productId || !baselineId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.getBaseline(workspaceSlug, productId, baselineId);
      setBaseline(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load the baseline."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [baselineId, productId, workspaceSlug]);

  const fetchEntries = useCallback(async () => {
    if (!workspaceSlug || !productId || !baselineId) return EMPTY_ENTRIES;
    setIsEntriesLoading(true);
    try {
      const response = await requirementService.listBaselineRequirements(workspaceSlug, productId, baselineId, {
        cursor,
        perPage,
        requirementTypeId,
      });
      setEntriesPage(response);
      return response;
    } finally {
      setIsEntriesLoading(false);
    }
  }, [baselineId, cursor, perPage, productId, requirementTypeId, workspaceSlug]);

  useEffect(() => {
    void fetchBaseline().catch(() => undefined);
  }, [fetchBaseline]);

  useEffect(() => {
    void fetchEntries().catch(() => undefined);
  }, [fetchEntries]);

  useEffect(() => setCursor(undefined), [requirementTypeId]);

  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    baseline,
    entriesPage,
    isLoading,
    isEntriesLoading,
    error,
    cursor,
    perPage,
    setCursor,
    setPerPage: updatePerPage,
    fetchBaseline,
  };
};

/** 两份基线的差异。差异条目的形状与变更项一致，直接喂给现成的 diff 渲染器 */
export const useRequirementBaselineCompare = ({
  workspaceSlug,
  productId,
  baselineId,
  toBaselineId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  baselineId: string | undefined;
  toBaselineId: string | undefined;
}) => {
  const isScoped = Boolean(workspaceSlug && productId && baselineId && toBaselineId);
  const [comparison, setComparison] = useState<TRequirementBaselineCompareResponse | null>(null);
  const [isLoading, setIsLoading] = useState(isScoped);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchComparison = useCallback(async () => {
    if (!workspaceSlug || !productId || !baselineId || !toBaselineId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.compareBaselines(workspaceSlug, productId, baselineId, toBaselineId, {
        cursor,
        perPage,
      });
      setComparison(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to compare the baselines."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [baselineId, cursor, perPage, productId, toBaselineId, workspaceSlug]);

  useEffect(() => {
    void fetchComparison().catch(() => undefined);
  }, [fetchComparison]);

  useEffect(() => setCursor(undefined), [baselineId, toBaselineId]);

  return {
    comparison,
    isLoading,
    error,
    cursor,
    perPage,
    setCursor,
    setPerPage,
  };
};
