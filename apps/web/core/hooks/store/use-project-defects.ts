import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IState, TIssue, TIssuesResponse } from "@plane/types";
import { IssueService } from "@/services/issue";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";

const DEFECT_CATEGORY_NAME = "缺陷";
const DEFAULT_PER_PAGE = 50;

export const PROJECT_DEFECTS_REFRESH_EVENT = "project-defects:refresh";

type TDefectMemberStat = {
  member_id: string;
  display_name: string;
  avatar_url: string;
  work_item_count?: number;
  defect_count: number;
};

type TProjectDefectAnalytics = {
  total_defects?: number;
  pending_defects?: number;
  member_stats?: TDefectMemberStat[];
};

type TIssueQueryParams = {
  type_id?: string;
  assignees?: string;
  name?: string;
  cursor: string;
  per_page: string;
  order_by: string;
};

type TUseProjectDefectsOptions = {
  includeList?: boolean;
  perPage?: number;
};

export type TProjectDefectIssueRow = {
  issue: TIssue;
  state: IState | undefined;
  stateGroup: string | null;
  assignees: Array<{
    id: string;
    display_name: string;
    avatar_url?: string | null;
  }>;
  isPending: boolean;
};

const issueService = new IssueService();

const normalizeErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { detail?: string; error?: string; message?: string; msg?: string };
    return payload.detail ?? payload.error ?? payload.message ?? payload.msg ?? fallback;
  }
  return fallback;
};

function flattenIssueResults(results: TIssuesResponse["results"]): TIssue[] {
  if (Array.isArray(results)) return results as TIssue[];
  if (!results || typeof results !== "object") return [];

  return Object.values(results).flatMap((group) => {
    if (Array.isArray(group)) return group as TIssue[];
    if (!group || typeof group !== "object") return [];
    const groupResults = (group as { results?: unknown }).results;
    if (Array.isArray(groupResults)) return groupResults as TIssue[];
    if (!groupResults || typeof groupResults !== "object") return [];

    return Object.values(groupResults).flatMap((subGroup) => {
      const subGroupResults = (subGroup as { results?: unknown })?.results;
      return Array.isArray(subGroupResults) ? (subGroupResults as TIssue[]) : [];
    });
  });
}

export function useProjectDefects(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  options: TUseProjectDefectsOptions = {}
) {
  const { includeList = true, perPage = DEFAULT_PER_PAGE } = options;
  const { fetchProjectAnalyze } = useProject();
  const {
    project: { fetchProjectMembers },
    getUserDetails,
  } = useMember();
  const { getStateById } = useProjectState();
  const { data: currentUser } = useUser();
  const { issueTypes, isLoading: isIssueTypesLoading } = useProjectIssueTypes(workspaceSlug, projectId);

  const [analytics, setAnalytics] = useState<TProjectDefectAnalytics | null>(null);
  const [issues, setIssues] = useState<TIssue[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCursorRef = useRef<string | undefined>(undefined);

  const defectTypeIds = useMemo(
    () => (issueTypes ?? []).filter((type) => type.category_name === DEFECT_CATEGORY_NAME).map((type) => type.id),
    [issueTypes]
  );

  const fetchSummary = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;

    setIsSummaryLoading(true);
    setError(null);
    try {
      const response = (await fetchProjectAnalyze(workspaceSlug, projectId)) as TProjectDefectAnalytics;
      setAnalytics(response);
    } catch (err) {
      setAnalytics(null);
      setError(normalizeErrorMessage(err, "缺陷统计加载失败"));
    } finally {
      setIsSummaryLoading(false);
    }
  }, [fetchProjectAnalyze, projectId, workspaceSlug]);

  const fetchIssuePage = useCallback(
    async (mode: "reset" | "append" = "reset") => {
      if (!includeList || !workspaceSlug || !projectId || defectTypeIds.length === 0) return;
      if (onlyMine && !currentUser?.id) return;

      const isAppending = mode === "append";
      const cursor = isAppending ? nextCursorRef.current : `${perPage}:0:0`;
      if (!cursor) return;

      if (isAppending) setIsFetchingMore(true);
      else setIsListLoading(true);
      setError(null);

      try {
        const trimmedSearch = searchQuery.trim();
        const params: TIssueQueryParams = {
          type_id: defectTypeIds.join(","),
          cursor,
          per_page: perPage.toString(),
          order_by: "-updated_at",
        };
        if (onlyMine && currentUser?.id) params.assignees = String(currentUser.id);
        if (trimmedSearch) params.name = trimmedSearch;

        const response = await issueService.getIssues(workspaceSlug, projectId, params);
        const rows = flattenIssueResults(response.results);

        setIssues((current) => (isAppending ? [...current, ...rows] : rows));
        setTotalResults(response.total_results ?? response.total_count ?? rows.length);
        nextCursorRef.current = response.next_cursor || undefined;
        setHasMore(!!response.next_page_results);
      } catch (err) {
        setError(normalizeErrorMessage(err, "缺陷列表加载失败"));
        if (!isAppending) {
          setIssues([]);
          setTotalResults(0);
          nextCursorRef.current = undefined;
          setHasMore(false);
        }
      } finally {
        if (isAppending) setIsFetchingMore(false);
        else setIsListLoading(false);
      }
    },
    [
      currentUser?.id,
      defectTypeIds,
      includeList,
      onlyMine,
      perPage,
      projectId,
      searchQuery,
      workspaceSlug,
    ]
  );

  const refetch = useCallback(() => {
    void fetchSummary();
    void fetchIssuePage("reset");
  }, [fetchIssuePage, fetchSummary]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void fetchSummary();
    if (includeList) void fetchProjectMembers(workspaceSlug, projectId);
  }, [fetchProjectMembers, fetchSummary, includeList, projectId, workspaceSlug]);

  useEffect(() => {
    void fetchIssuePage("reset");
  }, [fetchIssuePage]);

  useEffect(() => {
    if (!includeList || defectTypeIds.length > 0) return;
    setIssues([]);
    setTotalResults(0);
    nextCursorRef.current = undefined;
    setHasMore(false);
  }, [defectTypeIds.length, includeList, projectId, workspaceSlug]);

  // 无条件注册刷新监听：refetch 内的 fetchIssuePage 已有 includeList 守卫，
  // 因此 includeList:false 的消费者（如指标条）也能在新建缺陷后刷新统计。
  useEffect(() => {
    window.addEventListener(PROJECT_DEFECTS_REFRESH_EVENT, refetch);
    return () => window.removeEventListener(PROJECT_DEFECTS_REFRESH_EVENT, refetch);
  }, [refetch]);

  const rowsWithMeta = useMemo(
    () =>
      issues.map((issue) => {
        const state = getStateById(issue.state_id);
        const assignees = issue.assignee_ids
          .map((userId) => getUserDetails(userId))
          .flatMap((user) =>
            user
              ? [
                  {
                    id: user.id,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                  },
                ]
              : []
          );
        const stateGroup = state?.group ?? issue.state__group ?? null;

        return {
          issue,
          state,
          stateGroup,
          assignees,
          isPending: stateGroup !== "completed" && stateGroup !== "cancelled",
        };
      }),
    [getStateById, getUserDetails, issues]
  );

  const totalDefects = analytics?.total_defects ?? totalResults;
  const pendingDefects = analytics?.pending_defects ?? rowsWithMeta.filter((row) => row.isPending).length;
  const resolvedDefects = Math.max(totalDefects - pendingDefects, 0);
  const pendingRatio = totalDefects > 0 ? Math.round((pendingDefects / totalDefects) * 100) : 0;
  const memberStats = analytics?.member_stats ?? [];
  const myDefectCount = currentUser?.id
    ? (memberStats.find((member) => member.member_id === String(currentUser.id))?.defect_count ?? 0)
    : 0;
  const myDefectRatio = totalDefects > 0 ? Math.round((myDefectCount / totalDefects) * 100) : 0;
  const topAssignees = [...memberStats]
    .filter((member) => member.defect_count > 0)
    .sort((a, b) => b.defect_count - a.defect_count);

  return {
    currentUser,
    defectTypeIds,
    error,
    hasMore,
    isFetchingMore,
    isIssueTypesLoading,
    isListLoading,
    isSummaryLoading,
    issues: rowsWithMeta,
    loadMore: () => fetchIssuePage("append"),
    myDefectCount,
    myDefectRatio,
    onlyMine,
    pendingDefects,
    pendingRatio,
    refetch,
    resolvedDefects,
    searchQuery,
    setOnlyMine,
    setSearchQuery,
    topAssignees,
    totalDefects,
    totalResults,
  };
}
