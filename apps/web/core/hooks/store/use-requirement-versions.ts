import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementVersionDetail,
  TRequirementVersionDetailsResponse,
  TRequirementVersionsResponse,
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

const EMPTY_VERSIONS: TRequirementVersionsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

const EMPTY_DETAILS: TRequirementVersionDetailsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/**
 * 版本历史 Tab。选中版本后按需拉取快照详情，快照里的明细数组在服务端切片，
 * 所以千行需求的预览与现有明细网格是同一套分页口径。
 */
export const useRequirementVersions = ({
  workspaceSlug,
  requirementId,
  onRequirementUpdate,
}: {
  workspaceSlug: string | undefined;
  requirementId: string | undefined;
  onRequirementUpdate?: (requirement: TRequirement) => void;
}) => {
  const [versionsPage, setVersionsPage] = useState<TRequirementVersionsResponse>(EMPTY_VERSIONS);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [versionDetail, setVersionDetail] = useState<TRequirementVersionDetail | null>(null);
  const [detailsPage, setDetailsPage] = useState<TRequirementVersionDetailsResponse>(EMPTY_DETAILS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && requirementId));
  const [isVersionLoading, setIsVersionLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  const [detailsCursor, setDetailsCursor] = useState<string | undefined>();
  const [detailsPerPage, setDetailsPerPage] = useState(20);
  // 「与当前对比」的另一侧。当前发布内容就是 current_version 那份快照，所以对比两侧
  // 走的是同一个分页端点，不需要额外把上千行明细拉到前端。
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [comparePage, setComparePage] = useState<TRequirementVersionDetailsResponse>(EMPTY_DETAILS);

  const fetchVersions = useCallback(async () => {
    if (!workspaceSlug || !requirementId) return EMPTY_VERSIONS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listVersions(workspaceSlug, requirementId, { cursor, perPage });
      setVersionsPage(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load requirement versions."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [cursor, perPage, requirementId, workspaceSlug]);

  useEffect(() => {
    void fetchVersions().catch(() => undefined);
  }, [fetchVersions]);

  // 默认选中最新版本（列表按 version 倒序）
  useEffect(() => {
    setSelectedVersion((current) => {
      if (current !== null && versionsPage.results.some((item) => item.version === current)) return current;
      return versionsPage.results[0]?.version ?? null;
    });
  }, [versionsPage]);

  const fetchVersionDetail = useCallback(async () => {
    if (!workspaceSlug || !requirementId || selectedVersion === null) {
      setVersionDetail(null);
      return null;
    }
    setIsVersionLoading(true);
    try {
      const response = await requirementService.getVersion(workspaceSlug, requirementId, selectedVersion);
      setVersionDetail(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load the version snapshot."));
      throw requestError;
    } finally {
      setIsVersionLoading(false);
    }
  }, [requirementId, selectedVersion, workspaceSlug]);

  const fetchVersionDetails = useCallback(async () => {
    if (!workspaceSlug || !requirementId || selectedVersion === null) {
      setDetailsPage(EMPTY_DETAILS);
      return EMPTY_DETAILS;
    }
    setIsDetailsLoading(true);
    setDetailsError(null);
    try {
      const response = await requirementService.listVersionDetails(workspaceSlug, requirementId, selectedVersion, {
        cursor: detailsCursor,
        perPage: detailsPerPage,
      });
      setDetailsPage(response);
      return response;
    } catch (requestError) {
      setDetailsError(getErrorMessage(requestError, "Unable to load the version snapshot rows."));
      throw requestError;
    } finally {
      setIsDetailsLoading(false);
    }
  }, [detailsCursor, detailsPerPage, requirementId, selectedVersion, workspaceSlug]);

  const fetchComparisonDetails = useCallback(async () => {
    if (!workspaceSlug || !requirementId || compareVersion === null) {
      setComparePage(EMPTY_DETAILS);
      return EMPTY_DETAILS;
    }
    const response = await requirementService.listVersionDetails(workspaceSlug, requirementId, compareVersion, {
      cursor: detailsCursor,
      perPage: detailsPerPage,
    });
    setComparePage(response);
    return response;
  }, [compareVersion, detailsCursor, detailsPerPage, requirementId, workspaceSlug]);

  useEffect(() => {
    void fetchVersionDetail().catch(() => undefined);
  }, [fetchVersionDetail]);

  useEffect(() => {
    void fetchVersionDetails().catch(() => undefined);
  }, [fetchVersionDetails]);

  useEffect(() => {
    void fetchComparisonDetails().catch(() => undefined);
  }, [fetchComparisonDetails]);

  const selectVersion = useCallback((version: number | null) => {
    setDetailsCursor(undefined);
    setSelectedVersion(version);
  }, []);

  /** 回滚只是把历史快照灌入工作副本，需求会回到草稿态，仍需再走一次审批 */
  const rollbackToVersion = useCallback(
    async (version: number) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.rollbackToVersion(workspaceSlug, requirementId, version);
        onRequirementUpdate?.(response.requirement);
        return response.requirement;
      } finally {
        setIsMutating(false);
      }
    },
    [onRequirementUpdate, requirementId, workspaceSlug]
  );

  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);
  const updateDetailsPerPage = useCallback((value: number) => {
    setDetailsCursor(undefined);
    setDetailsPerPage(value);
  }, []);

  return {
    versionsPage,
    selectedVersion,
    versionDetail,
    detailsPage,
    compareVersion,
    comparePage,
    setCompareVersion,
    isLoading,
    isVersionLoading,
    isDetailsLoading,
    isMutating,
    error,
    detailsError,
    cursor,
    perPage,
    detailsCursor,
    detailsPerPage,
    setCursor,
    setPerPage: updatePerPage,
    setDetailsCursor,
    setDetailsPerPage: updateDetailsPerPage,
    selectVersion,
    fetchVersions,
    fetchVersionDetail,
    fetchVersionDetails,
    rollbackToVersion,
  };
};
