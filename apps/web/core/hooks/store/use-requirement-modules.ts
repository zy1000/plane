import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TCreateRequirementModulePayload,
  TProjectRequirementModuleGroup,
  TRequirementModule,
  TRequirementModuleScope,
  TUpdateRequirementModulePayload,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 模块树的三种归属：库 / 产品可增删改，项目只读（树来自已关联需求涉及的
 * 产品模块，项目本身不落任何模块字段）。
 */
export type TRequirementModulesScope =
  | { kind: "library"; libraryId: string }
  | { kind: "product"; productId: string }
  | { kind: "project"; projectId: string };

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load requirement modules.";
  }
  return "Unable to load requirement modules.";
};

/**
 * 需求模块树的数据入口，库页 / 产品页 / 项目页共用。
 *
 * 增删改后整树重拉 —— 树很轻（一次 GET 带回全部节点与计数），比就地
 * 同步父子关系和子树累加计数省心得多。页面在批量移动 / 导入 / 增删需求
 * 之后也应调 refresh() 让计数跟上。
 */
export const useRequirementModules = (
  workspaceSlug: string | undefined,
  scope: TRequirementModulesScope | undefined
) => {
  const kind = scope?.kind;
  const entityId = !scope
    ? undefined
    : scope.kind === "library"
      ? scope.libraryId
      : scope.kind === "product"
        ? scope.productId
        : scope.projectId;

  const [modules, setModules] = useState<TRequirementModule[]>([]);
  const [groups, setGroups] = useState<TProjectRequirementModuleGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && entityId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 可写作用域（service 层的 URL 分派参数）；项目只读，恒为 null */
  const writeScope: TRequirementModuleScope | null = useMemo(() => {
    if (!kind || !entityId || kind === "project") return null;
    return kind === "library" ? { libraryId: entityId } : { productId: entityId };
  }, [kind, entityId]);

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !kind || !entityId) return;
    setError(null);
    try {
      if (kind === "project") {
        const response = await requirementService.listProjectRequirementModules(workspaceSlug, entityId);
        setGroups(response.products);
        setTotal(response.total);
      } else {
        const response = await requirementService.listRequirementModules(
          workspaceSlug,
          kind === "library" ? { libraryId: entityId } : { productId: entityId }
        );
        setModules(response.modules);
        setTotal(response.total);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, kind, entityId]);

  useEffect(() => {
    setIsLoading(Boolean(workspaceSlug && entityId));
    void refresh().catch(() => undefined);
  }, [refresh, workspaceSlug, entityId]);

  const createModule = useCallback(
    async (payload: TCreateRequirementModulePayload) => {
      if (!workspaceSlug || !writeScope) throw new Error("Modules are read-only in this scope.");
      setIsMutating(true);
      try {
        const response = await requirementService.createRequirementModule(workspaceSlug, writeScope, payload);
        await refresh();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, writeScope, refresh]
  );

  const updateModule = useCallback(
    async (moduleId: string, payload: TUpdateRequirementModulePayload) => {
      if (!workspaceSlug || !writeScope) throw new Error("Modules are read-only in this scope.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateRequirementModule(
          workspaceSlug,
          writeScope,
          moduleId,
          payload
        );
        await refresh();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, writeScope, refresh]
  );

  /** 删除模块连带删子模块；模块下的需求不删，回到「全部」 */
  const deleteModule = useCallback(
    async (moduleId: string) => {
      if (!workspaceSlug || !writeScope) throw new Error("Modules are read-only in this scope.");
      setIsMutating(true);
      try {
        await requirementService.deleteRequirementModule(workspaceSlug, writeScope, moduleId);
        await refresh();
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, writeScope, refresh]
  );

  /** 批量挂靠 / 移动需求到模块；moduleId 传 null = 移回「全部」 */
  const moveRequirements = useCallback(
    async (requirementIds: string[], moduleId: string | null) => {
      if (!workspaceSlug || !writeScope) throw new Error("Modules are read-only in this scope.");
      setIsMutating(true);
      try {
        await requirementService.setRequirementModule(workspaceSlug, writeScope, {
          requirement_ids: requirementIds,
          module_id: moduleId,
        });
        await refresh();
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, writeScope, refresh]
  );

  return {
    /** 库 / 产品作用域的树；项目作用域恒为 [] */
    modules,
    /** 项目作用域的按产品分组树；库 / 产品作用域恒为 [] */
    groups,
    /** 作用域内全部需求数（含未挂靠的行），「全部」节点的计数 */
    total,
    isLoading,
    isMutating,
    error,
    /** 项目作用域是否只读 */
    isReadonly: writeScope === null,
    refresh,
    createModule,
    updateModule,
    deleteModule,
    moveRequirements,
  };
};

export type TRequirementModulesStore = ReturnType<typeof useRequirementModules>;
