/**
 * 项目需求网格里的「阶段」列。
 *
 * 阶段是**纯派生**的：由关联迭代/发布单等事实按阶梯取最高档算出（见后端
 * utils/requirement_project.recalculate_stage），手动改阶段入口已退役。所以这一列
 * 恒为只读胶囊，hover 用 tooltip 解释推导依据（"因关联发布单「xxx」"）。
 *
 * 阶段与 Requirement.status（全局交付进度）是正交的两根轴：同一条需求可以在 A 项目
 * 已发布、在 B 项目还没开工，所以它长在关联行上而不是需求本体上。
 */
import { useTranslation } from "@plane/i18n";
import type { TRequirementProjectStage } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";

/** 阶段是有序推进的，配色跟着「越靠后越接近完成」走 */
export const REQUIREMENT_STAGE_PILL: Record<TRequirementProjectStage, string> = {
  linked: "bg-layer-3 text-secondary",
  planned: "bg-accent-subtle text-accent-primary",
  in_progress: "bg-warning-subtle text-warning-primary",
  done: "bg-success-subtle text-success-primary",
  pending_verification: "bg-warning-subtle text-warning-primary",
  released: "bg-success-subtle text-success-primary",
};

type TProps = {
  stage: TRequirementProjectStage;
  /** 最新有效迭代关联的迭代名；planned 档的推导依据，无名字时回退到 linked 文案 */
  latestCycleName?: string | null;
  /** 最新在途/已发布发布单名；pending_verification / released 档的推导依据 */
  latestReleaseName?: string | null;
  /** 已排期但关联迭代已结束。时间盒到期不降档，只加黄点并在 tooltip 里说明 */
  carryover?: boolean;
};

export const ProjectRequirementStageCell = ({
  stage,
  latestCycleName,
  latestReleaseName,
  carryover = false,
}: TProps) => {
  const { t } = useTranslation();

  /** 推导依据。带名字的档在名字缺失时回退到「已关联到本项目」，不留空洞 */
  const reason = (() => {
    switch (stage) {
      case "planned":
        return latestCycleName
          ? t("project_requirements.stage_reason.planned", { name: latestCycleName })
          : t("project_requirements.stage_reason.linked");
      case "pending_verification":
        return latestReleaseName
          ? t("project_requirements.stage_reason.pending_verification", { name: latestReleaseName })
          : t("project_requirements.stage_reason.linked");
      case "released":
        return latestReleaseName
          ? t("project_requirements.stage_reason.released", { name: latestReleaseName })
          : t("project_requirements.stage_reason.linked");
      default:
        // linked / in_progress / done 的文案不带插值
        return t(`project_requirements.stage_reason.${stage}`);
    }
  })();

  const showCarryover = stage === "planned" && carryover;
  const tooltipContent = showCarryover
    ? `${reason} · ${t("project_requirements.stage_carryover")}`
    : reason;

  return (
    <Tooltip tooltipContent={tooltipContent} position="top">
      <span className="inline-flex max-w-full items-center gap-1">
        <span
          className={cn(
            "inline-flex h-5 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded px-1.5 text-11 font-medium",
            REQUIREMENT_STAGE_PILL[stage]
          )}
        >
          <span className="truncate">{t(`project_requirements.stage.${stage}`)}</span>
        </span>
        {/* 迭代已结束仍停在已排期：黄点提醒，不降档（carryover 语义） */}
        {showCarryover && (
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning-primary" />
        )}
      </span>
    </Tooltip>
  );
};
