/**
 * 产品侧需求详情的「关联工作项」：只读列表。
 *
 * RequirementIssue 挂在 (需求, 项目) 下，hooks 不能进循环，所以仍逐项目拉数；
 * 界面不再用项目名分组 —— 行上的编号（如 CAC2-1）已经带项目前缀。
 *
 * 刻意不提供拆分/解除操作：「拆」必须先落到具体项目，入口在项目侧。
 */
import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { Loader } from "@plane/ui";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useRequirementIssues } from "@/hooks/store/use-requirement-issues";
import { RequirementIssueRow } from "./requirement-issues-section";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";

/** 单个项目的数据单元：只出工作项行，不出项目名分组头 */
const ProjectIssuesGroup = ({
  workspaceSlug,
  requirementId,
  projectId,
  projectIdentifier,
}: {
  workspaceSlug: string;
  requirementId: string;
  projectId: string;
  projectIdentifier?: string;
}) => {
  const { t } = useTranslation();
  const { issues, isLoading, error } = useRequirementIssues({
    workspaceSlug,
    projectId,
    requirementId,
  });

  if (error) {
    // 无权查看该项目（403 等）时如实说明，不能把「看不到」误报成「没拆工作项」
    return <p className="px-2.5 text-13 text-tertiary">{t("project_requirements.hidden_project")}</p>;
  }
  if (isLoading && !issues.length) {
    return (
      <Loader className="flex flex-col gap-1.5 px-2.5">
        <Loader.Item height="32px" />
      </Loader>
    );
  }
  if (!issues.length) return null;

  return (
    <>
      {issues.map((issue) => (
        <RequirementIssueRow
          key={issue.id}
          workspaceSlug={workspaceSlug}
          issue={issue}
          projectIdentifier={projectIdentifier}
        />
      ))}
    </>
  );
};

export const RequirementIssuesByProject = ({
  workspaceSlug,
  requirement,
}: {
  workspaceSlug: string;
  requirement: TRequirement;
}) => {
  const { t } = useTranslation();
  // 项目名/标识与详情页「所属项目」多选同源（产品 ↔ 项目关联表）；候选只含当前用户
  // 可见的项目，解析不到 = 私密项目
  const { links } = useProductProjects({ workspaceSlug, productId: requirement.product_id ?? undefined });
  const projectById = useMemo(
    () => new Map(links.map((link) => [link.project, link.project_detail])),
    [links]
  );

  const projectIds = requirement.project_ids ?? [];
  // 没进任何项目就整个 Section 不渲染 —— 没有分组可言，空标题只会让人误找操作入口
  if (!projectIds.length) return null;

  return (
    <>
      <RequirementRelationCollapsible title={t("project_requirements.issues.widget_title")}>
        <div className="flex flex-col pb-3">
          {projectIds.map((projectId) => {
            const detail = projectById.get(projectId);
            return (
              <ProjectIssuesGroup
                key={projectId}
                workspaceSlug={workspaceSlug}
                requirementId={requirement.id}
                projectId={projectId}
                projectIdentifier={detail?.identifier}
              />
            );
          })}
        </div>
      </RequirementRelationCollapsible>
      <IssuePeekOverview />
    </>
  );
};
