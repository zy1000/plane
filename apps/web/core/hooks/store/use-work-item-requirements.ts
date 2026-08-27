/**
 * 工作项详情「关联需求」区块的局部状态（SWR，不进 MobX root store；照同目录
 * use-requirement-issues 的形状，方向相反）。
 *
 * 需求 ↔ 工作项是多对多：一条工作项可以挂多条需求，这里拿到的是数组。写操作成功后
 * 失效本 key，并失效涉及的 requirement-issues 列表（需求侧「关联工作项」section），
 * 两侧同开时才同步。
 *
 * 命名刻意用 work-item 而不是 issue：与 use-requirement-issues 只差词序，极易拿错。
 */
import { useCallback, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import type { TProjectRequirement } from "@plane/types";
import { getRequirementIssuesKey } from "@/hooks/store/use-requirement-issues";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/** 一次拉全量：一条工作项挂的需求是个位数，不做分页交互 */
const WORK_ITEM_REQUIREMENTS_PAGE_SIZE = 100;

export const getWorkItemRequirementsKey = (workspaceSlug: string, projectId: string, issueId: string) =>
  `work-item-requirements-${workspaceSlug}-${projectId}-${issueId}`;

export const useWorkItemRequirements = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { data, error, isLoading, mutate } = useSWR(
    workspaceSlug && projectId && issueId ? getWorkItemRequirementsKey(workspaceSlug, projectId, issueId) : null,
    () =>
      requirementService.listIssueRequirements(workspaceSlug, projectId, issueId, {
        perPage: WORK_ITEM_REQUIREMENTS_PAGE_SIZE,
      }),
    // 无 requirement_link.view 权限的用户每次打开工作项都会 403，别按全局配置重试三次；
    // 出错时区块静默不渲染
    { shouldRetryOnError: false }
  );

  const requirements: TProjectRequirement[] = useMemo(() => data?.results ?? [], [data]);

  const invalidateRequirementIssues = useCallback(
    (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId) return;
      requirementIds.forEach((requirementId) => {
        void globalMutate(getRequirementIssuesKey(workspaceSlug, projectId, requirementId));
      });
    },
    [projectId, workspaceSlug]
  );

  /** 批量把需求挂到本工作项。失败往上抛，由调用方就地提示 */
  const linkRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId || !issueId || requirementIds.length === 0) return;
      await requirementService.linkRequirementsToIssue(workspaceSlug, projectId, issueId, {
        requirements: requirementIds,
      });
      invalidateRequirementIssues(requirementIds);
      await mutate();
    },
    [invalidateRequirementIssues, issueId, mutate, projectId, workspaceSlug]
  );

  /** 解除与单条需求的关联。失败同样往上抛 */
  const unlinkRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !projectId || !issueId) return;
      await requirementService.unlinkRequirementFromIssue(workspaceSlug, projectId, issueId, requirementId);
      invalidateRequirementIssues([requirementId]);
      await mutate();
    },
    [invalidateRequirementIssues, issueId, mutate, projectId, workspaceSlug]
  );

  return {
    requirements,
    isLoading,
    error,
    mutate,
    linkRequirements,
    unlinkRequirement,
  };
};
