import { useCallback, useMemo, useState } from "react";
import { RequirementService, type TRequirementModule, type TRequirementType } from "@/services/requirement.service";

const requirementService = new RequirementService();

export const useRequirementModules = (
  workspaceSlug?: string,
  productId?: string,
  requirementType: TRequirementType = "user"
) => {
  const [modules, setModules] = useState<TRequirementModule[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const fetchModules = useCallback(async () => {
    if (!workspaceSlug || !productId) return undefined;
    setIsLoading(true);
    try {
      const response = await requirementService.getModules(workspaceSlug, productId, requirementType);
      setModules(response.modules);
      setTotal(response.total);
      return response;
    } finally {
      setIsLoading(false);
    }
  }, [productId, requirementType, workspaceSlug]);

  const createModule = useCallback(
    async (name: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.createModule(workspaceSlug, productId, name);
        setModules((current) => [...current, response].sort((a, b) => a.name.localeCompare(b.name)));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const updateModule = useCallback(
    async (moduleId: string, name: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.updateModule(workspaceSlug, productId, moduleId, name);
        setModules((current) =>
          current.map((item) => (item.id === moduleId ? response : item)).sort((a, b) => a.name.localeCompare(b.name))
        );
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const deleteModule = useCallback(
    async (moduleId: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.deleteModule(workspaceSlug, productId, moduleId);
        setModules((current) => current.filter((item) => item.id !== moduleId));
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  return useMemo(
    () => ({ modules, total, isLoading, isMutating, fetchModules, createModule, updateModule, deleteModule }),
    [createModule, deleteModule, fetchModules, isLoading, isMutating, modules, total, updateModule]
  );
};
