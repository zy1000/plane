import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { EIssuesStoreType } from "@plane/types";
import type { TIssue, TWorkItemFilterExpression } from "@plane/types";
import { ProjectService } from "@/services/project";
import { expandStateIdsInExpression } from "@/store/issue/project/filter.store";
import { useIssues } from "./use-issues";
import { useProjectState } from "./use-project-state";
import { PROJECT_DEFECTS_REFRESH_EVENT } from "./use-project-defects";

const projectService = new ProjectService();

/** 影响九个计数口径的字段：状态、负责人、提交人 */
const issueSignature = (issue: TIssue) =>
  `${issue.state_id}|${(issue.assignee_ids ?? []).join(",")}|${issue.created_by}`;

/** 把分组 / 子分组形态的 id 结构摊平成一维 */
function collectLoadedIssueIds(grouped: unknown): string[] {
  if (!grouped || typeof grouped !== "object") return [];
  const ids: string[] = [];
  Object.values(grouped as Record<string, unknown>).forEach((group) => {
    if (Array.isArray(group)) ids.push(...(group as string[]));
    else if (group && typeof group === "object") {
      Object.values(group as Record<string, unknown>).forEach((subGroup) => {
        if (Array.isArray(subGroup)) ids.push(...(subGroup as string[]));
      });
    }
  });
  return ids;
}

/**
 * 缺陷页左侧快捷筛选的计数，在 `userFilters`（当前视图 + 筛选条的用户条件）范围内算，
 * 让左栏数字和点进去看到的行数一致。
 *
 * 刷新时机：进页、用户条件变化、窗口重新聚焦、新建缺陷后的刷新事件，以及列表里就地改了
 * 已加载工作项的状态 / 负责人（翻页新增的工作项不算变化）。
 * 要在 observer 组件里调用，这样对 MobX 字段的读取才会被追踪。
 */
export function useDefectQuickCounts(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  userFilters: TWorkItemFilterExpression
) {
  const { issues, issueMap } = useIssues(EIssuesStoreType.PROJECT);
  const { getProjectStateNameToIdsMap } = useProjectState();

  // 与列表请求同一套处理：单个 state_id 扩展成所有同名状态，再序列化成 filters 参数
  const filtersParam = useMemo(() => {
    if (!userFilters || Object.keys(userFilters).length === 0) return undefined;
    const expanded = expandStateIdsInExpression(userFilters, getProjectStateNameToIdsMap(projectId));
    return JSON.stringify(expanded);
  }, [userFilters, getProjectStateNameToIdsMap, projectId]);

  const { data, error, isLoading, mutate } = useSWR(
    workspaceSlug && projectId
      ? `PROJECT_DEFECT_QUICK_COUNTS_${workspaceSlug}_${projectId}_${filtersParam ?? ""}`
      : null,
    () =>
      projectService.getProjectDefectQuickCounts(workspaceSlug as string, projectId as string, {
        filters: filtersParam,
      }),
    { revalidateOnFocus: true, dedupingInterval: 2000, keepPreviousData: true }
  );

  useEffect(() => {
    const handleRefresh = () => void mutate();
    window.addEventListener(PROJECT_DEFECTS_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PROJECT_DEFECTS_REFRESH_EVENT, handleRefresh);
  }, [mutate]);

  const signatures = new Map<string, string>();
  collectLoadedIssueIds(issues?.groupedIssueIds).forEach((issueId) => {
    const issue = issueMap?.[issueId];
    if (issue) signatures.set(issueId, issueSignature(issue));
  });
  const signatureKey = Array.from(signatures, ([issueId, signature]) => `${issueId}:${signature}`).join(";");

  const previousSignaturesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const previous = previousSignaturesRef.current;
    previousSignaturesRef.current = signatures;
    let changed = false;
    signatures.forEach((signature, issueId) => {
      const before = previous.get(issueId);
      if (before !== undefined && before !== signature) changed = true;
    });
    if (changed) void mutate();
    // signatures 由 signatureKey 唯一决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureKey, mutate]);

  return {
    counts: data as Record<string, number> | undefined,
    error,
    isLoading,
    refetch: mutate,
  };
}
