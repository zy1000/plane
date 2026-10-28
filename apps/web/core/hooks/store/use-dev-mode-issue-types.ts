import { useCallback } from "react";
import useSWR from "swr";
import type { TCreateDevModeIssueTypePayload, TDevModeIssueType } from "@plane/types";
import { DevModeService } from "@/services/dev-mode.service";
import { useProject } from "@/hooks/store/use-project";
import { clearExtraFieldsCacheForWorkspace, projectIssueTypesCache } from "@/services/project/project-issue-type.service";

const devModeService = new DevModeService();

/**
 * 研发模式关联的类型库类型（模式页「工作项」页签）。
 *
 * 关联 / 新建会改到类型库与跟随项目那边的数据（类型列表、每个类型的「用于」、项目能用的类型），
 * 类型列表有模块级缓存（projectIssueTypesCache，按作用域键 / 项目 id），这里改完整个清掉，下次用到时重新拉。
 * `onCountChange`：关联数变了通知模式详情改页签计数，不整页重拉。
 */
export const useDevModeIssueTypes = (
  workspaceSlug: string | undefined,
  devModeId: string | undefined,
  onCountChange?: (count: number) => void
) => {
  const key = workspaceSlug && devModeId ? `DEV_MODE_ISSUE_TYPES_${workspaceSlug}_${devModeId}` : null;
  const { data, error, isLoading, mutate } = useSWR(
    key,
    workspaceSlug && devModeId ? () => devModeService.listIssueTypes(workspaceSlug, devModeId) : null,
    { revalidateOnFocus: false }
  );

  const { setFollowingProjectsVisibleTypes } = useProject();

  /**
   * 关联变了：类型库与所有项目的类型缓存都清掉（跟随该模式的项目能用的类型变了，项目缓存按项目 id 存，
   * 不清的话回到项目里还是旧的类型列表），字段缓存一起清；项目 store 里的可见类型就地改掉。
   */
  const invalidateLibraryTypes = useCallback(
    (rows?: TDevModeIssueType[]) => {
      projectIssueTypesCache.clear();
      if (workspaceSlug) clearExtraFieldsCacheForWorkspace(workspaceSlug);
      if (devModeId && rows) setFollowingProjectsVisibleTypes(devModeId, rows.map((row) => row.issue_type_id));
    },
    [devModeId, setFollowingProjectsVisibleTypes, workspaceSlug]
  );

  /** 整体替换关联与排序（关联弹窗保存、取消关联、调整顺序共用） */
  const setIssueTypes = useCallback(
    async (issueTypeIds: string[]) => {
      if (!workspaceSlug || !devModeId) return undefined;
      const rows = await devModeService.setIssueTypes(workspaceSlug, devModeId, issueTypeIds);
      await mutate(rows, { revalidate: false });
      invalidateLibraryTypes(rows);
      onCountChange?.(rows.length);
      return rows;
    },
    [devModeId, invalidateLibraryTypes, mutate, onCountChange, workspaceSlug]
  );

  /** 在类型库新建类型并关联到本模式，新行追加在末尾 */
  const createIssueType = useCallback(
    async (payload: TCreateDevModeIssueTypePayload) => {
      if (!workspaceSlug || !devModeId) return undefined;
      const created = await devModeService.createIssueType(workspaceSlug, devModeId, payload);
      let nextRows: TDevModeIssueType[] = [];
      await mutate(
        (prev) => {
          nextRows = [...(prev ?? []).filter((row) => row.id !== created.id), created];
          return nextRows;
        },
        { revalidate: false }
      );
      invalidateLibraryTypes(nextRows);
      onCountChange?.(nextRows.length);
      return created;
    },
    [devModeId, invalidateLibraryTypes, mutate, onCountChange, workspaceSlug]
  );

  return {
    rows: data,
    isLoading,
    error: error as unknown,
    setIssueTypes,
    createIssueType,
    refresh: () => mutate(),
  };
};
