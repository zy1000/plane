import { type FC, useEffect, useMemo, useState } from "react";
import { uniq } from "lodash-es";
import { observer } from "mobx-react";
import type { IProjectRole } from "@plane/types";
import { Avatar, Loader, Tooltip } from "@plane/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectRoles } from "@/hooks/store/use-project-roles";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

interface IMemberStat {
  member_id: string;
  display_name: string;
  avatar_url: string;
  work_item_count: number;
  defect_count: number;
}

export const OverviewMemberStats: FC<Props> = observer(({ workspaceSlug, projectId }) => {
  const [members, setMembers] = useState<IMemberStat[]>([]);
  const [loading, setLoading] = useState(true);
  const { fetchProjectAnalyze } = useProject();
  const {
    project: { fetchProjectMembers, getFilteredProjectMemberDetails },
  } = useMember();
  const { roles, fetchRoles } = useProjectRoles(workspaceSlug, projectId);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    setLoading(true);
    Promise.allSettled([
      fetchProjectAnalyze(workspaceSlug, projectId),
      fetchProjectMembers(workspaceSlug, projectId),
      fetchRoles(),
    ])
      .then(([analyzeResult]) => {
        if (analyzeResult.status !== "fulfilled") return;
        const stats = (analyzeResult.value as Record<string, unknown>)?.member_stats;
        if (Array.isArray(stats)) setMembers(stats as IMemberStat[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceSlug, projectId, fetchProjectAnalyze, fetchProjectMembers, fetchRoles]);

  const membersWithRoles = useMemo(
    () =>
      members.map((member) => {
        const details = getFilteredProjectMemberDetails(member.member_id, projectId);
        const roleNames = uniq(details?.custom_role_ids ?? [])
          .map((rid) => roles.find((r) => r.id === rid)?.name)
          .filter((n): n is string => Boolean(n));
        return { ...member, roleNames };
      }),
    [members, getFilteredProjectMemberDetails, projectId, roles]
  );

  if (loading) {
    return (
      <Loader className="gap-3 p-1">
        <Loader.Item width="100%" height="28px" />
        <Loader.Item width="100%" height="28px" />
        <Loader.Item width="80%" height="28px" />
      </Loader>
    );
  }

  if (membersWithRoles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-placeholder">暂无成员数据</div>
    );
  }

  return (
    <Table>
      <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
        <TableRow>
          <TableHead className="h-8 w-1/4 text-left text-xs font-medium text-placeholder">成员</TableHead>
          <TableHead className="h-8 text-left text-xs font-medium text-placeholder">角色</TableHead>
          <TableHead className="h-8 w-16 text-center text-xs font-medium text-placeholder">工作项</TableHead>
          <TableHead className="h-8 w-16 text-center text-xs font-medium text-placeholder">缺陷</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {membersWithRoles.map((m) => (
          <TableRow key={m.member_id} className="transition-colors hover:bg-layer-1">
            <TableCell className="text-sm text-primary">
              <div className="flex items-center gap-2">
                <Avatar
                  name={m.display_name}
                  src={getFileURL(m.avatar_url)}
                  size={24}
                  shape="circle"
                  className="flex-shrink-0 text-xs"
                />
                <span className="truncate">{m.display_name}</span>
              </div>
            </TableCell>
            <TableCell className="text-13 text-secondary">
              <RoleTags roleNames={m.roleNames} />
            </TableCell>
            <TableCell className="text-center text-sm font-medium text-primary">{m.work_item_count}</TableCell>
            <TableCell className="text-center text-sm font-medium text-red-500">{m.defect_count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

const RoleTags: FC<{ roleNames: string[] }> = ({ roleNames }) => {
  if (roleNames.length === 0) return <span className="text-xs text-placeholder">-</span>;

  const fullText = roleNames.join("、");

  return (
    <Tooltip tooltipContent={fullText} position="top">
      <div className="flex max-w-[260px] items-center gap-1 overflow-hidden">
        {roleNames.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="inline-flex shrink-0 items-center truncate rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-secondary"
          >
            {name}
          </span>
        ))}
      </div>
    </Tooltip>
  );
};
