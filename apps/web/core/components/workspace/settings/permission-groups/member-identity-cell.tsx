/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

export const getMemberDisplayName = (user: IUserLite | null | undefined) =>
  user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.display_name || user.email || "未知成员" : "未知成员";

/** 成员格：头像 + 姓名，下面一行邮箱（成员表、权限组成员页共用；权限组页面用 lg） */
export function MemberIdentityCell({
  user,
  muted = false,
  size = "md",
}: {
  user: IUserLite | null | undefined;
  muted?: boolean;
  size?: "md" | "lg";
}) {
  const name = getMemberDisplayName(user);
  const isLarge = size === "lg";
  return (
    <span className={cn("flex min-w-0 items-center", isLarge ? "gap-3" : "gap-2.5")}>
      <Avatar
        name={name}
        src={user?.avatar_url ? getFileURL(user.avatar_url) : undefined}
        size={isLarge ? 34 : 28}
        shape="circle"
        className="shrink-0 text-12"
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-medium", isLarge ? "text-14" : "text-13", muted ? "text-placeholder" : "text-primary")}>
          {name}
        </span>
        {user?.email && (
          <span className={cn("truncate text-tertiary", isLarge ? "text-13 leading-5" : "text-11 leading-4")}>{user.email}</span>
        )}
      </span>
    </span>
  );
}
