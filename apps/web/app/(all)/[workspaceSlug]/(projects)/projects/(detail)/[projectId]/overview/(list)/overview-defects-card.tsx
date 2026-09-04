import type { FC } from "react";
import { Bug } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TOverviewDefectPriority } from "./overview-analytics.types";
import { OverviewCard } from "./overview-card";
import { useCountUp } from "./overview-hero";
import type { TProjectOverviewData } from "./use-project-overview";

type Props = {
  overview: TProjectOverviewData;
  onOpenBoard?: () => void;
};

const PRIORITY_ROWS: Array<{ key: TOverviewDefectPriority; barClassName: string; alwaysShow: boolean }> = [
  { key: "urgent", barClassName: "bg-danger-primary", alwaysShow: true },
  { key: "high", barClassName: "bg-warning-primary", alwaysShow: true },
  { key: "medium", barClassName: "bg-accent-primary", alwaysShow: true },
  { key: "low", barClassName: "bg-layer-3", alwaysShow: true },
  { key: "none", barClassName: "bg-layer-3", alwaysShow: false },
];

/** 概览「缺陷」卡：待处理数、本月新建 / 解决、按优先级分布、解决率 */
export const OverviewDefectsCard: FC<Props> = ({ overview, onOpenBoard }) => {
  const { t } = useTranslation();
  const { pendingDefects, totalDefects, pendingDefectsByPriority, defectTrend, isLoading } = overview;
  const animatedPending = useCountUp(pendingDefects);
  const resolved = Math.max(totalDefects - pendingDefects, 0);
  const resolveRate = totalDefects > 0 ? Math.round((resolved / totalDefects) * 100) : 0;
  const thisMonth = defectTrend[defectTrend.length - 1];
  const maxPriority = Math.max(1, ...Object.values(pendingDefectsByPriority));
  const rows = PRIORITY_ROWS.filter((row) => row.alwaysShow || pendingDefectsByPriority[row.key] > 0);

  return (
    <OverviewCard
      title={t("project_overview.defects.title")}
      icon={Bug}
      action={
        onOpenBoard ? (
          <button
            type="button"
            className="text-12 font-medium text-accent-primary hover:underline"
            onClick={onOpenBoard}
          >
            {t("project_overview.defects.board")} →
          </button>
        ) : undefined
      }
      className="h-full"
    >
      {isLoading ? (
        <div className="mx-4 mb-4 h-[150px] animate-pulse rounded-lg bg-layer-1" />
      ) : (
        <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-5 px-4 pb-4">
          <div>
            {/* 字号不走 cn：tailwind-merge 会把任意值字号与自定义文字色当同组互斥 */}
            <p
              className={`text-[36px] leading-none font-bold tabular-nums ${
                pendingDefects > 0 ? "text-danger-primary" : "text-primary"
              }`}
            >
              {animatedPending}
            </p>
            <p className="mt-1.5 text-12 text-tertiary">{t("project_overview.defects.pending")}</p>
            <div className="mt-3.5 flex flex-col gap-1 text-12 tabular-nums text-tertiary">
              <span>
                {t("project_overview.defects.month_created")}{" "}
                <span className="font-semibold text-primary">{thisMonth?.created ?? 0}</span>
              </span>
              <span>
                {t("project_overview.defects.month_resolved")}{" "}
                <span className="font-semibold text-primary">{thisMonth?.resolved ?? 0}</span>
              </span>
              <span>
                {t("project_overview.defects.total")}{" "}
                <span className="font-semibold text-primary">{totalDefects}</span>
                <span className="text-placeholder"> · </span>
                {t("project_overview.defects.resolved")}{" "}
                <span className="font-semibold text-primary">{resolved}</span>
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between text-11 text-tertiary">
              <span>{t("project_overview.defects.by_priority")}</span>
              <span className="tabular-nums">{t("project_overview.defects.total_count", { count: pendingDefects })}</span>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const value = pendingDefectsByPriority[row.key];
                return (
                  <div key={row.key} className="grid grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-2.5 text-12">
                    <span className="text-secondary">{t(`project_overview.defects.priorities.${row.key}`)}</span>
                    <div className="h-2 overflow-hidden rounded-sm bg-layer-2">
                      <div
                        className={cn("h-full rounded-sm", row.barClassName)}
                        style={{ width: `${(value / maxPriority) * 100}%` }}
                      />
                    </div>
                    <span className="text-right font-semibold tabular-nums text-primary">{value}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center justify-between text-11 text-tertiary">
                <span>{t("project_overview.defects.resolve_rate")}</span>
                <span className="font-semibold tabular-nums text-primary">{resolveRate}%</span>
              </div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-md bg-layer-2">
                {resolved > 0 && <div className="h-full bg-success-primary" style={{ width: `${resolveRate}%` }} />}
                {pendingDefects > 0 && (
                  <div className="h-full bg-danger-primary" style={{ width: `${100 - resolveRate}%` }} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </OverviewCard>
  );
};
