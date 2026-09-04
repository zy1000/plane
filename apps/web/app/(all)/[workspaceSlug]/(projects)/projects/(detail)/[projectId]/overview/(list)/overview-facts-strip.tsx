import type { FC } from "react";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileSearch, Repeat, Rocket, Timer, Users } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectOverviewStatisticResponse } from "@/services/project";

type Props = {
  memberCount: number;
  totalHours: number;
  statistic: TProjectOverviewStatisticResponse | null;
  onMembersClick?: () => void;
  onHoursClick?: () => void;
  onCyclesClick?: () => void;
  onReleasesClick?: () => void;
  onTestPlansClick?: () => void;
  onCaseReviewsClick?: () => void;
};

type TFact = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
  /** 「N 进行中」「N 逾期」这类副句，没有就不显示 */
  sub?: string;
  onClick?: () => void;
};

/** Hero 底部拉通整行的六个事实数，每格可点开对应明细弹窗 */
export const OverviewFactsStrip: FC<Props> = ({
  memberCount,
  totalHours,
  statistic,
  onMembersClick,
  onHoursClick,
  onCyclesClick,
  onReleasesClick,
  onTestPlansClick,
  onCaseReviewsClick,
}) => {
  const { t } = useTranslation();

  const inProgress = (count?: number) =>
    count && count > 0 ? t("project_overview.facts.in_progress", { count }) : undefined;

  const releaseSub = (() => {
    const overdue = statistic?.releases?.overdue_count ?? 0;
    if (overdue > 0) return t("project_overview.facts.overdue", { count: overdue });
    return inProgress(statistic?.releases?.in_progress_count);
  })();

  const facts: TFact[] = [
    {
      key: "members",
      icon: Users,
      label: t("project_overview.facts.members"),
      value: memberCount,
      unit: t("project_overview.facts.unit_people"),
      onClick: onMembersClick,
    },
    {
      key: "hours",
      icon: Timer,
      label: t("project_overview.facts.hours"),
      value: totalHours,
      unit: t("project_overview.facts.unit_hours"),
      onClick: onHoursClick,
    },
    {
      key: "cycles",
      icon: Repeat,
      label: t("project_overview.facts.cycles"),
      value: statistic?.cycles?.total_count ?? 0,
      unit: t("project_overview.facts.unit_count"),
      sub: inProgress(statistic?.cycles?.in_progress_count),
      onClick: onCyclesClick,
    },
    {
      key: "releases",
      icon: Rocket,
      label: t("project_overview.facts.releases"),
      value: statistic?.releases?.total_count ?? 0,
      unit: t("project_overview.facts.unit_count"),
      sub: releaseSub,
      onClick: onReleasesClick,
    },
    {
      key: "test-plans",
      icon: ClipboardList,
      label: t("project_overview.facts.test_plans"),
      value: statistic?.test_plans?.total_count ?? 0,
      unit: t("project_overview.facts.unit_count"),
      sub: inProgress(statistic?.test_plans?.in_progress_count),
      onClick: onTestPlansClick,
    },
    {
      key: "case-reviews",
      icon: FileSearch,
      label: t("project_overview.facts.case_reviews"),
      value: statistic?.case_reviews?.total_count ?? 0,
      unit: t("project_overview.facts.unit_count"),
      sub: inProgress(statistic?.case_reviews?.in_progress_count),
      onClick: onCaseReviewsClick,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
      {facts.map((fact) => {
        const Icon = fact.icon;
        return (
          <button
            key={fact.key}
            type="button"
            onClick={fact.onClick}
            aria-label={t("project_overview.facts.view_detail", { label: fact.label })}
            className="flex min-w-0 items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-layer-1-hover xl:border-l xl:border-subtle xl:first:border-l-0"
          >
            <span className="grid size-8 flex-shrink-0 place-items-center rounded-lg border border-subtle bg-surface-1 text-secondary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-16 leading-tight font-semibold tabular-nums text-primary">
                {fact.value}
                {fact.unit && <span className="ml-0.5 text-12 font-normal text-tertiary">{fact.unit}</span>}
              </span>
              <span className="block truncate text-12 text-tertiary">
                {fact.label}
                {fact.sub ? ` · ${fact.sub}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
