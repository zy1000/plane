/**
 * 工作项详情「关联风险」区块的局部状态（SWR，不进 MobX root store；照同目录
 * use-work-item-requirements 的形状）。
 *
 * 风险 ↔ 缺陷是多对多：一条缺陷可以挂多条风险。只有类别为「缺陷」的工作项才会渲染这个区块，
 * 非缺陷调接口会 400，所以调用方要先判类型再用这个 hook（传空 issueId 即不请求）。
 */
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { TRisk } from "@plane/types";
import { RiskService } from "@/services/risk.service";

const riskService = new RiskService();

export const getWorkItemRisksKey = (workspaceSlug: string, projectId: string, issueId: string) =>
  `work-item-risks-${workspaceSlug}-${projectId}-${issueId}`;

export const useWorkItemRisks = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { data, error, isLoading, mutate } = useSWR(
    workspaceSlug && projectId && issueId ? getWorkItemRisksKey(workspaceSlug, projectId, issueId) : null,
    () => riskService.listIssueRisks(workspaceSlug, projectId, issueId),
    // 出错（非成员 403 等）时区块静默不渲染，别按全局配置重试三次
    { shouldRetryOnError: false }
  );

  const risks: TRisk[] = useMemo(() => data ?? [], [data]);

  /** 批量把风险挂到本缺陷。失败往上抛，由调用方就地提示 */
  const linkRisks = useCallback(
    async (riskIds: string[]) => {
      if (!workspaceSlug || !projectId || !issueId || riskIds.length === 0) return;
      const next = await riskService.linkRisksToIssue(workspaceSlug, projectId, issueId, riskIds);
      await mutate(next, { revalidate: false });
    },
    [issueId, mutate, projectId, workspaceSlug]
  );

  const unlinkRisk = useCallback(
    async (riskId: string) => {
      if (!workspaceSlug || !projectId || !issueId) return;
      await riskService.unlinkRiskFromIssue(workspaceSlug, projectId, issueId, riskId);
      await mutate((current) => (current ?? []).filter((risk) => risk.id !== riskId), { revalidate: false });
    },
    [issueId, mutate, projectId, workspaceSlug]
  );

  return { risks, isLoading, error, mutate, linkRisks, unlinkRisk };
};
