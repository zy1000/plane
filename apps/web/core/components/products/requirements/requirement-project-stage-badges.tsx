/**
 * 产品需求网格「项目阶段」列的单元格。
 *
 * 一条需求可以进多个项目、各有各的阶段（project_links），所以这里是多枚小徽章；
 * 徽章文案只有阶段，是哪个项目的靠 tooltip（「项目名 · 阶段」）。零关联渲染灰色
 * 「未开始」—— 那是纯前端展示值，不落库（阶段阶梯的第 0 档）。
 */
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementProjectStage } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 阶段徽章配色，越靠后越接近完成 —— 与项目侧 projects/requirements/
 * project-requirement-stage-cell.tsx 的 REQUIREMENT_STAGE_PILL 同谱，就地定义
 * 避免产品侧跨目录依赖项目侧组件。
 */
const STAGE_BADGE_CLASS: Record<TRequirementProjectStage, string> = {
  linked: "bg-layer-3 text-secondary",
  planned: "bg-accent-subtle text-accent-primary",
  in_progress: "bg-warning-subtle text-warning-primary",
  done: "bg-success-subtle text-success-primary",
  pending_verification: "bg-warning-subtle text-warning-primary",
  released: "bg-success-subtle text-success-primary",
};

type TProps = {
  projectLinks: TRequirement["project_links"];
  /** project_id -> 项目名。私密项目取不到名称时，tooltip 退化为只显示阶段 */
  resolveProjectName: (projectId: string) => string | undefined;
};

export const RequirementProjectStageBadges = ({ projectLinks, resolveProjectName }: TProps) => {
  const { t } = useTranslation();

  if (!projectLinks.length) {
    return (
      <span className="inline-flex h-5 items-center whitespace-nowrap rounded bg-layer-3 px-1.5 text-11 font-medium text-secondary">
        {t("project_requirements.stage_not_started")}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {projectLinks.map((link) => {
        const stageLabel = t(`project_requirements.stage.${link.stage}`);
        const projectName = resolveProjectName(link.project_id);
        return (
          <Tooltip key={link.project_id} tooltipContent={projectName ? `${projectName} · ${stageLabel}` : stageLabel}>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-11 font-medium",
                STAGE_BADGE_CLASS[link.stage]
              )}
            >
              {stageLabel}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
};
