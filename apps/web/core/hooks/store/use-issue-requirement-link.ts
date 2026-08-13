/**
 * 工作项侧反查所挂需求（一条工作项至多挂一条需求，所以是单个对象而非列表）。
 *
 * 只服务详情侧栏 / peek 属性栏的只读芯片：端点在无关联时返回 null，消费方据此
 * 整行不渲染（不占位）。改关联回需求侧的「关联工作项」section 操作，所以这里
 * 不暴露任何 mutation —— 与 use-requirement-issues 的读写 hook 刻意区分。
 */
import useSWR from "swr";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

export const useIssueRequirementLink = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { data, isLoading } = useSWR(
    workspaceSlug && projectId && issueId
      ? `issue-requirement-link-${workspaceSlug}-${projectId}-${issueId}`
      : null,
    () => requirementService.getIssueRequirementLink(workspaceSlug, projectId, issueId)
  );

  return {
    /** null = 未挂任何需求（或还没加载完）—— 两种情况芯片行都不渲染 */
    link: data ?? null,
    isLoading,
  };
};
