/**
 * 需求「关联工作项」section 的局部状态（照 releases/release-overview/use-release-requirements
 * 的 SWR 写法，但不进 MobX root store）。
 *
 * 注意：linkIssues / unlinkIssue 成功后只 mutate 本列表，**调用方还需自行刷新需求行** ——
 * 关联/解除会触发服务端 recalculate_stage，研发段档位可能被重算，落地值以响应/重拉为准
 * （与 useProjectRequirements.updateStage 同口径）。
 */
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { TRequirementIssue } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

type TUseRequirementIssuesProps = {
  workspaceSlug: string;
  projectId: string;
  requirementId: string;
  /** section 不可见（抽屉未展开等）时不发请求 */
  enabled?: boolean;
};

/**
 * 关联工作项列表的 SWR key。
 *
 * 导出是为了让**不展示这份列表**的地方（如工作项状态流转后的回调）也能在数据变化后
 * 按 key 失效缓存 —— 用全局 mutate 而不是再挂一个 hook，省掉一次没人看的请求。
 */
export const getRequirementIssuesKey = (workspaceSlug: string, projectId: string, requirementId: string) =>
  `requirement-issues-${workspaceSlug}-${projectId}-${requirementId}`;

export const useRequirementIssues = ({
  workspaceSlug,
  projectId,
  requirementId,
  enabled = true,
}: TUseRequirementIssuesProps) => {
  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR(
    enabled && workspaceSlug && projectId && requirementId
      ? getRequirementIssuesKey(workspaceSlug, projectId, requirementId)
      : null,
    () => requirementService.listRequirementIssues(workspaceSlug, projectId, requirementId)
  );

  const issues: TRequirementIssue[] = useMemo(() => data ?? [], [data]);

  /** 批量关联已有工作项。失败往上抛 —— 409 ISSUE_ALREADY_LINKED 要由调用方展示冲突需求编号 */
  const linkIssues = useCallback(
    async (issueIds: string[]) => {
      if (!workspaceSlug || !projectId || !requirementId || issueIds.length === 0) return;
      await requirementService.linkIssuesToRequirement(workspaceSlug, projectId, requirementId, issueIds);
      await mutate();
    },
    [mutate, projectId, requirementId, workspaceSlug]
  );

  /** 解除单条工作项关联。失败同样往上抛，由调用方就地提示 */
  const unlinkIssue = useCallback(
    async (issueId: string) => {
      if (!workspaceSlug || !projectId || !requirementId) return;
      await requirementService.unlinkIssueFromRequirement(workspaceSlug, projectId, requirementId, issueId);
      await mutate();
    },
    [mutate, projectId, requirementId, workspaceSlug]
  );

  return {
    issues,
    isLoading,
    error,
    mutate,
    linkIssues,
    unlinkIssue,
  };
};
