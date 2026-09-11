import { useTranslation } from "@plane/i18n";
import type { TStageReviewStageSummary } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/**
 * 左栏：研发阶段 + 完成进度。
 *
 * 只列出真的有评审的阶段（后端就是这么返回的）—— 空阶段摆在这里只会让人点进去看
 * 一张空表。进度条是「已评审 / 全部」，与右上角四张卡里的「已评审」同一口径。
 */
export const StageReviewRail = ({
  stages,
  activeStageId,
  onSelect,
}: {
  stages: TStageReviewStageSummary[];
  activeStageId: string | null;
  onSelect: (stageId: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-subtle bg-layer-1 p-2.5">
      <div className="px-2.5 pt-1 pb-2.5 text-11 font-semibold tracking-wider text-tertiary">
        {t(`${I18N}.rail.title`)}
      </div>
      {stages.length === 0 ? (
        <p className="px-2.5 text-12 leading-relaxed text-tertiary">{t(`${I18N}.rail.empty`)}</p>
      ) : (
        stages.map((stage) => {
          const isActive = stage.stage_id === activeStageId;
          const percent = stage.total === 0 ? 0 : Math.round((stage.completed / stage.total) * 100);
          return (
            <button
              type="button"
              key={stage.stage_id}
              onClick={() => onSelect(stage.stage_id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-13 text-secondary transition",
                "hover:bg-layer-2",
                isActive && "bg-surface-1 font-medium text-primary shadow-sm hover:bg-surface-1"
              )}
            >
              <span className="flex-1 truncate text-left">{stage.label}</span>
              <span className="h-[3px] w-11 shrink-0 overflow-hidden rounded-full bg-layer-3">
                <span className="block h-full rounded-full bg-success-primary" style={{ width: `${percent}%` }} />
              </span>
              <span className="shrink-0 text-11 tabular-nums text-tertiary">
                {stage.completed}/{stage.total}
              </span>
            </button>
          );
        })
      )}
    </aside>
  );
};
