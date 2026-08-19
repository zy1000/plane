/**
 * 工作项侧反查所挂需求（一条工作项至多挂一条）。
 *
 * 详情「结构」栏的需求选择器读写都走这里。改挂先解后挂，避免
 * 409 ISSUE_ALREADY_LINKED。成功后失效本 key，并失效涉及的
 * requirement-issues 列表（需求侧「关联工作项」section）。
 */
import { useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { RequirementService } from "@/services/requirement.service";
import { getRequirementIssuesKey } from "@/hooks/store/use-requirement-issues";

const requirementService = new RequirementService();

export const getIssueRequirementLinkKey = (workspaceSlug: string, projectId: string, issueId: string) =>
  `issue-requirement-link-${workspaceSlug}-${projectId}-${issueId}`;

export const useIssueRequirementLink = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { data, isLoading, mutate } = useSWR(
    workspaceSlug && projectId && issueId
      ? getIssueRequirementLinkKey(workspaceSlug, projectId, issueId)
      : null,
    () => requirementService.getIssueRequirementLink(workspaceSlug, projectId, issueId)
  );

  const invalidateRequirementIssues = useCallback(
    (requirementId: string) => {
      if (!workspaceSlug || !projectId || !requirementId) return;
      void globalMutate(getRequirementIssuesKey(workspaceSlug, projectId, requirementId));
    },
    [projectId, workspaceSlug]
  );

  /**
   * 把工作项挂到 nextId；传 null 只解除。已挂同一条则 noop。
   * unlink 成功而 link 失败时仍会刷新本 key，UI 落到「无需求」。
   */
  const setRequirement = useCallback(
    async (nextId: string | null) => {
      if (!workspaceSlug || !projectId || !issueId) return;
      const currentId = data?.requirement_id ?? null;
      if (currentId === nextId) return;

      try {
        if (currentId) {
          await requirementService.unlinkIssueFromRequirement(workspaceSlug, projectId, currentId, issueId);
          invalidateRequirementIssues(currentId);
        }
        if (nextId) {
          await requirementService.linkIssuesToRequirement(workspaceSlug, projectId, nextId, [issueId]);
          invalidateRequirementIssues(nextId);
        }
      } finally {
        await mutate();
      }
    },
    [data?.requirement_id, invalidateRequirementIssues, issueId, mutate, projectId, workspaceSlug]
  );

  return {
    link: data ?? null,
    isLoading,
    mutate,
    setRequirement,
  };
};
