import { useCallback, useRef, useState } from "react";
import type { TRequirementModule } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 多个标准库的模块树，按需拉、拉过就留着。
 *
 * 导入弹窗左侧要同时展示若干个库的模块树，但一个工作区可能有几十个库，进场就全拉
 * 一遍是白花钱 —— 所以按「展开哪个库就拉哪个库」的粒度取，结果缓存在 Map 里，
 * 折叠再展开不会重复请求。
 *
 * 与 useRequirementModules（单作用域、可增删改）互补：这里只读，不做任何写操作。
 */
export const useLibraryModuleTrees = (workspaceSlug: string | undefined) => {
  const [treesByLibrary, setTreesByLibrary] = useState<Map<string, TRequirementModule[]>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  /** 已发起过的库，防止同一个库在渲染期间被重复请求（state 更新有一帧延迟） */
  const requestedRef = useRef<Set<string>>(new Set());

  const ensureModules = useCallback(
    async (libraryId: string) => {
      if (!workspaceSlug || !libraryId || requestedRef.current.has(libraryId)) return;
      requestedRef.current.add(libraryId);
      setLoadingIds((current) => new Set(current).add(libraryId));
      try {
        const response = await requirementService.listRequirementModules(workspaceSlug, { libraryId });
        setTreesByLibrary((current) => new Map(current).set(libraryId, response.modules));
      } catch {
        // 拉失败就把标记撤掉，下次展开还能再试；树缺失时节点按「没有子模块」渲染
        requestedRef.current.delete(libraryId);
      } finally {
        setLoadingIds((current) => {
          const next = new Set(current);
          next.delete(libraryId);
          return next;
        });
      }
    },
    [workspaceSlug]
  );

  /** 导入完成 / 重新打开弹窗后清空，让下一次展开重新取（模块可能已经变了） */
  const reset = useCallback(() => {
    requestedRef.current = new Set();
    setTreesByLibrary(new Map());
  }, []);

  return {
    treesByLibrary,
    isLibraryLoading: (libraryId: string) => loadingIds.has(libraryId),
    ensureModules,
    reset,
  };
};
