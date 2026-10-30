import { useCallback } from "react";
import type { TViewScope, TViewTabPreferences } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";

const EMPTY_IDS: string[] = [];

/** default_view_id 的哨兵值：把「全部」设成默认页签；null / 没有则是没设过默认，进页沿用上次停留的页签 */
export const DEFAULT_VIEW_ALL = "all";

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

  /**
   * 视图在不在页签栏：自己的视图默认在栏里，收起记 hidden；别人的公共视图默认收在「更多」，拉出来记 pinned。
   * 两张表互斥，改一张时顺手把另一张里的同一条清掉。
   */
  const setViewInBar = useCallback(
    (viewId: string, inBar: boolean, isMine: boolean) => {
      const latest = getProjectUserProperties(projectId)?.preferences?.views?.[scope];
      const hidden = new Set(latest?.hidden_view_ids ?? []);
      const pinned = new Set(latest?.pinned_view_ids ?? []);
      if (isMine) {
        if (inBar) hidden.delete(viewId);
        else hidden.add(viewId);
        pinned.delete(viewId);
      } else {
        if (inBar) pinned.add(viewId);
        else pinned.delete(viewId);
        hidden.delete(viewId);
      }
      return update({ hidden_view_ids: Array.from(hidden), pinned_view_ids: Array.from(pinned) });
    },
    [getProjectUserProperties, projectId, scope, update]
  );

  const setOrder = useCallback((viewIds: string[]) => update({ order: viewIds }), [update]);

  return {
    isLoaded: !!userProperties,
    defaultViewId: preferences?.default_view_id ?? null,
    hiddenViewIds: preferences?.hidden_view_ids ?? EMPTY_IDS,
    pinnedViewIds: preferences?.pinned_view_ids ?? EMPTY_IDS,
    order: preferences?.order ?? EMPTY_IDS,
    setDefaultViewId,
    setViewInBar,
    setOrder,
  };
};
