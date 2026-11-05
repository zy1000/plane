/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { IMyAccessProjectPermissions, IWorkspaceMyAccess } from "@plane/types";
import { cn } from "@plane/utils";
import { useWorkspaceMyProjectAccess } from "@/hooks/store/use-workspace-my-access";
import { PROJECT_KEY_TOTAL, WORKSPACE_KEY_TOTAL } from "../permission-groups/helpers";
import { Chip } from "./chips";
import { getPassthroughLabels, getWorkspaceGroupsInGrants } from "./helpers";
import { PermissionGroupsReadonly } from "./permission-groups-readonly";
import { MyAccessProjectPicker } from "./project-picker";

type Props = {
  workspaceSlug: string;
  data: IWorkspaceMyAccess;
};

function SubHeading(props: { title: string; granted: number; total: number; children?: ReactNode }) {
  const { title, granted, total, children } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
        <span className="text-13 text-tertiary tabular-nums">
          已授予 {granted} / {total}
        </span>
      </div>
      {children}
    </div>
  );
}

/** 「项目权限」小标题下的灰字摘要：来自哪些工作区组、（选了项目时）本项目绑定的模板 / 本项目组各加了多少 */
function ProjectSummary(props: { permissions: IMyAccessProjectPermissions; visibleProjectCount: number }) {
  const { permissions, visibleProjectCount } = props;
  const { project, grants, summary, bound_groups } = permissions;

  const passthrough = getPassthroughLabels(grants);
  if (passthrough.length > 0) {
    return (
      <p className="text-13 text-tertiary">
        {passthrough.join(" / ")} · 全部 {grants.length} 项
      </p>
    );
  }

  const groups = getWorkspaceGroupsInGrants(grants);
  const parts: ReactNode[] = [];
  if (groups.length > 0) {
    parts.push(
      <span key="workspace" className="inline-flex flex-wrap items-center gap-1">
        来自
        {groups.map((group) => (
          <Chip key={group.id}>{group.name}</Chip>
        ))}
        {summary.workspace_group} 项
      </span>
    );
  }
  if (!project) {
    parts.push(
      <span key="all">
        {groups.length > 0
          ? `在 ${visibleProjectCount} 个可见项目上都有；进到具体项目还会并上那里绑定的模板`
          : "没有来自工作区权限组的项目权限；进到具体项目会看到那里绑定的模板"}
      </span>
    );
  } else {
    const templates = bound_groups.filter((group) => group.source === "template");
    const projectGroups = bound_groups.filter((group) => group.source === "project");
    if (templates.length > 0) {
      parts.push(
        <span key="template" className="inline-flex flex-wrap items-center gap-1">
          本项目绑定的模板
          {templates.map((group) => (
            <Chip key={group.id} tone="green">
              {group.name}
            </Chip>
          ))}
          {summary.template > 0 && <>+{summary.template} 项</>}
        </span>
      );
    }
    if (projectGroups.length > 0) {
      parts.push(
        <span key="project" className="inline-flex flex-wrap items-center gap-1">
          本项目的权限组
          {projectGroups.map((group) => (
            <Chip key={group.id}>{group.name}</Chip>
          ))}
          {summary.project_role > 0 && <>+{summary.project_role} 项</>}
        </span>
      );
    }
    if (parts.length === 0) parts.push(<span key="none">这个项目里没有生效的项目权限</span>);
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-tertiary">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <span>·</span>}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

/** 「我能做什么」：工作区权限 + 项目权限（全部可见项目口径，或选一个项目看并上模板后的结果） */
export function PermissionsSection({ workspaceSlug, data }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const { data: projectAccess, error } = useWorkspaceMyProjectAccess(workspaceSlug, projectId);

  // 选了项目但还没回来（或读失败）时先按「全部可见项目」口径画；切项目期间 SWR 保留上一份，整块淡化而不是闪骨架
  const projectPermissions = projectId && projectAccess && !error ? projectAccess : data.project_permissions;
  const isSwitching = Boolean(projectId) && !error && projectPermissions.project?.id !== projectId;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold text-primary">我能做什么</h2>

      <div className="flex flex-col gap-3">
        <SubHeading title="工作区权限" granted={data.workspace_permissions.length} total={WORKSPACE_KEY_TOTAL} />
        <PermissionGroupsReadonly scope="workspace" grants={data.workspace_permissions} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <SubHeading title="项目权限" granted={projectPermissions.grants.length} total={PROJECT_KEY_TOTAL}>
          <MyAccessProjectPicker projects={data.visibility.projects.items} value={projectId} onChange={setProjectId} />
        </SubHeading>
        {projectId && error ? (
          <p className="text-13 text-danger-primary">读取这个项目的权限失败，下面仍按「全部可见项目」口径显示</p>
        ) : (
          <ProjectSummary permissions={projectPermissions} visibleProjectCount={data.visibility.projects.total} />
        )}
        <div className={cn("transition-opacity duration-200", isSwitching && "pointer-events-none opacity-50")}>
          <PermissionGroupsReadonly
            key={projectPermissions.project?.id ?? "all"}
            scope="project"
            grants={projectPermissions.grants}
            showGrantTags={Boolean(projectPermissions.project)}
          />
        </div>
      </div>
    </section>
  );
}
