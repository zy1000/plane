import { useCallback } from "react";
import type { TViewScope, TViewTabPreferences } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";

const EMPTY_IDS: string[] = [];

/**
 * 每人每页面的视图页签偏好（默认页签 / 收进「更多」的页签 / 顺序），
 * 存在项目用户属性 preferences.views[scope]，随账号走。
 */
export const useViewTabPreferences = (workspaceSlug: string, projectId: string, scope: TViewScope) => {
  const {
    project: { getProjectUserProperties, updateProjectUserProperties },
  } = useMember();
  const userProperties = getProjectUserProperties(projectId);
  const preferences = userProperties?.preferences?.views?.[scope];

  const update = useCallback(
    async (patch: Partial<TViewTabPreferences>) => {
      const latest = getProjectUserProperties(projectId);
      // preferences 是整体替换；没拉到之前写会把导航偏好冲掉
      if (!latest?.preferences) return;
      const views = latest.preferences.views ?? {};
      await updateProjectUserProperties(workspaceSlug, projectId, {
        preferences: {
          ...latest.preferences,
          views: { ...views, [scope]: { ...(views[scope] ?? {}), ...patch } },
        },
      });
    },
    [getProjectUserProperties, projectId, scope, updateProjectUserProperties, workspaceSlug]
  );

  const setDefaultViewId = useCallback((viewId: string | null) => update({ default_view_id: viewId }), [update]);

  const setViewHidden = useCallback(
    (viewId: string, hidden: boolean) => {
      const currentHidden = getProjectUserProperties(projectId)?.preferences?.views?.[scope]?.hidden_view_ids ?? [];
      const next = hidden
        ? Array.from(new Set([...currentHidden, viewId]))
        : currentHidden.filter((id) => id !== viewId);
      return update({ hidden_view_ids: next });
    },
    [getProjectUserProperties, projectId, scope, update]
  );

  const setOrder = useCallback((viewIds: string[]) => update({ order: viewIds }), [update]);

  return {
    isLoaded: !!userProperties,
    defaultViewId: preferences?.default_view_id ?? null,
    hiddenViewIds: preferences?.hidden_view_ids ?? EMPTY_IDS,
    order: preferences?.order ?? EMPTY_IDS,
    setDefaultViewId,
    setViewHidden,
    setOrder,
  };
};
