import { type FC, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Check, ChevronDown } from "lucide-react";
import type { IProjectRole } from "@plane/types";
import { Avatar, Loader, MultiSelectDropdown } from "@plane/ui";
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

const NOOP = () => {};

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
        return {
          ...member,
          customRoleIds: details?.custom_role_ids ?? [],
        };
      }),
    [members, getFilteredProjectMemberDetails, projectId]
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
          <TableHead className="h-8 text-left text-xs font-medium text-placeholder">成员</TableHead>
          <TableHead className="h-8 w-32 text-left text-xs font-medium text-placeholder">角色</TableHead>
          <TableHead className="h-8 w-20 text-center text-xs font-medium text-placeholder">工作项</TableHead>
          <TableHead className="h-8 w-20 text-center text-xs font-medium text-placeholder">缺陷</TableHead>
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
              <ReadonlyRoleDropdown selectedRoleIds={m.customRoleIds} roles={roles} />
            </TableCell>
            <TableCell className="text-center text-sm font-medium text-primary">{m.work_item_count}</TableCell>
            <TableCell className="text-center text-sm font-medium text-red-500">{m.defect_count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

type ReadonlyRoleDropdownProps = {
  selectedRoleIds: string[];
  roles: IProjectRole[];
};

const ReadonlyRoleDropdown: FC<ReadonlyRoleDropdownProps> = ({ selectedRoleIds, roles }) => {
  const options = useMemo(
    () => roles.map((role) => ({ value: role.id, data: role })),
    [roles]
  );

  const buttonLabel = useMemo(() => {
    if (selectedRoleIds.length === 0) return <span className="text-placeholder">-</span>;
    const selectedNames = roles
      .filter((r) => selectedRoleIds.includes(r.id))
      .map((r) => r.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">-</span>;
    if (selectedNames.length === 1) return <span>{selectedNames[0]}</span>;
    return (
      <span>
        {selectedNames[0]} +{selectedNames.length - 1}
      </span>
    );
  }, [selectedRoleIds, roles]);

  return (
    <MultiSelectDropdown
      value={selectedRoleIds}
      onChange={NOOP}
      options={options}
      disableSorting
      keyExtractor={(option) => option.data.id}
      queryArray={["name"]}
      inputPlaceholder="搜索角色..."
      buttonContent={() => (
        <div className="flex w-full items-center justify-between gap-1 rounded border border-strong px-3 py-2 text-13 cursor-pointer !px-0 !justify-start hover:bg-surface-1 border-none">
          {buttonLabel}
          <ChevronDown className="size-3 flex-shrink-0 text-secondary" />
        </div>
      )}
      buttonClassName="flex w-full items-center justify-between gap-1 rounded border border-strong px-3 py-2 text-13 cursor-pointer"
      containerClassName="w-32 rounded-md p-0"
      optionsContainerClassName="w-52"
      renderItem={({ value, selected }) => {
        const role = roles.find((r) => r.id === value);
        if (!role) return null;
        return (
          <div className="flex w-full items-center justify-between gap-2 truncate text-13">
            <span className="truncate">{role.name}</span>
            {selected && <Check className="size-3 flex-shrink-0" />}
          </div>
        );
      }}
    />
  );
};
