/**
 * 项目侧需求抽屉的关联区：一条快捷操作条 + 两个折叠列表。
 *
 * 产品侧没有项目语境，不能拆工作项，所以不走这里；产品页继续各自注入
 * RequirementIssuesByProject / RequirementTestCasesSection。
 */
import { useState } from "react";
import type { TRequirement } from "@plane/types";
import { RequirementRelationActionButtons } from "./requirement-relation-action-buttons";
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
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [isLinkIssueOpen, setIsLinkIssueOpen] = useState(false);
  const [isLinkCaseOpen, setIsLinkCaseOpen] = useState(false);

  return (
    <div className="flex flex-col space-y-4">
      {canManage && (
        <RequirementRelationActionButtons
          onSplit={() => setIsSplitOpen(true)}
          onLinkIssue={() => setIsLinkIssueOpen(true)}
          onLinkTestCase={productId ? () => setIsLinkCaseOpen(true) : undefined}
        />
      )}
      <div className="flex flex-col">
        <RequirementIssuesSection
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          requirementId={requirementId}
          requirement={requirement}
          canManage={canManage}
          onChanged={onChanged}
          hideWhenEmpty
          hideAddActions
          splitModalOpen={isSplitOpen}
          onSplitModalOpenChange={setIsSplitOpen}
          linkModalOpen={isLinkIssueOpen}
          onLinkModalOpenChange={setIsLinkIssueOpen}
        />
        {productId && (
          <RequirementTestCasesSection
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirementId}
            canManage={canManage}
            scopeProjectId={projectId}
            hideWhenEmpty
            hideAddActions
            linkModalOpen={isLinkCaseOpen}
            onLinkModalOpenChange={setIsLinkCaseOpen}
          />
        )}
      </div>
    </div>
  );
};
