/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TJobRoleReference } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useJobRoleReferences } from "@/hooks/store/use-workspace-job-roles";
import { JOB_ROLE_DIMENSION_LABELS, formatJobRoleApprovalRule, getJobRoleReferencePath } from "./helpers";

const GRID =
  "grid grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(220px,1.4fr)_96px_minmax(120px,0.9fr)_56px] items-center gap-x-4 px-5";

/** 角色详情「工作流引用」页签：哪些工作流流转按这个角色找发起人 / 目标负责人 / 审批人 */
export function JobRoleReferences(props: { workspaceSlug: string; roleId: string }) {
  const { workspaceSlug, roleId } = props;
  const { data, isLoading, error, reload } = useJobRoleReferences(workspaceSlug, roleId, true);

  return (
    <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
      <div className="min-w-[900px]">
        <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
          <span>工作流</span>
          <span>适用范围</span>
          <span>流转</span>
          <span>引用方式</span>
          <span>审批规则</span>
          <span className="flex justify-end">操作</span>
        </div>
        {isLoading && data.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((index) => (
              <Loader.Item key={index} height="40px" />
            ))}
          </Loader>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-13 text-secondary">{error}</p>
            <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
              重试
            </Button>
          </div>
        ) : data.length === 0 ? (
          <p className="py-14 text-center text-14 text-placeholder">暂无工作流引用</p>
        ) : (
          data.map((reference) => (
            <ReferenceRow key={reference.id} workspaceSlug={workspaceSlug} reference={reference} />
          ))
        )}
      </div>
    </div>
  );
}

function ReferenceRow({ workspaceSlug, reference }: { workspaceSlug: string; reference: TJobRoleReference }) {
  const { workflow, scope } = reference;
  return (
    <div className={cn(GRID, "min-h-[62px] border-b border-subtle py-2 text-14 last:border-b-0")}>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-primary" title={workflow.name}>
            {workflow.name}
          </span>
          {!workflow.is_active && (
            <span className="inline-flex h-5 shrink-0 items-center rounded bg-layer-1 px-1.5 text-11 text-tertiary">
              未启用
            </span>
          )}
        </span>
        <span className="truncate text-13 text-tertiary">{reference.issue_type_name || "—"}</span>
      </span>
      <span className="truncate text-secondary" title={scope.kind === "project" ? scope.name : "工作项类型库"}>
        {scope.kind === "project" ? (
          <>
            <span className="mr-1.5 text-tertiary">项目</span>
            {scope.name}
          </>
        ) : (
          "工作项类型库"
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <StateChip state={reference.from_state} />
        <ArrowRight className="size-3.5 shrink-0 text-placeholder" aria-hidden="true" />
        <StateChip state={reference.to_state} />
      </span>
      <span className="text-secondary">{JOB_ROLE_DIMENSION_LABELS[reference.dimension]}</span>
      <span className={cn("whitespace-nowrap", reference.dimension === "approver" ? "text-secondary" : "text-placeholder")}>
        {formatJobRoleApprovalRule(reference)}
      </span>
      <span className="flex justify-end">
        <Link to={getJobRoleReferencePath(workspaceSlug, reference)} className="text-14 text-accent-primary hover:underline">
          查看
        </Link>
      </span>
    </div>
  );
}

function StateChip({ state }: { state: { name: string; color: string } }) {
  return (
    <span className="inline-flex h-[26px] min-w-0 items-center gap-1.5 rounded-md bg-layer-1 px-2.5 text-13 text-primary">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: state.color }} aria-hidden="true" />
      <span className="truncate">{state.name}</span>
    </span>
  );
}
