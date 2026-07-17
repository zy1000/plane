/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceGroup } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type TWorkspaceTeamOption = {
  value: string;
  data: IWorkspaceGroup;
};

type Props = {
  workspaceSlug: string;
  memberId: string;
  selectedGroupIds: string[];
  groups: IWorkspaceGroup[];
  isLoading: boolean;
  disabled?: boolean;
};

export function WorkspaceTeamMultiSelect(props: Props) {
  const { workspaceSlug, memberId, selectedGroupIds, groups, isLoading, disabled = false } = props;
  const {
    workspace: { updateMemberGroups },
  } = useMember();
  const { data: currentUser } = useUser();
  const { fetchWorkspacePermissionKeys } = useUserPermissions();

  const options: TWorkspaceTeamOption[] = useMemo(
    () => groups.map((group) => ({ value: group.id, data: group })),
    [groups]
  );

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    const selectedNames = groups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">选择团队</span>;
    if (selectedNames.length === 1) return <span>{selectedNames[0]}</span>;
    return (
      <span>
        {selectedNames[0]} +{selectedNames.length - 1}
      </span>
    );
  }, [groups, isLoading, selectedGroupIds]);

  const selectedGroupNames = useMemo(
    () => groups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name),
    [groups, selectedGroupIds]
  );

  const handleChange = async (groupIds: string[]) => {
    try {
      const response = await updateMemberGroups(workspaceSlug, memberId, groupIds);
      if (currentUser?.id === memberId) await fetchWorkspacePermissionKeys(workspaceSlug);
      const names = groups.filter((group) => response.group_ids.includes(group.id)).map((group) => group.name);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "团队已更新",
        message: names.length > 0 ? `已加入团队：${names.join("、")}` : "已清空该成员的所属团队。",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新团队失败",
        message: "更新成员所属团队时出现错误，请重试。",
      });
    }
  };

  return (
    <div className="flex w-40 flex-col gap-1">
      {disabled ? (
        <span className={selectedGroupNames.length === 0 ? "text-13 text-placeholder" : "truncate text-13"}>
          {selectedGroupNames.length > 0 ? selectedGroupNames.join("、") : "—"}
        </span>
      ) : (
        <MultiSelectDropdown
          value={selectedGroupIds}
          onChange={handleChange}
          options={options}
          disabled={isLoading}
          disableSorting
          keyExtractor={(option) => option.data.id}
          queryArray={["name"]}
          inputPlaceholder="搜索团队..."
          buttonContent={() => (
            <div className="flex w-full cursor-pointer items-center justify-between gap-1 text-13">
              {buttonLabel}
              <ChevronDown className="size-3 shrink-0 text-secondary" />
            </div>
          )}
          buttonClassName="flex w-full items-center justify-between gap-1 rounded border-none px-0 py-1 text-13"
          containerClassName="w-40 rounded-md p-0"
          optionsContainerClassName="w-52"
          renderItem={({ value, selected }) => {
            const group = groups.find((item) => item.id === value);
            if (!group) return null;
            return (
              <div className="flex w-full items-center justify-between gap-2 truncate text-13">
                <span className="truncate">{group.name}</span>
                {selected && <Check className="size-3 shrink-0" />}
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
