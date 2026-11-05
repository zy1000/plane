/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { IWorkspaceMyAccess } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { Chip } from "./chips";
import { describePassthroughIdentity, formatJoinedAt } from "./helpers";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-12 text-tertiary">{label}</dt>
      <dd className="flex min-h-[22px] flex-wrap items-center gap-1 text-14 text-primary">{children}</dd>
    </div>
  );
}

/** 身份条：头像 + 姓名 + 「邮箱 · 工号 · 部门」，右侧角色 / 直通身份 / 加入时间 */
export const IdentityBar = observer(function IdentityBar({ data }: { data: IWorkspaceMyAccess }) {
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  // 工号 / 部门只有工作区成员列表接口带，从成员 store 里取；取不到就只写邮箱
  const memberDetails = currentUser ? getUserDetails(currentUser.id) : undefined;
  const displayName = currentUser?.display_name || currentUser?.email || "—";
  const subline = [currentUser?.email, memberDetails?.employee_id, memberDetails?.department].filter(Boolean).join(" · ");
  const passthrough = describePassthroughIdentity(data.membership);

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 rounded-xl border border-subtle bg-surface-1 px-6 py-5">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar
          name={displayName}
          src={getFileURL(currentUser?.avatar_url ?? "")}
          size={48}
          shape="circle"
          className="shrink-0 text-16 font-medium"
        />
        <div className="min-w-0">
          <h2 className="truncate text-18 font-semibold text-primary">{displayName}</h2>
          <p className="mt-0.5 truncate text-13 text-tertiary">{subline || "—"}</p>
        </div>
      </div>
      <dl className="flex flex-wrap items-start gap-x-10 gap-y-3">
        <Field label="角色">
          {data.job_roles.length > 0
            ? data.job_roles.map((role) => (
                <Chip key={role.id} title={role.label}>
                  {role.label}
                </Chip>
              ))
            : "—"}
        </Field>
        <Field label="直通身份">{passthrough.length > 0 ? passthrough.join(" / ") : "—"}</Field>
        <Field label="加入时间">
          <span className="tabular-nums">{formatJoinedAt(data.membership.joined_at)}</span>
        </Field>
      </dl>
    </section>
  );
});
