import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, isEqual } from "lodash-es";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_VIEWS_CREATE_PERMISSION_KEY } from "@plane/constants";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { isModeView, useModeViewContext } from "./mode-view";
import type { TSaveViewInput, TViewSnapshot, TViewSnapshotKey, TViewTabsParams } from "./types";
import { DEFAULT_VIEW_ALL, useViewTabPreferences } from "./use-view-tab-preferences";

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

/** 接口报错优先用后端给的说明（如「迭代、标签是本项目自己的…」） */
const getErrorMessage = (error: unknown, fallback: string) =>
  (error as { error?: string } | undefined)?.error ?? fallback;

/** 模板中心「在项目中打开」带过来的 ?view=，进页时直接停在这个视图 */
const readRequestedViewId = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("view");
};

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
  const mode = useModeViewContext(workspaceSlug, projectId);
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

  // 进页：URL 指定的视图 > 自己设的默认视图（设了就每次都开它）> 上次停留的页签 > 「全部」
  useEffect(() => {
    const key = `${projectId}__${scope}`;
    if (!views || !preferences.isLoaded || initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;

    const stored = readStoredActive(projectId, scope);
    const requested = readRequestedViewId();
    const defaultId = preferences.defaultViewId;
    let next: string | null = null;
    /** 进页要应用的：视图 id、ACTIVE_ALL（清掉筛选回到「全部」）或 null（什么都不动） */
    let pendingApply: string | null = null;
    if (requested && views.some((view) => view.id === requested)) {
      next = requested;
      pendingApply = requested;
      writeStoredActive(projectId, scope, requested);
    } else if (defaultId === DEFAULT_VIEW_ALL) {
      next = null;
      // 上次停在别的视图：它的筛选还留在页面上，清掉才真是「全部」；本来就在「全部」则保留手动筛的条件
      pendingApply = stored && stored !== ACTIVE_ALL ? ACTIVE_ALL : null;
    } else if (defaultId && views.some((view) => view.id === defaultId)) {
      next = defaultId;
      pendingApply = defaultId;
    } else if (stored === ACTIVE_ALL) {
      next = null;
    } else if (stored && views.some((view) => view.id === stored)) {
      next = stored;
      pendingApply = applyOnMount ? stored : null;
    }
    setActiveViewId(next);
    pendingApplyRef.current = pendingApply;
  }, [views, preferences.isLoaded, preferences.defaultViewId, projectId, scope, applyOnMount]);

  useEffect(() => {
    if (!ready || !views || !pendingApplyRef.current) return;
    const pending = pendingApplyRef.current;
    pendingApplyRef.current = null;
    if (pending === ACTIVE_ALL) {
      applyRef.current(null);
      return;
    }
    const view = views.find((item) => item.id === pending);
    if (view) applyRef.current(snapshotOfView(view));
  }, [ready, views, activeViewId]);

  // derived
  const activeView = useMemo(() => views?.find((view) => view.id === activeViewId) ?? null, [views, activeViewId]);

  // 不做 useMemo：current 里的 display_filters 是 MobX 对象，按 key 改时引用不变，缓存会算旧值
  /** 当前视图哪几部分被改过（「更新到研发模式」确认里列出来） */
  const changedParts: TViewSnapshotKey[] =
    current && activeView
      ? compareKeys.filter((key) => !isEqual(normalizePart(current[key]), normalizePart(activeView[key])))
      : [];
  const isDirty = (() => {
    if (!current) return false;
    if (!activeView) return Object.keys(normalizePart(current.rich_filters)).length > 0;
    return changedParts.length > 0;
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

  /** 默认就在页签栏的：自己的视图、研发模式视图；别人建的公共视图默认收在「更多」 */
  const isInBarByDefault = useCallback(
    (view: IProjectView) => view.owned_by === currentUser?.id || isModeView(view),
    [currentUser?.id]
  );

  const isViewInBar = useCallback(
    (view: IProjectView) =>
      isInBarByDefault(view)
        ? !preferences.hiddenViewIds.includes(view.id)
        : preferences.pinnedViewIds.includes(view.id),
    [isInBarByDefault, preferences.hiddenViewIds, preferences.pinnedViewIds]
  );

  const { visibleViews, hiddenViews } = useMemo(
    () => ({
      visibleViews: orderedViews.filter((view) => isViewInBar(view)),
      hiddenViews: orderedViews.filter((view) => !isViewInBar(view)),
    }),
    [orderedViews, isViewInBar]
  );

  const setViewInBar = useCallback(
    (view: IProjectView, inBar: boolean) => preferences.setViewInBar(view.id, inBar, isInBarByDefault(view)),
    [isInBarByDefault, preferences]
  );

  // permissions
  const isProjectAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const canCreate = allowProjectPermissionKeys([PROJECT_VIEWS_CREATE_PERMISSION_KEY], workspaceSlug, projectId);
  // 研发模式视图在项目里不能改名、改可见范围、删除（去模板中心），只有研发模式维护人能把改动更新上去
  const canEditView = useCallback(
    (view: IProjectView) =>
      !isModeView(view) &&
      (view.owned_by === currentUser?.id || (view.access === EViewAccess.PUBLIC && isProjectAdmin)),
    [currentUser?.id, isProjectAdmin]
  );
  const canDeleteView = useCallback(
    (view: IProjectView) => !isModeView(view) && (view.owned_by === currentUser?.id || isProjectAdmin),
    [currentUser?.id, isProjectAdmin]
  );
  const canUpdateModeView = useCallback(
    (view: IProjectView) => isModeView(view) && mode.isFollowing && mode.canManage,
    [mode.canManage, mode.isFollowing]
  );
  /** 「谁能看到」里出现「研发模式全部项目」 */
  const canShareToMode = canCreate && mode.isFollowing && mode.canManage;

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
    const toMode = isModeView(activeView);
    try {
      await updateView(workspaceSlug, projectId, activeView.id, buildPayload());
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "已保存",
        message: toMode
          ? `研发模式视图「${activeView.name}」已更新，跟随${mode.modeName}的项目一起生效`
          : `视图「${activeView.name}」已更新`,
      });
    } catch (error) {
      toastError(getErrorMessage(error, "视图没有保存成功，请重试"));
    }
  }, [activeView, buildPayload, mode.modeName, projectId, updateView, workspaceSlug]);

  const discardChanges = useCallback(() => {
    apply(activeView ? snapshotOfView(activeView) : null);
  }, [activeView, apply]);

  const createViewFromCurrent = useCallback(
    async (input: TSaveViewInput) => {
      try {
        const created = await createView(workspaceSlug, projectId, {
          name: input.name.trim(),
          description: "",
          access: input.shareToMode ? EViewAccess.PUBLIC : input.access,
          scope,
          ...buildPayload(),
          ...(input.shareToMode ? { share_to_mode: true } : {}),
        });
        setActiveViewId(created.id);
        writeStoredActive(projectId, scope, created.id);
        if (input.isDefault) await preferences.setDefaultViewId(created.id);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "已保存",
          message: input.shareToMode
            ? `视图「${created.name}」已存到${mode.modeName}，跟随的项目都能看到`
            : `视图「${created.name}」已创建`,
        });
        return created;
      } catch (error) {
        toastError(getErrorMessage(error, "视图没有创建成功，请重试"));
        return undefined;
      }
    },
    [buildPayload, createView, mode.modeName, preferences, projectId, scope, workspaceSlug]
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
    changedParts,
    canCreate,
    canEditView,
    canDeleteView,
    canUpdateModeView,
    canShareToMode,
    mode,
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
