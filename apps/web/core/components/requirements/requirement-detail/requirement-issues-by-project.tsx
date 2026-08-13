/**
 * 产品侧需求详情的「关联工作项」：按项目分组的只读展示。
 *
 * RequirementIssue 挂在 (需求, 项目) 语境下，一条需求进多个项目就各拆各的工作项，
 * 所以产品侧必须按项目分组，不能拍平成一张表。逐项目一个子组件 —— hooks 不能进
 * 循环，每组自己挂一个 useRequirementIssues；需求进的项目通常个位数，逐项目 SWR
 * 可接受。
 *
 * 刻意不提供拆分/解除操作：「拆」必须先落到具体项目（工作项不能没有项目），入口在
 * 项目侧；产品侧只回答「这条需求在各项目里拆了什么、进展到哪」。
 */
import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { Loader } from "@plane/ui";
import { RequirementProjectStageBadges } from "@/components/products/requirements/requirement-project-stage-badges";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useRequirementIssues } from "@/hooks/store/use-requirement-issues";
import { RequirementIssueRow } from "./requirement-issues-section";

/** 单个项目分组：分组头（项目名 + 阶段徽章）+ 该项目下已拆工作项的行列表 */
const ProjectIssuesGroup = ({
  workspaceSlug,
  requirementId,
  projectLink,
  projectName,
  projectIdentifier,
}: {
  workspaceSlug: string;
  requirementId: string;
  projectLink: TRequirement["project_links"][number];
  /** 私密项目解析不到名称时为 undefined，分组头给中性占位，不甩 UUID */
  projectName?: string;
  projectIdentifier?: string;
}) => {
  const { t } = useTranslation();
  const { issues, isLoading, error } = useRequirementIssues({
    workspaceSlug,
    projectId: projectLink.project_id,
    requirementId,
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-12 font-medium text-primary">
          {projectName ?? t("project_requirements.hidden_project")}
        </span>
        {/* 阶段徽章与产品需求网格「项目阶段」列同一组件，单链传入即单枚徽章 */}
        <RequirementProjectStageBadges projectLinks={[projectLink]} resolveProjectName={() => projectName} />
      </div>
      {error ? (
        // 无权查看该项目（403 等）时如实说明，不能把「看不到」误报成「没拆工作项」
        <p className="text-12 text-placeholder">{t("project_requirements.hidden_project")}</p>
      ) : isLoading && !issues.length ? (
        <Loader className="flex flex-col gap-1.5">
          <Loader.Item height="32px" />
        </Loader>
      ) : issues.length ? (
        <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle">
          {issues.map((issue) => (
            <RequirementIssueRow
              key={issue.id}
              workspaceSlug={workspaceSlug}
              issue={issue}
              projectIdentifier={projectIdentifier}
            />
          ))}
        </div>
      ) : (
        <p className="text-12 text-placeholder">{t("project_requirements.issues.group_empty")}</p>
      )}
    </div>
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

  const projectLinks = requirement.project_links ?? [];
  // 没进任何项目就整个 Section 不渲染 —— 没有分组可言，空标题只会让人误找操作入口
  if (!projectLinks.length) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-13 font-medium text-primary">
        {t("project_requirements.issues.section_title")}
      </span>
      <div className="flex flex-col gap-4">
        {projectLinks.map((link) => {
          const detail = projectById.get(link.project_id);
          return (
            <ProjectIssuesGroup
              key={link.project_id}
              workspaceSlug={workspaceSlug}
              requirementId={requirement.id}
              projectLink={link}
              projectName={detail?.name}
              projectIdentifier={detail?.identifier}
            />
          );
        })}
      </div>
    </section>
  );
};
