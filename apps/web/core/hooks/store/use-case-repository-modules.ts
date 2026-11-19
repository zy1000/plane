import { useCallback, useEffect, useState } from "react";
import type {
  TCreateRequirementModulePayload,
  TMoveRequirementModulePayload,
  TUpdateRequirementModulePayload,
} from "@plane/types";
import { RepositoryService, type TCaseRepositoryModule } from "@/services/qa/repository.service";

const repositoryService = new RepositoryService();

/**
 * 产品下用例库模块树的数据入口（产品「测试用例」页左栏）。
 *
 * 增删改后整树重拉 —— 树很轻（一次 GET 带回全部节点与计数），口径同 useRequirementModules。
 * 页面在新建 / 编辑 / 删除用例库之后也应调 refresh() 让计数跟上。
 */
export const useCaseRepositoryModules = (workspaceSlug: string | undefined, productId: string | undefined) => {
  const [modules, setModules] = useState<TCaseRepositoryModule[]>([]);
  const [total, setTotal] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !productId) return;
    try {
      const response = await repositoryService.listRepositoryModules(workspaceSlug, productId);
      setModules(response.modules);
      setTotal(response.total);
      setUnassigned(response.unassigned);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, productId]);

  useEffect(() => {
    setIsLoading(Boolean(workspaceSlug && productId));
    void refresh().catch(() => undefined);
  }, [refresh, workspaceSlug, productId]);

  const requireScope = useCallback(() => {
    if (!workspaceSlug || !productId) throw new Error("Missing workspace or product.");
    return { workspaceSlug, productId };
  }, [workspaceSlug, productId]);

  const createModule = useCallback(
    async (payload: TCreateRequirementModulePayload) => {
      const scope = requireScope();
      const response = await repositoryService.createRepositoryModule(scope.workspaceSlug, scope.productId, payload);
      await refresh();
      return response;
    },
    [requireScope, refresh]
  );

  const updateModule = useCallback(
    async (moduleId: string, payload: TUpdateRequirementModulePayload) => {
      const scope = requireScope();
      const response = await repositoryService.updateRepositoryModule(
        scope.workspaceSlug,
        scope.productId,
        moduleId,
        payload
      );
      await refresh();
      return response;
    },
    [requireScope, refresh]
  );

  /** 拖拽移动模块：换父级 / 同级排序，挂在上面的用例库不变 */
  const moveModule = useCallback(
    async (payload: TMoveRequirementModulePayload) => {
      const scope = requireScope();
      const response = await repositoryService.moveRepositoryModule(scope.workspaceSlug, scope.productId, payload);
      await refresh();
      return response;
    },
    [requireScope, refresh]
  );

  /** 删除模块连带删子模块；模块下的用例库不删，回到「未归类」 */
  const deleteModule = useCallback(
    async (moduleId: string) => {
      const scope = requireScope();
      await repositoryService.deleteRepositoryModule(scope.workspaceSlug, scope.productId, moduleId);
      await refresh();
    },
    [requireScope, refresh]
  );

  return {
    modules,
    /** 产品下全部用例库数，「全部用例库」的计数 */
    total,
    /** 没挂模块的用例库数，「未归类」的计数 */
    unassigned,
    isLoading,
    refresh,
    createModule,
    updateModule,
    moveModule,
    deleteModule,
  };
};

export type TCaseRepositoryModulesStore = ReturnType<typeof useCaseRepositoryModules>;
