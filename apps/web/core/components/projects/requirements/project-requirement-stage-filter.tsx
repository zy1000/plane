/**
 * 阶段筛选条：「全部」+ REQUIREMENT_PROJECT_STAGES 的每一档，每段带计数。
 * 段数跟随枚举走，不在这里硬编码；计数键由后端 by_stage 保证恒存在（含 0）。
 *
 * 视觉照 issues/defects/defect-quick-filter-bar.tsx 的分段控件（track + 白色滑块），
 * 与仓库里其余「一行内切筛选」的控件同款。
 *
 * 计数口径由服务端定死：这些数字跟随当前选中的产品，但**不**跟随阶段自身 ——
 * 选了「研发中」之后其余各段的数字必须保持不变，否则用户点进去就回不来了。
 * 见 utils/requirement_project.requirement_facets。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementProjectStage } from "@plane/types";
import { REQUIREMENT_PROJECT_STAGES } from "@plane/types";
import { cn } from "@plane/utils";

export const STAGE_PARAM = "stage";

/** 把 URL 里的 stage 规整为受支持的阶段；非法值回落「全部」。照 getDefectPreset 的范式 */
export const getStageFromParam = (
  value: string | null | undefined
): TRequirementProjectStage | undefined =>
  value && (REQUIREMENT_PROJECT_STAGES as string[]).includes(value)
    ? (value as TRequirementProjectStage)
    : undefined;

type TProps = {
  value: TRequirementProjectStage | undefined;
  counts: Record<TRequirementProjectStage, number> | undefined;
  /** 「全部」那一段的计数 */
  totalCount: number;
  onChange: (stage: TRequirementProjectStage | undefined) => void;
};

export const ProjectRequirementStageFilter: FC<TProps> = ({ value, counts, totalCount, onChange }) => {
  const { t } = useTranslation();

  const segmentBase =
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-3 text-body-xs-medium transition-colors";
  const activeClass = "bg-surface-1 text-primary shadow-sm";
  const inactiveClass = "text-secondary hover:text-primary";

  const renderSegment = (
    key: string,
    label: string,
    count: number | undefined,
    isActive: boolean,
    onClick: () => void
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(segmentBase, isActive ? activeClass : inactiveClass)}
    >
      <span className="whitespace-nowrap">{label}</span>
      {typeof count === "number" && (
        // 计数为 0 也照常显示 —— 「已发布 0」本身就是要传达的信息
        <span
          className={cn(
            "tabular-nums",
            isActive ? "text-accent-primary" : "text-placeholder"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-12 text-tertiary">{t("project_requirements.stage_column")}</span>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-surface-2/50 p-0.5 vertical-scrollbar scrollbar-sm">
        {renderSegment(
          "all",
          t("project_requirements.all_stages"),
          totalCount,
          value === undefined,
          () => onChange(undefined)
        )}
        {REQUIREMENT_PROJECT_STAGES.map((stage) =>
          renderSegment(
            stage,
            t(`project_requirements.stage.${stage}`),
            counts?.[stage],
            value === stage,
            () => onChange(stage)
          )
        )}
      </div>
    </div>
  );
};
