import { useCallback, useEffect, useState } from "react";
import type { TRequirementVersion } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/** 一条需求的版本数是个位数量级，一次取满比分页更省一次交互 */
const PAGE_SIZE = 50;

/**
 * 一条需求的版本链。
 *
 * 与变更轨迹是两份数据：轨迹是「谁在什么时候动了哪几项」（含待审与被驳回的），
 * 版本链只有**通过审批**的那些，每一版都带着当时的内容与当时的字段结构。
 */
export const useRequirementVersions = ({
  workspaceSlug,
  productId,
  requirementId,
  enabled = true,
}: {
  workspaceSlug: string;
  productId: string;
  requirementId: string | null;
  /** 折叠着的时候不拉 —— 大多数人打开详情不会看版本 */
  enabled?: boolean;
}) => {
  const [versions, setVersions] = useState<TRequirementVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!workspaceSlug || !productId || !requirementId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listRequirementVersions(
        workspaceSlug,
        productId,
        requirementId,
        { perPage: PAGE_SIZE }
      );
      setVersions(response?.results ?? []);
    } catch {
      setError("Unable to load version history.");
    } finally {
      setIsLoading(false);
    }
  }, [productId, requirementId, workspaceSlug]);

  useEffect(() => {
    setVersions([]);
    setError(null);
  }, [requirementId]);

  useEffect(() => {
    if (!enabled) return;
    void fetchVersions();
  }, [enabled, fetchVersions]);

  /**
   * 回滚到某一版。
   *
   * 版本链不会因此变化（回滚不写新版本，也不撤销已通过的那些），所以这里只需要把结果
   * 交回调用方去刷新那一行。
   */
  const rollback = useCallback(
    async (version: number) => {
      if (!workspaceSlug || !productId || !requirementId) throw new Error("Requirement is required.");
      setIsRollingBack(true);
      try {
        return await requirementService.rollbackRequirement(workspaceSlug, productId, requirementId, version);
      } finally {
        setIsRollingBack(false);
      }
    },
    [productId, requirementId, workspaceSlug]
  );

  return { versions, isLoading, isRollingBack, error, refresh: fetchVersions, rollback };
};
