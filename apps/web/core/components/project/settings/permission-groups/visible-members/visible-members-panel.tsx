/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { buildChannels, hasProjectPermission } from "./helpers";
import { useProjectVisibleMembers } from "./use-project-visible-members";
import { VisiblePeopleTable } from "./visible-people-table";

function Tile(props: { label: string; value: number; sub: ReactNode; warn?: boolean }) {
  const { label, value, sub, warn = false } = props;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-surface-1 px-5 py-4",
        warn ? "border-warning-subtle" : "border-subtle"
      )}
    >
      <span className="text-13 text-tertiary">{label}</span>
      <span className="text-28 leading-tight font-semibold text-primary tabular-nums">
        {value}
        <span className="ml-1 text-14 font-medium text-secondary">人</span>
      </span>
      <span className={cn("text-13", warn ? "font-medium text-warning-primary" : "text-tertiary")}>{sub}</span>
    </div>
  );
}

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 项目设置 › 权限 › 可访问人员：谁能访问本项目（不只是项目成员）、授权来源、在本项目的权限。
 * 项目负责人要知道项目外还有谁能访问、谁能操作这个项目（2026-11-06 用户提出）。
 * 授权来源不单独成表（和名单的来源标签重复），做成名单上方可点的来源标签。
 * 文案用正式术语：可访问人员 / 非项目成员 / 授权来源 / 具有操作权限 / 仅可查看（2026-11-06 用户要求）。
 */
export function ProjectVisibleMembersPanel({ workspaceSlug, projectId }: Props) {
  const { data, isLoading, refresh } = useProjectVisibleMembers(workspaceSlug, projectId);

  if (!data) {
    return isLoading ? (
      <Loader className="flex flex-col gap-4">
        <Loader.Item height="104px" />
        <Loader.Item height="560px" />
      </Loader>
    ) : (
      <div className="rounded-xl border border-subtle py-12 text-center">
        <p className="text-13 text-secondary">读取可访问人员失败</p>
        <Button className="mt-3" variant="secondary" size="lg" onClick={() => void refresh()}>
          重试
        </Button>
      </div>
    );
  }

  const channels = buildChannels(data);
  const memberCount = data.people.filter((person) => person.is_member).length;
  const outsiders = data.people.filter((person) => !person.is_member);
  const outsidersWithPermission = outsiders.filter(hasProjectPermission).length;
  const leadNames = data.people
    .filter((person) => person.sources.some((source) => source.type === "lead"))
    .map((person) => person.display_name)
    .join("、");

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="可访问人员" value={data.people.length} sub={`工作区成员 ${data.workspace_member_count} 人`} />
        <Tile label="项目成员" value={memberCount} sub={leadNames ? `项目负责人：${leadNames}` : "未设置项目负责人"} />
        <Tile
          label="非项目成员"
          value={outsiders.length}
          sub={
            outsiders.length === 0
              ? "仅项目成员可访问"
              : outsidersWithPermission > 0
                ? `${outsidersWithPermission} 人具有操作权限`
                : "均无操作权限"
          }
          warn={outsidersWithPermission > 0}
        />
      </div>

      <VisiblePeopleTable data={data} channels={channels} />
    </div>
  );
}
