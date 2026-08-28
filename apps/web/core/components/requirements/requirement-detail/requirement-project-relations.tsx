/**
 * 项目侧需求抽屉的关联区：两个折叠列表，动作各自挂在自己的标题行上。
 *
 * 产品侧没有项目语境，不能拆工作项，所以不走这里；产品页继续各自注入
 * RequirementIssuesByProject / RequirementTestCasesSection。
 */
import type { TRequirement } from "@plane/types";
import { RequirementIssuesSection } from "./requirement-issues-section";
import { RequirementTestCasesSection } from "./requirement-testcases-section";

type TProps = {
  workspaceSlug: string;
  projectId: string;
  productId?: string | null;
  requirementId: string;
  requirement: Pick<TRequirement, "title" | "description_html" | "priority"> & {
    linked_cycle_ids?: string[];
  };
  canManage: boolean;
  onChanged?: () => void;
};

export const RequirementProjectRelations = (props: TProps) => {
  const { workspaceSlug, projectId, productId, requirementId, requirement, canManage, onChanged } = props;

  return (
    <div className="flex flex-col gap-6">
      {/* 能管理时空列表也要出现 —— 拆分 / 关联的入口就在标题行上；只读时空列表没东西可看 */}
      <RequirementIssuesSection
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        requirementId={requirementId}
        requirement={requirement}
        canManage={canManage}
        onChanged={onChanged}
        hideWhenEmpty={!canManage}
      />
      {productId && (
        <RequirementTestCasesSection
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirementId}
          canManage={canManage}
          scopeProjectId={projectId}
          hideWhenEmpty={!canManage}
        />
      )}
    </div>
  );
};
