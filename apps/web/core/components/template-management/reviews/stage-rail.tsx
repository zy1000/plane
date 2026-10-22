import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TStageReviewGroup } from "@/hooks/store/use-stage-review-templates";

type Props = {
  groups: TStageReviewGroup[];
  selectedStageId: string | null;
  /** 阶段类型 id → 编码（M010…），列表里放在名称前 */
  codeByStageId: Map<string, string>;
  onSelect: (stageId: string) => void;
};

const I18N = "workspace_templates.reviews";

/**
 * 阶段列表。**顺序与内容完全等于工作区设置里的「阶段类型」**（`useStageTypes`）—— 管理员
 * 在那里怎么排、有几个类型，这里就怎么显示，不做任何分组或推断（阶段之间的层级关系数据里
 * 并不存在）。与数据字典 product_stage 无关，那是产品的阶段字段。
 * 右侧计数是该阶段类型下的评审节点总数（评审 + 评审活动）。
 */
export function StageRail(props: Props) {
  const { groups, selectedStageId, codeByStageId, onSelect } = props;
  const { t } = useTranslation();

  return (
    <nav className="flex h-full min-h-0 flex-col gap-px px-2.5 py-3.5">
      <h4 className="px-2 pb-2 text-12 font-medium text-tertiary">
        {t(`${I18N}.rail.title`)} · {groups.length}
      </h4>

      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
        {groups.map((group) => {
          const isSelected = group.stageId === selectedStageId;
          return (
            <button
              key={group.stageId}
              type="button"
              onClick={() => onSelect(group.stageId)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex h-[38px] w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-14 transition-colors",
                isSelected ? "bg-accent-subtle font-semibold text-primary" : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
              )}
            >
              <span
                className={cn(
                  "w-10 shrink-0 truncate font-mono text-11 font-normal",
                  isSelected ? "text-accent-primary" : "text-tertiary"
                )}
              >
                {codeByStageId.get(group.stageId) ?? ""}
              </span>
              <span className="min-w-0 flex-1 truncate">{group.stageLabel}</span>
              <span className="shrink-0 text-12 font-normal tabular-nums text-tertiary" title={t(`${I18N}.rail.count_hint`)}>
                {group.reviewCount + group.activityCount}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
