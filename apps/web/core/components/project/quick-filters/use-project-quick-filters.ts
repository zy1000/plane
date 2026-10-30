import { useCallback, useEffect, useMemo } from "react";
import { PROJECT_CLOSED_STATUS_LABELS } from "@plane/constants";
import type { TProjectQuickScope } from "@plane/types";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import type { TProjectListLookups } from "../filters/use-project-list-lookups";
import type { TProjectQuickScopeCounts } from "./match-quick-scope";

export type TProjectQuickStatus = { id: string; label: string };

export type TProjectQuickFilters = {
  scope: TProjectQuickScope;
  counts: TProjectQuickScopeCounts | undefined;
  /** 非终态的状态值，各占一个页签（按字典顺序） */
  mainStatuses: TProjectQuickStatus[];
  /** 终态（已完成 / 已取消），收在「更多」里 */
  closedStatuses: TProjectQuickStatus[];
  myProjects: boolean;
  setScope: (scope: TProjectQuickScope) => void;
  setMyProjects: (value: boolean) => void;
};

/**
 * 快捷页签条的状态：页签选中值与「我参与的」都存在 ProjectFilterStore 的 display filters 里（随工作区落本地），
 * 各档数量由 project store 算（页签之外的条件已筛过）。终态值 id 在这里从字典推出来登记进 store，
 * 「未完成 / 已逾期」的匹配靠它。
 */
export const useProjectQuickFilters = (workspaceSlug: string, lookups: TProjectListLookups): TProjectQuickFilters => {
  const { currentWorkspaceDisplayFilters, updateDisplayFilters, setClosedStatusIds } = useProjectFilter();
  const { quickScopeCounts } = useProject();

  const statusItems = lookups.getDictionary("status")?.items;
  const { mainStatuses, closedStatuses } = useMemo(() => {
    const main: TProjectQuickStatus[] = [];
    const closed: TProjectQuickStatus[] = [];
    for (const item of statusItems ?? []) {
      (PROJECT_CLOSED_STATUS_LABELS.includes(item.label) ? closed : main).push({ id: item.id, label: item.label });
    }
    return { mainStatuses: main, closedStatuses: closed };
  }, [statusItems]);

  useEffect(() => {
    setClosedStatusIds(
      workspaceSlug,
      closedStatuses.map((status) => status.id)
    );
  }, [closedStatuses, setClosedStatusIds, workspaceSlug]);

  const setScope = useCallback(
    (scope: TProjectQuickScope) => updateDisplayFilters(workspaceSlug, { quick_scope: scope }),
    [updateDisplayFilters, workspaceSlug]
  );
  const setMyProjects = useCallback(
    (value: boolean) => updateDisplayFilters(workspaceSlug, { my_projects: value }),
    [updateDisplayFilters, workspaceSlug]
  );

  return {
    scope: currentWorkspaceDisplayFilters?.quick_scope ?? "all",
    counts: quickScopeCounts,
    mainStatuses,
    closedStatuses,
    myProjects: !!currentWorkspaceDisplayFilters?.my_projects,
    setScope,
    setMyProjects,
  };
};
