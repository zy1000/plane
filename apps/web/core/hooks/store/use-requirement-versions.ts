import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementChangeType,
  TRequirementVersionComparisonResponse,
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
 *
 * `requirementTypeId` 由调用方（URL query）持有：产品需求的快照是多个类型拼接的，明细必须
 * 在服务端按模板裁完再切片，否则一页里混着别的模板的行。
 */
export const useRequirementVersions = ({
  workspaceSlug,
  requirementId,
  currentVersion,
  changeType,
  requirementTypeId,
  onRequirementUpdate,
}: {
  workspaceSlug: string | undefined;
  requirementId: string | undefined;
  currentVersion: number | null;
  changeType?: TRequirementChangeType;
  requirementTypeId?: string;
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
  // 对比目标（to）：默认已发布 current_version 的快照，可切换为任意历史版本；
  // 永远不读取可能存在的草稿层。
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [comparisonPage, setComparisonPage] = useState<TRequirementVersionComparisonResponse | null>(null);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonCursor, setComparisonCursor] = useState<string | undefined>();
  const [comparisonPerPage, setComparisonPerPage] = useState(20);

  const selectVersion = useCallback(
    (version: number | null) => {
      // 同一版本重复点击不能清掉已加载的快照：selectedVersion 不变时
      // fetchVersionDetail 的 effect 不会重跑，右侧会永久卡在骨架屏。
      if (version === selectedVersion) return;
      setDetailsCursor(undefined);
      setComparisonCursor(undefined);
      setVersionDetail(null);
      setDetailsPage(EMPTY_DETAILS);
      setComparisonPage(null);
      setError(null);
      setDetailsError(null);
      setComparisonError(null);
      setIsVersionLoading(version !== null);
      setIsDetailsLoading(version !== null && compareVersion === null);
      setIsComparisonLoading(version !== null && compareVersion !== null);
      setSelectedVersion(version);
    },
    [compareVersion, selectedVersion]
  );

  const selectCompareVersion = useCallback((version: number | null) => {
    setComparisonCursor(undefined);
    setComparisonPage(null);
    setComparisonError(null);
    setIsComparisonLoading(version !== null);
    setCompareVersion(version);
  }, []);

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
    if (selectedVersion !== null && versionsPage.results.some((item) => item.version === selectedVersion)) return;
    selectVersion(versionsPage.results[0]?.version ?? null);
  }, [selectVersion, selectedVersion, versionsPage]);

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
        requirementTypeId,
      });
      setDetailsPage(response);
      return response;
    } catch (requestError) {
      setDetailsError(getErrorMessage(requestError, "Unable to load the version snapshot rows."));
      throw requestError;
    } finally {
      setIsDetailsLoading(false);
    }
  }, [detailsCursor, detailsPerPage, requirementId, selectedVersion, requirementTypeId, workspaceSlug]);

  useEffect(() => {
    void fetchVersionDetail().catch(() => undefined);
  }, [fetchVersionDetail]);

  useEffect(() => {
    if (compareVersion !== null) return;
    void fetchVersionDetails().catch(() => undefined);
  }, [compareVersion, fetchVersionDetails]);

  const fetchComparison = useCallback(async () => {
    if (!workspaceSlug || !requirementId || selectedVersion === null || compareVersion === null) {
      setComparisonPage(null);
      return null;
    }
    setIsComparisonLoading(true);
    setComparisonError(null);
    try {
      const response = await requirementService.compareVersions(
        workspaceSlug,
        requirementId,
        selectedVersion,
        {
          toVersion: compareVersion ?? undefined,
          cursor: comparisonCursor,
          perPage: comparisonPerPage,
          changeType,
          requirementTypeId,
        }
      );
      setComparisonPage(response);
      return response;
    } catch (requestError) {
      setComparisonError(getErrorMessage(requestError, "Unable to compare requirement versions."));
      throw requestError;
    } finally {
      setIsComparisonLoading(false);
    }
  }, [
    changeType,
    compareVersion,
    comparisonCursor,
    comparisonPerPage,
    requirementId,
    selectedVersion,
    requirementTypeId,
    workspaceSlug,
  ]);

  useEffect(() => {
    if (compareVersion === null) return;
    void fetchComparison().catch(() => undefined);
  }, [compareVersion, fetchComparison]);

  // 换模板等于换了数据集，旧游标指向的页在新数据集里没有意义
  useEffect(() => {
    setDetailsCursor(undefined);
    setComparisonCursor(undefined);
  }, [requirementTypeId]);

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
  const updateComparisonPerPage = useCallback((value: number) => {
    setComparisonCursor(undefined);
    setComparisonPerPage(value);
  }, []);

  return {
    versionsPage,
    selectedVersion,
    versionDetail,
    detailsPage,
    compareVersion,
    comparisonPage,
    setCompareVersion: selectCompareVersion,
    isLoading,
    isVersionLoading,
    isDetailsLoading,
    isComparisonLoading,
    isMutating,
    error,
    detailsError,
    comparisonError,
    cursor,
    perPage,
    detailsCursor,
    detailsPerPage,
    comparisonCursor,
    comparisonPerPage,
    setCursor,
    setPerPage: updatePerPage,
    setDetailsCursor,
    setDetailsPerPage: updateDetailsPerPage,
    setComparisonCursor,
    setComparisonPerPage: updateComparisonPerPage,
    selectVersion,
    fetchVersions,
    fetchVersionDetail,
    fetchVersionDetails,
    fetchComparison,
    rollbackToVersion,
  };
};
