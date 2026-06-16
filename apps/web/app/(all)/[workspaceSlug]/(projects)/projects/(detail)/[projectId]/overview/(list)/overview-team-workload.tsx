import { type FC, useEffect, useMemo, useState } from "react";
import { uniq } from "lodash-es";
import { observer } from "mobx-react";
import { Avatar, Loader, Tooltip } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import type { IOverviewMemberStat } from "./overview-analytics.types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  memberStats: IOverviewMemberStat[];
  isAnalyticsLoading: boolean;
};

type TWorkloadRow = IOverviewMemberStat & { roleNames: string[]; total: number };

export const OverviewTeamWorkload: FC<Props> = observer(
  ({ workspaceSlug, projectId, memberStats, isAnalyticsLoading }) => {
    const [isDependencyLoading, setIsDependencyLoading] = useState(true);
    const {
      project: { fetchProjectMembers, getFilteredProjectMemberDetails },
    } = useMember();
    const { roles, fetchRoles } = useProjectRoles(workspaceSlug, projectId);

    useEffect(() => {
      if (!workspaceSlug || !projectId) return;
      setIsDependencyLoading(true);
      Promise.allSettled([fetchProjectMembers(workspaceSlug, projectId), fetchRoles()])
        .catch(console.error)
        .finally(() => setIsDependencyLoading(false));
    }, [workspaceSlug, projectId, fetchProjectMembers, fetchRoles]);

    const rows = useMemo<TWorkloadRow[]>(() => {
      const mapped = memberStats.map((member) => {
        const details = getFilteredProjectMemberDetails(member.member_id, projectId);
        const roleNames = uniq(details?.custom_role_ids ?? [])
          .map((rid) => roles.find((r) => r.id === rid)?.name)
          .filter((n): n is string => Boolean(n));
        return { ...member, roleNames, total: member.work_item_count + member.defect_count };
      });
      return mapped.sort((a, b) => b.total - a.total);
    }, [memberStats, getFilteredProjectMemberDetails, projectId, roles]);

    const maxTotal = useMemo(() => Math.max(1, ...rows.map((row) => row.total)), [rows]);

    if (isAnalyticsLoading || isDependencyLoading) {
      return (
        <Loader className="gap-3 px-4 pb-4">
          <Loader.Item width="100%" height="40px" />
          <Loader.Item width="100%" height="40px" />
          <Loader.Item width="80%" height="40px" />
        </Loader>
      );
    }

    if (rows.length === 0) {
      return <div className="flex h-full items-center justify-center text-sm text-placeholder">暂无成员数据</div>;
    }

    return (
      <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm px-4 pb-4">
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const barWidth = (row.total / maxTotal) * 100;
            const workShare = row.total > 0 ? (row.work_item_count / row.total) * 100 : 0;
            const defectShare = row.total > 0 ? (row.defect_count / row.total) * 100 : 0;
            return (
              <div key={row.member_id} className="flex items-center gap-3">
                <Avatar
                  name={row.display_name}
                  src={getFileURL(row.avatar_url)}
                  size={28}
                  shape="circle"
                  className="flex-shrink-0 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm text-primary">{row.display_name}</span>
                      <RoleTags roleNames={row.roleNames} />
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2 text-xs tabular-nums">
                      <span className="text-secondary">{row.work_item_count} 项</span>
                      {row.defect_count > 0 && (
                        <span className="text-danger-primary">{row.defect_count} 缺陷</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-layer-2">
                    {barWidth > 0 && (
                      <div className="flex h-full" style={{ width: `${barWidth}%` }}>
                        <div className="h-full bg-[#3f76ff]" style={{ width: `${workShare}%` }} />
                        <div className="h-full bg-danger-primary" style={{ width: `${defectShare}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

const RoleTags: FC<{ roleNames: string[] }> = ({ roleNames }) => {
  if (roleNames.length === 0) return null;
  const fullText = roleNames.join("、");
  return (
    <Tooltip tooltipContent={fullText} position="top">
      <span className="flex-shrink-0 truncate rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-secondary">
        {roleNames[0]}
        {roleNames.length > 1 ? ` +${roleNames.length - 1}` : ""}
      </span>
    </Tooltip>
  );
};
