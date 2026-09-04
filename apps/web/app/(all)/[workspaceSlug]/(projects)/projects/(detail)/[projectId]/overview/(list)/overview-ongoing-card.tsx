import type { FC, ReactNode } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Clock } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Loader } from "@plane/ui";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { getReleaseStatusDetails } from "@/components/releases/release-status-config";
import type {
  TProjectOverviewStatisticResponse,
  TProjectStatisticCycle,
  TProjectStatisticRelease,
  TProjectStatisticTestPlan,
} from "@/services/project";
import { OverviewCard } from "./overview-card";
import type { OverviewProgressSection } from "./overview-progress-list-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  statistic: TProjectOverviewStatisticResponse | null;
  isLoading: boolean;
  onViewAll: (section: OverviewProgressSection) => void;
};

type TTone = "info" | "warning" | "danger" | "success" | "neutral";

const TONE_PILL_CLASS: Record<TTone, string> = {
  info: "bg-accent-subtle text-accent-primary",
  warning: "bg-warning-subtle text-warning-primary",
  danger: "bg-danger-subtle text-danger-primary",
  success: "bg-success-subtle text-success-primary",
  neutral: "bg-layer-2 text-secondary",
};

/** 后端 Cycle.Status 的中文值 → 胶囊色调 */
const CYCLE_STATUS_TONE: Record<string, TTone> = {
  进行中: "info",
  测试中: "warning",
  已退回: "danger",
  已完成: "success",
  未开始: "neutral",
};

/** 活跃迭代里优先挑正在做的：进行中 > 测试中 > 其余按开始日期最早 */
const CYCLE_STATUS_PRIORITY = ["进行中", "测试中"];
/** 未收口的发布里优先挑正在推进的 */
const RELEASE_STATUS_PRIORITY = ["in-progress", "testing", "pending-test"];

const pickByStatus = <T extends { status: string }>(items: T[], priority: string[]): T | null => {
  for (const status of priority) {
    const hit = items.find((item) => item.status === status);
    if (hit) return hit;
  }
  return items[0] ?? null;
};

const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

const formatDay = (value: string | null) => {
  const date = value ? getDate(value) : null;
  return date ? renderFormattedDate(date, "MM-dd") : "—";
};

const useDeadline = () => {
  const { t } = useTranslation();
  return (value: string | null): { text: string; danger: boolean } => {
    const date = value ? getDate(value) : null;
    if (!date) return { text: t("project_overview.ongoing.no_date"), danger: false };
    const diff = differenceInCalendarDays(date, new Date());
    if (diff > 0) return { text: t("project_overview.ongoing.days_left", { count: diff }), danger: false };
    if (diff === 0) return { text: t("project_overview.ongoing.due_today"), danger: false };
    return { text: t("project_overview.ongoing.overdue_days", { count: -diff }), danger: true };
  };
};

const ProgressLine: FC<{ value: number; tone?: "accent" | "success" | "danger" }> = ({ value, tone = "accent" }) => (
  <div className="flex items-center gap-2.5">
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-layer-2">
      <div
        className={cn("h-full rounded-full", {
          "bg-accent-primary": tone === "accent",
          "bg-success-primary": tone === "success",
          "bg-danger-primary": tone === "danger",
        })}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
    <span className="w-9 text-right text-12 font-semibold tabular-nums text-primary">{value}%</span>
  </div>
);

const Section: FC<{
  label: string;
  total: number;
  onViewAll: () => void;
  children: ReactNode;
}> = ({ label, total, onViewAll, children }) => {
  const { t } = useTranslation();
  return (
    <div className="border-t border-subtle py-3 first:border-t-0 first:pt-0.5 last:pb-0">
      <div className="mb-2 flex items-center justify-between text-12 text-tertiary">
        <span>{label}</span>
        <button type="button" className="font-medium text-accent-primary hover:underline" onClick={onViewAll}>
          {t("project_overview.ongoing.view_all", { count: total })} →
        </button>
      </div>
      {children}
    </div>
  );
};

const ItemTitle: FC<{ href: string; name: string; pill: ReactNode }> = ({ href, name, pill }) => (
  <div className="flex items-center justify-between gap-2.5">
    <Link to={href} className="min-w-0 truncate text-13 font-semibold text-primary hover:text-accent-primary">
      {name}
    </Link>
    {pill}
  </div>
);

const Pill: FC<{ tone: TTone; className?: string; children: ReactNode }> = ({ tone, className, children }) => (
  <span
    className={cn(
      "inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-11 font-medium",
      TONE_PILL_CLASS[tone],
      className
    )}
  >
    {children}
  </span>
);

const EmptyLine: FC<{ text: string }> = ({ text }) => <p className="text-12 text-placeholder">{text}</p>;

const CycleItem: FC<{ cycle: TProjectStatisticCycle; href: string }> = ({ cycle, href }) => {
  const describeDeadline = useDeadline();
  const deadline = describeDeadline(cycle.end_date);
  return (
    <div className="flex flex-col gap-1.5">
      <ItemTitle
        href={href}
        name={cycle.name}
        pill={<Pill tone={CYCLE_STATUS_TONE[cycle.status] ?? "neutral"}>{cycle.status}</Pill>}
      />
      <div className="flex items-center gap-2.5 text-12 tabular-nums text-tertiary">
        <span className="font-medium text-secondary">
          {formatDay(cycle.start_date)} → {formatDay(cycle.end_date)}
        </span>
        <span className={cn(deadline.danger && "text-danger-primary")}>{deadline.text}</span>
      </div>
      <ProgressLine value={percent(cycle.completed_work_item_count, cycle.work_item_count)} />
    </div>
  );
};

const ReleaseItem: FC<{ release: TProjectStatisticRelease; href: string }> = ({ release, href }) => {
  const { t } = useTranslation();
  const describeDeadline = useDeadline();
  const status = getReleaseStatusDetails(release.status);
  const deadline = describeDeadline(release.end_date);
  const targetDate = release.end_date ? getDate(release.end_date) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <ItemTitle
        href={href}
        name={release.name}
        pill={
          <span
            className={cn(
              "inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-11 font-medium",
              status.bgColor,
              status.textColor
            )}
          >
            {status.label}
          </span>
        }
      />
      <div className="flex items-center gap-2.5 text-12 tabular-nums text-tertiary">
        <span className="font-medium text-secondary">
          {targetDate
            ? t("project_overview.ongoing.target", { date: renderFormattedDate(targetDate, "MM-dd") })
            : t("project_overview.ongoing.no_date")}
        </span>
        {targetDate && <span className={cn(deadline.danger && "text-danger-primary")}>{deadline.text}</span>}
      </div>
      <ProgressLine
        value={percent(release.completed_work_item_count, release.work_item_count)}
        tone={deadline.danger ? "danger" : "accent"}
      />
    </div>
  );
};

const TestPlanItem: FC<{ plan: TProjectStatisticTestPlan; href: string }> = ({ plan, href }) => {
  const { t } = useTranslation();
  const results = plan.result_counts;
  const executed = results.success + results.fail + results.block + results.invalid;
  const pending = Math.max(plan.case_count - executed, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <ItemTitle href={href} name={plan.name} pill={<Pill tone="warning">{plan.status}</Pill>} />
      <div className="flex items-center gap-2.5 text-12 tabular-nums text-tertiary">
        <span className="font-medium text-secondary">
          {t("project_overview.ongoing.cases", { count: plan.case_count })}
        </span>
        <span className="truncate">
          {t("project_overview.ongoing.case_results", {
            success: results.success,
            fail: results.fail,
            pending,
          })}
        </span>
      </div>
      <ProgressLine value={percent(results.success, plan.case_count)} tone="success" />
    </div>
  );
};

/** 概览「进行中」卡：当前迭代、发布、测试计划各取一条最紧要的 */
export const OverviewOngoingCard: FC<Props> = ({ workspaceSlug, projectId, statistic, isLoading, onViewAll }) => {
  const { t } = useTranslation();
  const base = `/${workspaceSlug}/projects/${projectId}`;

  const cycle = pickByStatus(statistic?.cycles?.data ?? [], CYCLE_STATUS_PRIORITY);
  const release = pickByStatus(statistic?.releases?.data ?? [], RELEASE_STATUS_PRIORITY);
  const plan = statistic?.test_plans?.data?.[0] ?? null;

  return (
    <OverviewCard title={t("project_overview.ongoing.title")} icon={Clock} className="h-full">
      <div className="px-4 pb-4">
        {isLoading && !statistic ? (
          <Loader className="space-y-3">
            <Loader.Item height="56px" />
            <Loader.Item height="56px" />
            <Loader.Item height="56px" />
          </Loader>
        ) : (
          <>
            <Section
              label={t("project_overview.ongoing.cycle")}
              total={statistic?.cycles?.total_count ?? 0}
              onViewAll={() => onViewAll("cycle")}
            >
              {cycle ? (
                <CycleItem cycle={cycle} href={`${base}/cycles/${cycle.id}/overview`} />
              ) : (
                <EmptyLine text={t("project_overview.ongoing.empty_cycle")} />
              )}
            </Section>
            <Section
              label={t("project_overview.ongoing.release")}
              total={statistic?.releases?.total_count ?? 0}
              onViewAll={() => onViewAll("release")}
            >
              {release ? (
                <ReleaseItem release={release} href={`${base}/releases/${release.id}/overview`} />
              ) : (
                <EmptyLine text={t("project_overview.ongoing.empty_release")} />
              )}
            </Section>
            <Section
              label={t("project_overview.ongoing.test_plan")}
              total={statistic?.test_plans?.total_count ?? 0}
              onViewAll={() => onViewAll("plan")}
            >
              {plan ? (
                <TestPlanItem plan={plan} href={`${base}/testhub/plan-cases?planId=${plan.id}`} />
              ) : (
                <EmptyLine text={t("project_overview.ongoing.empty_test_plan")} />
              )}
            </Section>
          </>
        )}
      </div>
    </OverviewCard>
  );
};
