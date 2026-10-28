import { useCallback, useEffect } from "react";
import useSWR from "swr";
import type { TSchemeView } from "@plane/types";
import { useProjectView } from "@/hooks/store/use-project-view";
import { DevModeService } from "@/services/dev-mode.service";

const devModeService = new DevModeService();

/** 视图条件里有没有出现这些 id（类型、状态）；id 是 uuid，直接在序列化后的条件里找 */
export const viewReferencesAny = (view: TSchemeView, ids: string[]) => {
  if (ids.length === 0) return false;
  const text = JSON.stringify(view.rich_filters ?? {});
  return ids.some((id) => text.includes(id));
};

/**
 * 研发模式上的研发模式视图（模板中心「视图」页签、页签计数、删类型 / 状态时的提示共用一份）。
 * 改名、删除、排序后就地改本地数据，不整表重拉。
 */
export const useSchemeViews = (workspaceSlug: string, devModeId: string | null | undefined) => {
  const key = workspaceSlug && devModeId ? `DEV_MODE_VIEWS_${workspaceSlug}_${devModeId}` : null;
  const { data, isLoading, mutate } = useSWR(
    key,
    workspaceSlug && devModeId ? () => devModeService.listViews(workspaceSlug, devModeId) : null,
    { revalidateOnFocus: false }
  );
  const { syncModeViews } = useProjectView();

  // 项目页签用的是项目视图 store 里的那份，这里每次变（删、改名、排序、删类型后的条件变化）都同步过去
  useEffect(() => {
    if (devModeId && data) syncModeViews(devModeId, data);
  }, [data, devModeId, syncModeViews]);

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      if (!devModeId) return;
      await devModeService.renameView(workspaceSlug, devModeId, viewId, name);
      await mutate((prev) => prev?.map((view) => (view.id === viewId ? { ...view, name } : view)), {
        revalidate: false,
      });
    },
    [mutate, devModeId, workspaceSlug]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (!devModeId) return;
      await devModeService.deleteView(workspaceSlug, devModeId, viewId);
      await mutate((prev) => prev?.filter((view) => view.id !== viewId), { revalidate: false });
    },
    [mutate, devModeId, workspaceSlug]
  );

  /** 一个页面内的新顺序：先改本地，接口失败再拉一遍 */
  const reorderViews = useCallback(
    async (viewIds: string[]) => {
      if (!devModeId) return;
      const position = new Map(viewIds.map((id, index) => [id, index]));
      await mutate(
        (prev) => {
          if (!prev) return prev;
          // 与后端 reorder 一致：sort_order 按新顺序重排，项目页签据此排
          const reordered = prev
            .filter((view) => position.has(view.id))
            .map((view) => ({ ...view, sort_order: ((position.get(view.id) ?? 0) + 1) * 10000 }));
          reordered.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
          let cursor = 0;
          return prev.map((view) => (position.has(view.id) ? reordered[cursor++] : view));
        },
        { revalidate: false }
      );
      try {
        await devModeService.reorderViews(workspaceSlug, devModeId, viewIds);
      } catch (error) {
        await mutate();
        throw error;
      }
    },
    [mutate, devModeId, workspaceSlug]
  );

  return {
    views: data,
    isLoading,
    renameView,
    deleteView,
    reorderViews,
    refresh: () => mutate(),
  };
};
