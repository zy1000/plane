import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TStageReviewGroup } from "@/hooks/store/use-stage-review-templates";

type Props = {
  groups: TStageReviewGroup[];
  selectedStageId: string | null;
  onSelect: (stageId: string) => void;
};

const I18N = "workspace_templates.reviews";

/**
 * 阶段列表。**顺序与内容完全等于数据字典 product_stage** —— 管理员在数据字典里怎么排、
 * 有几个值，这里就怎么显示，不做任何分组或推断（阶段之间的层级关系数据里并不存在）。
 * 右侧计数是「评审数 · 评审活动数」。
 */
export function StageRail(props: Props) {
  const { groups, selectedStageId, onSelect } = props;
  const { t } = useTranslation();

  return (
    <nav className="flex h-full min-h-0 flex-col gap-1 rounded-lg border border-subtle bg-surface-1 p-2">
      <h4 className="flex items-center justify-between px-2.5 pt-1.5 pb-1 text-11 font-medium tracking-wider text-tertiary">
        {t(`${I18N}.rail.title`)}
        <span className="tabular-nums">{groups.length}</span>
      </h4>

      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-gutter:stable]">
        {groups.map((group) => {
          const isSelected = group.stageId === selectedStageId;
          return (
            <button
              key={group.stageId}
              type="button"
              onClick={() => onSelect(group.stageId)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex h-9 w-full shrink-0 items-center justify-between gap-2 rounded-md px-2.5 text-left text-13 transition-colors",
                isSelected
                  ? "bg-accent-primary/10 font-medium text-accent-primary"
                  : "text-secondary hover:bg-layer-1-hover"
              )}
            >
              <span className="truncate">{group.stageLabel}</span>
              <span
                className={cn(
                  "shrink-0 text-11 tabular-nums",
                  isSelected ? "text-accent-primary" : "text-tertiary"
                )}
                title={t(`${I18N}.rail.count_hint`)}
              >
                {group.reviewCount} · {group.activityCount}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
