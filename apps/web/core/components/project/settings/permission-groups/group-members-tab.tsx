/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  memberIds: string[] | null;
};

/** 权限组详情「成员」页签：只读名单。给人加减权限组在「成员」页做 */
export const PermissionGroupMembersTab = observer(function PermissionGroupMembersTab(props: Props) {
  const { memberIds } = props;
  const { getUserDetails } = useMember();

  if (memberIds === null) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((index) => (
          <div key={index} className="h-11 animate-pulse rounded-md bg-layer-1" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-13 text-tertiary">给成员加减权限组请到「成员」页。</p>
      {memberIds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-subtle py-10 text-center text-13 text-tertiary">
          还没有成员在这个权限组里
        </p>
      ) : (
        <div className="divide-y divide-subtle rounded-lg border border-subtle">
          {memberIds.map((memberId) => {
            const user = getUserDetails(memberId);
            return (
              <div key={memberId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-13 font-medium text-primary">{user?.display_name ?? "未知成员"}</p>
                  {user?.email && <p className="truncate text-12 text-tertiary">{user.email}</p>}
                </div>
                {user?.department && <span className="truncate text-12 text-secondary">{user.department}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
