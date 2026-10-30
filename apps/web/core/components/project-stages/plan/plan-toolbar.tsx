import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TPlanScale } from "./plan-scale";
import { PlanSegmented } from "./plan-segmented";
import type { TPlanLevel } from "./plan-tree";
import { PLAN_CYCLE_COLORS } from "./plan-row-bars";

const I18N = "project_stage.plan";

export type TPlanCounts = { stages: number; cycles: number; issues: number; milestones: number; delayed: number };

/** 规划视图顶栏：左边图例 + 计数，右边展开层级、时间刻度、回到今天 */
export const PlanToolbar = ({
  counts,
  level,
  onLevelChange,
  scale,
  onScaleChange,
  onToday,
}: {
  counts: TPlanCounts;
  level: TPlanLevel;
  onLevelChange: (level: TPlanLevel) => void;
  scale: TPlanScale;
  onScaleChange: (scale: TPlanScale) => void;
  onToday: () => void;
}) => {
  const { t } = useTranslation();
  const count = (value: number) => <b className="font-semibold text-primary tabular-nums">{value}</b>;

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-subtle px-6 py-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-13 text-tertiary">
        <span className="inline-flex items-center gap-2">
          <span className="h-[11px] w-5 rounded-[3px] bg-accent-primary" />
          {t(`${I18N}.legend.stage`)} {count(counts.stages)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2 w-5 rounded-full border-[1.5px]"
            style={{
              borderColor: PLAN_CYCLE_COLORS.border,
              background: `linear-gradient(90deg, ${PLAN_CYCLE_COLORS.fill} 0 50%, ${PLAN_CYCLE_COLORS.track} 50% 100%)`,
            }}
          />
          {t(`${I18N}.legend.cycle`)} {count(counts.cycles)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1 w-5 rounded-full bg-[#F59E0B]" />
          {t(`${I18N}.legend.issue`)} {count(counts.issues)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-[9px] rotate-45 rounded-[1px]" style={{ background: "var(--txt-primary)" }} />
          {t(`${I18N}.legend.milestone`)} {count(counts.milestones)}
        </span>
        {counts.delayed > 0 && (
          <span className="inline-flex items-center gap-1.5 text-danger-primary">
            <span className="size-2 rounded-full bg-danger-primary" />
            {t(`${I18N}.legend.delayed`)} {counts.delayed}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-12 text-placeholder">{t(`${I18N}.pan_hint`)}</span>
        <span className="h-[18px] border-l border-subtle" />
        <span className="text-13 text-tertiary">{t(`${I18N}.expand_to`)}</span>
        <PlanSegmented
          size="sm"
          value={level}
          onChange={onLevelChange}
          options={(["stage", "cycle", "issue"] as const).map((key) => ({ key, label: t(`${I18N}.level.${key}`) }))}
        />
        <span className="h-[18px] border-l border-subtle" />
        <PlanSegmented
          size="sm"
          value={scale}
          onChange={onScaleChange}
          options={(["week", "month", "quarter"] as const).map((key) => ({ key, label: t(`${I18N}.scale.${key}`) }))}
        />
        <Button variant="secondary" size="lg" onClick={onToday}>
          {t(`${I18N}.today`)}
        </Button>
      </div>
    </div>
  );
};
