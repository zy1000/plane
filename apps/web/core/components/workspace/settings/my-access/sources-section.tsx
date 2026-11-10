/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";
import type { IMyAccessGroup, IMyAccessTeam, IWorkspaceMyAccess } from "@plane/types";
import { getPermissionGroupDetailPath } from "../permission-groups/helpers";
import { Chip } from "./chips";

type Props = {
  workspaceSlug: string;
  data: IWorkspaceMyAccess;
};

function SourceCard(props: { title: string; count: number; children: ReactNode }) {
  const { title, count, children } = props;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-subtle bg-surface-1 px-5 py-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-14 font-semibold text-primary">{title}</h3>
        <span className="text-13 text-tertiary tabular-nums">{count} 个</span>
      </div>
      {count === 0 ? <p className="text-13 text-tertiary">无</p> : <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function ChipLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-12 text-tertiary">
      <span>{label}</span>
      {children}
    </div>
  );
}

function GroupItem(props: { workspaceSlug: string; group: IMyAccessGroup; meta: string }) {
  const { workspaceSlug, group, meta } = props;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-subtle px-3.5 py-2.5">
      <Link
        to={getPermissionGroupDetailPath(workspaceSlug, group.id)}
        className="truncate text-14 font-medium text-accent-primary hover:underline"
        title={group.name}
      >
        {group.name}
      </Link>
      <span className="text-12 text-tertiary tabular-nums">{meta}</span>
      {!group.is_direct && group.teams.length > 0 && (
        <ChipLine label="经团队">
          {group.teams.map((team) => (
            <Chip key={team.id}>{team.name}</Chip>
          ))}
        </ChipLine>
      )}
    </div>
  );
}

function TeamItem(props: { team: IMyAccessTeam; groupNames: Map<string, string> }) {
  const { team, groupNames } = props;
  const broughtGroups = team.group_ids.map((id) => groupNames.get(id)).filter((name): name is string => Boolean(name));
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-subtle px-3.5 py-2.5">
      <span className="truncate text-14 font-medium text-primary" title={team.name}>
        {team.name}
      </span>
      <span className="text-12 text-tertiary tabular-nums">{team.member_count} 人</span>
      {broughtGroups.length > 0 && (
        <ChipLine label="带来">
          {broughtGroups.map((name) => (
            <Chip key={name}>{name}</Chip>
          ))}
        </ChipLine>
      )}
    </div>
  );
}

/** 「权限来自哪里」：工作区权限组 / 数据权限 / 所在团队 三张卡并排 */
export function SourcesSection({ workspaceSlug, data }: Props) {
  const groupNames = new Map([...data.workspace_groups, ...data.data_groups].map((group) => [group.id, group.name]));

  return (
    <section>
      <h2 className="text-[17px] font-semibold text-primary">权限来自哪里</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SourceCard title="工作区权限组" count={data.workspace_groups.length}>
          {data.workspace_groups.map((group) => (
            <GroupItem
              key={group.id}
              workspaceSlug={workspaceSlug}
              group={group}
              meta={`项目权限 ${group.project_permission_count} · 工作区权限 ${group.workspace_permission_count}`}
            />
          ))}
        </SourceCard>
        <SourceCard title="数据权限组" count={data.data_groups.length}>
          {data.data_groups.map((group) => (
            <GroupItem
              key={group.id}
              workspaceSlug={workspaceSlug}
              group={group}
              meta={`${group.project_count ?? 0} 个项目 · ${group.product_count ?? 0} 个产品`}
            />
          ))}
        </SourceCard>
        <SourceCard title="所在团队" count={data.teams.length}>
          {data.teams.map((team) => (
            <TeamItem key={team.id} team={team} groupNames={groupNames} />
          ))}
        </SourceCard>
      </div>
    </section>
  );
}
