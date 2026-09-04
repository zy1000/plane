import { type FC, useMemo } from "react";
import { Users } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Avatar, Loader } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import type { IOverviewMemberStat } from "./overview-analytics.types";
import { OverviewCard } from "./overview-card";

type Props = {
  memberStats: IOverviewMemberStat[];
  memberCount: number;
  isLoading: boolean;
  onViewAll?: () => void;
};

const TOP_N = 6;

type TRow = {
  memberId: string;
  displayName: string;
  avatarUrl: string;
  open: number;
  overdue: number;
};

/** 概览「团队负荷」卡：按未完成工作项排名，延期部分用红段标出 */
export const OverviewWorkloadCard: FC<Props> = ({ memberStats, memberCount, isLoading, onViewAll }) => {
  const { t } = useTranslation();

  const { rows, others, othersOpen, max } = useMemo(() => {
    const sorted: TRow[] = memberStats
      .map((member) => ({
        memberId: member.member_id,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        open: member.open_count ?? 0,
        overdue: Math.min(member.overdue_count ?? 0, member.open_count ?? 0),
      }))
      .filter((row) => row.open > 0)
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue);
    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N);
    return {
      rows: top,
      others: Math.max(memberCount - top.length, 0),
      othersOpen: rest.reduce((acc, row) => acc + row.open, 0),
      max: Math.max(1, ...top.map((row) => row.open)),
    };
  }, [memberStats, memberCount]);

  return (
    <OverviewCard
      title={t("project_overview.workload.title")}
      icon={Users}
      meta={t("project_overview.workload.subtitle")}
      action={
        onViewAll ? (
          <button type="button" className="text-12 font-medium text-tertiary hover:text-primary" onClick={onViewAll}>
            {t("project_overview.workload.all_members", { count: memberCount })} →
          </button>
        ) : undefined
      }
      className="h-full"
    >
      <div className="px-4 pb-4">
        {isLoading ? (
          <Loader className="space-y-2.5">
            {Array.from({ length: 4 }, (_, index) => (
              <Loader.Item key={index} height="22px" />
            ))}
          </Loader>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-12 text-placeholder">{t("project_overview.workload.empty")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {rows.map((row) => {
                const inProgress = row.open - row.overdue;
                return (
                  <div
                    key={row.memberId}
                    className="grid grid-cols-[22px_92px_minmax(0,1fr)_auto] items-center gap-2.5"
                  >
                    <Avatar name={row.displayName} src={getFileURL(row.avatarUrl)} size={22} shape="circle" />
                    <span className="truncate text-13 text-primary" title={row.displayName}>
                      {row.displayName}
                    </span>
                    <div className="flex h-2.5 gap-0.5">
                      {inProgress > 0 && (
                        <div
                          className="h-full rounded-sm bg-accent-primary"
                          style={{ width: `${(inProgress / max) * 100}%` }}
                        />
                      )}
                      {row.overdue > 0 && (
                        <div
                          className="h-full rounded-sm bg-danger-primary"
                          style={{ width: `${(row.overdue / max) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="whitespace-nowrap text-12 tabular-nums text-tertiary">
                      <span className="font-semibold text-primary">{row.open}</span>{" "}
                      {t("project_overview.workload.in_progress")}
                      {row.overdue > 0 && (
                        <>
                          <span className="text-placeholder"> · </span>
                          <span className="font-semibold text-danger-primary">{row.overdue}</span>{" "}
                          {t("project_overview.workload.overdue")}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-subtle pt-3 text-11 text-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-accent-primary" />
                {t("project_overview.workload.in_progress")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-danger-primary" />
                {t("project_overview.workload.overdue")}
              </span>
              {others > 0 && (
                <span className="ml-auto tabular-nums">
                  {t("project_overview.workload.others", { members: others, items: othersOpen })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </OverviewCard>
  );
};
