import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { observer } from "mobx-react";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  workspaceSlug: string;
  value: string | undefined;
  onChange: (id: string) => void;
};

export const OverviewMemberSelect = observer(function OverviewMemberSelect({ workspaceSlug, value, onChange }: Props) {
  const {
    getUserDetails,
    workspace: workspaceMemberStore,
  } = useMember();

  useEffect(() => {
    if (!workspaceSlug) return;
    workspaceMemberStore.fetchWorkspaceMembers(workspaceSlug).catch(() => {
      // 忽略成员拉取失败，下拉仅显示已缓存成员
    });
  }, [workspaceSlug, workspaceMemberStore]);

  const memberIds = (workspaceMemberStore.getWorkspaceMemberIds(workspaceSlug) ?? []).filter(
    (memberId) => !workspaceMemberStore.isUserSuspended(memberId, workspaceSlug)
  );
  const selectedUser = value ? getUserDetails(value) : undefined;
  const selectedLabel = selectedUser?.display_name || selectedUser?.first_name || selectedUser?.email || "选择成员";

  return (
    <MemberDropdown
      multiple={false}
      value={value ?? null}
      onChange={(nextMemberId) => {
        if (!nextMemberId) return;
        onChange(nextMemberId);
      }}
      memberIds={memberIds}
      className="h-[28px] shrink-0"
      buttonContainerClassName="w-auto"
      optionsClassName="w-56"
      button={
        <div className="inline-flex h-[28px] max-w-[210px] items-center gap-2 rounded-md border border-subtle px-2.5 text-sm text-primary transition-colors hover:bg-layer-1">
          <ButtonAvatars showTooltip={false} userIds={value ?? null} size="sm" />
          <span className="truncate" title={selectedLabel}>
            {selectedLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
        </div>
      }
    />
  );
});
