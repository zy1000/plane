/**
 * 产品侧需求详情的关联区：快捷操作条 + 按项目分组的工作项 + 用例。
 *
 * 拆分 / 关联工作项必须落到具体项目（RequirementIssue 挂在 (需求, 项目) 下）。
 * 需求只进了一个项目就直接开弹窗；进了多个先选项目；还没进项目则提示先关联。
 * 用例关联是需求级的，不需要项目。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement } from "@plane/types";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { RequirementRelationActionButtons } from "./requirement-relation-action-buttons";
import { RequirementIssuesByProject } from "./requirement-issues-by-project";
import { RequirementIssuesSection } from "./requirement-issues-section";
import { RequirementTestCasesSection } from "./requirement-testcases-section";

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  canManage: boolean;
  onChanged?: () => void;
};

export const RequirementProductRelations = (props: TProps) => {
  const { workspaceSlug, productId, requirement, canManage, onChanged } = props;
  const { t } = useTranslation();
  const { links } = useProductProjects({ workspaceSlug, productId });
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [isLinkIssueOpen, setIsLinkIssueOpen] = useState(false);
  const [isLinkCaseOpen, setIsLinkCaseOpen] = useState(false);

  const issueProjects = useMemo(() => {
    const nameById = new Map(
      links.map((link) => [link.project, link.project_detail?.name ?? t("project_requirements.hidden_project")])
    );
    return (requirement.project_ids ?? []).map((id) => ({
      id,
      name: nameById.get(id) ?? t("project_requirements.hidden_project"),
    }));
  }, [links, requirement.project_ids, t]);

  const beginIssueAction = (kind: "split" | "link", projectId?: string) => {
    const resolved = projectId ?? (issueProjects.length === 1 ? issueProjects[0].id : undefined);
    if (!resolved) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_requirements.issues.link_project_first"),
      });
      return;
    }
    setActionProjectId(resolved);
    if (kind === "split") setIsSplitOpen(true);
    else setIsLinkIssueOpen(true);
  };

  return (
    <div className="flex flex-col space-y-4">
      {canManage && (
        <RequirementRelationActionButtons
          issueProjects={issueProjects}
          onSplit={(projectId) => beginIssueAction("split", projectId)}
          onLinkIssue={(projectId) => beginIssueAction("link", projectId)}
          onLinkTestCase={() => setIsLinkCaseOpen(true)}
        />
      )}
      <div className="flex flex-col">
        <RequirementIssuesByProject workspaceSlug={workspaceSlug} requirement={requirement} />
        <RequirementTestCasesSection
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirement.id}
          canManage={canManage}
          hideWhenEmpty
          hideAddActions
          linkModalOpen={isLinkCaseOpen}
          onLinkModalOpenChange={setIsLinkCaseOpen}
        />
        {actionProjectId && (
          <RequirementIssuesSection
            workspaceSlug={workspaceSlug}
            projectId={actionProjectId}
            requirementId={requirement.id}
            requirement={requirement}
            canManage={canManage}
            onChanged={onChanged}
            hideList
            hideAddActions
            splitModalOpen={isSplitOpen}
            onSplitModalOpenChange={setIsSplitOpen}
            linkModalOpen={isLinkIssueOpen}
            onLinkModalOpenChange={setIsLinkIssueOpen}
          />
        )}
      </div>
    </div>
  );
};
