import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, isEqual } from "lodash-es";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_VIEWS_CREATE_PERMISSION_KEY } from "@plane/constants";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import type { TSaveViewInput, TViewSnapshot, TViewSnapshotKey, TViewTabsParams } from "./types";
import { useViewTabPreferences } from "./use-view-tab-preferences";

const ACTIVE_ALL = "all";
const DEFAULT_COMPARE_KEYS: TViewSnapshotKey[] = ["rich_filters", "display_filters", "display_properties"];

const getStorageKey = (projectId: string, scope: string) => `plane:view-tabs:${projectId}:${scope}:active`;

const readStoredActive = (projectId: string, scope: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(getStorageKey(projectId, scope));
  } catch {
    return null;
  }
};

const writeStoredActive = (projectId: string, scope: string, viewId: string | null) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(projectId, scope), viewId ?? ACTIVE_ALL);
  } catch {
    // 隐私模式等场景写不进去就算了，只影响下次进页停在哪个页签
  }
};

/** 浅去掉 null / undefined，group_by: null 与缺省视为同一回事 */
const normalizePart = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (item !== null && item !== undefined) result[key] = item;
  });
  return result;
};

export const snapshotOfView = (view: IProjectView): TViewSnapshot => ({
  rich_filters: view.rich_filters ?? ({} as IProjectView["rich_filters"]),
  display_filters: view.display_filters,
  display_properties: view.display_properties,
});

const toastError = (message: string) => setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message });

export const useViewTabs = (params: TViewTabsParams) => {
  const {
    workspaceSlug,
    projectId,
    scope,
    current,
    apply,
    compareKeys = DEFAULT_COMPARE_KEYS,
    applyOnMount = false,
    ready = true,
  } = params;
  // store hooks
  const { getScopedProjectViews, fetchViews, createView, updateView, deleteView } = useProjectView();
  const { data: currentUser } = useUser();
  const { allowPermissions, allowProjectPermissionKeys } = useUserPermissions();
  const preferences = useViewTabPreferences(workspaceSlug, projectId, scope);
  // state
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const initializedKeyRef = useRef<string>();
  const pendingApplyRef = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useSWR(
    workspaceSlug && projectId ? `VIEW_TABS_${workspaceSlug}_${projectId}_${scope}` : null,
    () => fetchViews(workspaceSlug, projectId, scope),
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const views = getScopedProjectViews(projectId, scope);
  const isReady = !!views && preferences.isLoaded;

  // 进页：优先停在上次所在的页签，其次是自己设的默认页签，最后是「全部」
  useEffect(() => {
    const key = `${projectId}__${scope}`;
    if (!views || !preferences.isLoaded || initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;

    const stored = readStoredActive(projectId, scope);
    let next: string | null = null;
    let shouldApply = false;
    if (stored === ACTIVE_ALL) {
      next = null;
    } else if (stored && views.some((view) => view.id === stored)) {
      next = stored;
      shouldApply = applyOnMount;
    } else if (preferences.defaultViewId && views.some((view) => view.id === preferences.defaultViewId)) {
      next = preferences.defaultViewId;
      shouldApply = true;
    }
    setActiveViewId(next);
    pendingApplyRef.current = shouldApply ? next : null;
  }, [views, preferences.isLoaded, preferences.defaultViewId, projectId, scope, applyOnMount]);

  useEffect(() => {
    if (!ready || !views || !pendingApplyRef.current) return;
    const view = views.find((item) => item.id === pendingApplyRef.current);
    pendingApplyRef.current = null;
    if (view) applyRef.current(snapshotOfView(view));
  }, [ready, views, activeViewId]);

  // derived
  const activeView = useMemo(() => views?.find((view) => view.id === activeViewId) ?? null, [views, activeViewId]);

  // 不做 useMemo：current 里的 display_filters 是 MobX 对象，按 key 改时引用不变，缓存会算旧值
  const isDirty = (() => {
    if (!current) return false;
    if (!activeView) return Object.keys(normalizePart(current.rich_filters)).length > 0;
    return compareKeys.some((key) => !isEqual(normalizePart(current[key]), normalizePart(activeView[key])));
  })();

  const orderedViews = useMemo(() => {
    if (!views) return [];
    const orderIndex = new Map(preferences.order.map((id, index) => [id, index]));
    return [...views].sort((a, b) => {
      const indexA = orderIndex.get(a.id);
      const indexB = orderIndex.get(b.id);
      if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
      if (indexA !== undefined) return -1;
      if (indexB !== undefined) return 1;
      return 0;
    });
  }, [views, preferences.order]);

  // 页签栏里放哪些：自己的视图默认在栏里（除非收起），别人建的公共视图默认收在「更多」（除非拉出来）
  const isViewInBar = useCallback(
    (view: IProjectView) =>
      view.owned_by === currentUser?.id
        ? !preferences.hiddenViewIds.includes(view.id)
        : preferences.pinnedViewIds.includes(view.id),
    [currentUser?.id, preferences.hiddenViewIds, preferences.pinnedViewIds]
  );

  const { visibleViews, hiddenViews } = useMemo(
    () => ({
      visibleViews: orderedViews.filter((view) => isViewInBar(view)),
      hiddenViews: orderedViews.filter((view) => !isViewInBar(view)),
    }),
    [orderedViews, isViewInBar]
  );

  const setViewInBar = useCallback(
    (view: IProjectView, inBar: boolean) =>
      preferences.setViewInBar(view.id, inBar, view.owned_by === currentUser?.id),
    [currentUser?.id, preferences]
  );

  // permissions
  const isProjectAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const canCreate = allowProjectPermissionKeys([PROJECT_VIEWS_CREATE_PERMISSION_KEY], workspaceSlug, projectId);
  const canEditView = useCallback(
    (view: IProjectView) =>
      view.owned_by === currentUser?.id || (view.access === EViewAccess.PUBLIC && isProjectAdmin),
    [currentUser?.id, isProjectAdmin]
  );
  const canDeleteView = useCallback(
    (view: IProjectView) => view.owned_by === currentUser?.id || isProjectAdmin,
    [currentUser?.id, isProjectAdmin]
  );

  // actions
  const selectView = useCallback(
    (viewId: string | null) => {
      setActiveViewId(viewId);
      writeStoredActive(projectId, scope, viewId);
      const view = viewId ? views?.find((item) => item.id === viewId) : null;
      apply(view ? snapshotOfView(view) : null);
    },
    [apply, projectId, scope, views]
  );

  const buildPayload = useCallback((): Partial<IProjectView> => {
    const snapshot = current ?? { rich_filters: {} as IProjectView["rich_filters"] };
    return {
      rich_filters: cloneDeep(snapshot.rich_filters ?? ({} as IProjectView["rich_filters"])),
      display_filters: snapshot.display_filters ? cloneDeep(snapshot.display_filters) : undefined,
      display_properties: snapshot.display_properties ? cloneDeep(snapshot.display_properties) : undefined,
    };
  }, [current]);

  const saveActiveView = useCallback(async () => {
    if (!activeView) return;
    try {
      await updateView(workspaceSlug, projectId, activeView.id, buildPayload());
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: `视图「${activeView.name}」已更新` });
    } catch {
      toastError("视图没有保存成功，请重试");
    }
  }, [activeView, buildPayload, projectId, updateView, workspaceSlug]);

  const discardChanges = useCallback(() => {
    apply(activeView ? snapshotOfView(activeView) : null);
  }, [activeView, apply]);

  const createViewFromCurrent = useCallback(
    async (input: TSaveViewInput) => {
      try {
        const created = await createView(workspaceSlug, projectId, {
          name: input.name.trim(),
          description: "",
          access: input.access,
          scope,
          ...buildPayload(),
        });
        setActiveViewId(created.id);
        writeStoredActive(projectId, scope, created.id);
        if (input.isDefault) await preferences.setDefaultViewId(created.id);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: `视图「${created.name}」已创建` });
        return created;
      } catch {
        toastError("视图没有创建成功，请重试");
        return undefined;
      }
    },
    [buildPayload, createView, preferences, projectId, scope, workspaceSlug]
  );

  const updateViewMeta = useCallback(
    async (view: IProjectView, input: TSaveViewInput) => {
      try {
        const patch: Partial<IProjectView> = {};
        if (input.name.trim() && input.name.trim() !== view.name) patch.name = input.name.trim();
        if (input.access !== view.access) patch.access = input.access;
        if (Object.keys(patch).length > 0) await updateView(workspaceSlug, projectId, view.id, patch);
        const isDefaultNow = preferences.defaultViewId === view.id;
        if (input.isDefault !== isDefaultNow) await preferences.setDefaultViewId(input.isDefault ? view.id : null);
      } catch {
        toastError("视图没有更新成功，请重试");
      }
    },
    [preferences, projectId, updateView, workspaceSlug]
  );

  const duplicateView = useCallback(
    async (view: IProjectView) => {
      try {
        const created = await createView(workspaceSlug, projectId, {
          name: `${view.name} 副本`,
          description: view.description ?? "",
          access: EViewAccess.PRIVATE,
          scope,
          rich_filters: cloneDeep(view.rich_filters),
          display_filters: cloneDeep(view.display_filters),
          display_properties: cloneDeep(view.display_properties),
        });
        setActiveViewId(created.id);
        writeStoredActive(projectId, scope, created.id);
        apply(snapshotOfView(created));
      } catch {
        toastError("视图没有复制成功，请重试");
      }
    },
    [apply, createView, projectId, scope, workspaceSlug]
  );

  const toggleViewAccess = useCallback(
    async (view: IProjectView) => {
      try {
        await updateView(workspaceSlug, projectId, view.id, {
          access: view.access === EViewAccess.PUBLIC ? EViewAccess.PRIVATE : EViewAccess.PUBLIC,
        });
      } catch {
        toastError("可见范围没有改成功，请重试");
      }
    },
    [projectId, updateView, workspaceSlug]
  );

  const removeView = useCallback(
    async (view: IProjectView) => {
      try {
        await deleteView(workspaceSlug, projectId, view.id);
        if (preferences.defaultViewId === view.id) await preferences.setDefaultViewId(null);
        if (activeViewId === view.id) selectView(null);
      } catch {
        toastError("视图没有删除成功，请重试");
      }
    },
    [activeViewId, deleteView, preferences, projectId, selectView, workspaceSlug]
  );

  return {
    isReady,
    views: orderedViews,
    visibleViews,
    hiddenViews,
    activeViewId,
    activeView,
    isDirty,
    canCreate,
    canEditView,
    canDeleteView,
    defaultViewId: preferences.defaultViewId,
    isViewInBar,
    selectView,
    saveActiveView,
    discardChanges,
    createViewFromCurrent,
    updateViewMeta,
    duplicateView,
    toggleViewAccess,
    removeView,
    setDefaultViewId: preferences.setDefaultViewId,
    setViewInBar,
    setOrder: preferences.setOrder,
  };
};

export type TViewTabsState = ReturnType<typeof useViewTabs>;
