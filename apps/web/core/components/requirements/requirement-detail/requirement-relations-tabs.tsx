/**
 * 整页的关联区：与抽屉 / 工作项详情同一套 —— 顶上一排快捷操作，
 * 下面只渲染有内容的折叠块。空的子需求 / 工作项不占位，也不先甩「请先关联到项目」。
 *
 * 拆分 / 关联的项目落点规则与抽屉共用 useProductRelationActions。
 */
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { RequirementSubRequirementList } from "./requirement-detail-content";
import { RequirementIssuesByProject } from "./requirement-issues-by-project";
import { RequirementIssuesSection } from "./requirement-issues-section";
import { useProductRelationActions } from "./requirement-product-relations";
import { RequirementRelationActionButtons } from "./requirement-relation-action-buttons";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";
import { RequirementTestCasesSection } from "./requirement-testcases-section";

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  subRequirements: TRequirement[];
  canManage: boolean;
  onChanged?: () => void;
  onOpenRequirement: (requirementId: string) => void;
};

export const RequirementRelationsTabs = (props: TProps) => {
  const { workspaceSlug, productId, requirement, subRequirements, canManage, onChanged, onOpenRequirement } = props;
  const { t } = useTranslation();
  const actions = useProductRelationActions({ workspaceSlug, productId, requirement });

  return (
    <div className="flex flex-col space-y-4">
      {canManage && (
        <RequirementRelationActionButtons
          issueProjects={actions.issueProjects}
          onSplit={(projectId) => actions.beginIssueAction("split", projectId)}
          onLinkIssue={(projectId) => actions.beginIssueAction("link", projectId)}
          onLinkTestCase={() => actions.setIsLinkCaseOpen(true)}
        />
      )}
      {subRequirements.length > 0 && (
        <RequirementRelationCollapsible
          title={t("requirement_detail.sub_requirements")}
          count={subRequirements.length}
        >
          <div className="pb-3">
            <RequirementSubRequirementList items={subRequirements} framed={false} onOpen={onOpenRequirement} />
          </div>
        </RequirementRelationCollapsible>
      )}
      <RequirementIssuesByProject
        workspaceSlug={workspaceSlug}
        requirement={requirement}
        canManage={canManage}
        onChanged={onChanged}
      />
      <RequirementTestCasesSection
        workspaceSlug={workspaceSlug}
        productId={productId}
        requirementId={requirement.id}
        canManage={canManage}
        hideWhenEmpty
        hideAddActions
        linkModalOpen={actions.isLinkCaseOpen}
        onLinkModalOpenChange={actions.setIsLinkCaseOpen}
      />
      {actions.actionProjectId && (
        <RequirementIssuesSection
          workspaceSlug={workspaceSlug}
          projectId={actions.actionProjectId}
          requirementId={requirement.id}
          requirement={requirement}
          canManage={canManage}
          onChanged={onChanged}
          hideList
          hideAddActions
          splitModalOpen={actions.isSplitOpen}
          onSplitModalOpenChange={actions.setIsSplitOpen}
          linkModalOpen={actions.isLinkIssueOpen}
          onLinkModalOpenChange={actions.setIsLinkIssueOpen}
        />
      )}
    </div>
  );
};
