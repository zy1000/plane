/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { cn } from "@plane/utils";
// components
import { ProjectStateRoot } from "@/components/project-states";
import { IssueTypesSettingsContent } from "@/components/project-issue-types/root";
import { ProjectWorkflowRoot } from "@/components/project-workflows/root";
import { WorkflowTransitionsRoot } from "@/components/project-workflows/workflow-transitions";
// services
import { toIssueSchemeScopeKey } from "@/services/project/issue-scheme-scope";
import { IssueSchemeService } from "@/services/project/issue-scheme.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";
import type { TWorkflow } from "@/services/project/project-workflow.service";
// local imports
import { useDevModeDetailContext } from "./context";
import { devModeIssueSchemePath, devModeIssueSchemeWorkflowPath } from "./routes";

const issueSchemeService = new IssueSchemeService();
const workflowService = new ProjectWorkflowService();

const TABS = [
  { key: "types", label: "类型与属性" },
  { key: "states", label: "状态" },
  { key: "workflows", label: "工作流" },
] as const;
type TTabKey = (typeof TABS)[number]["key"];

/** 取模式方案概况：没有内容时后端会先补生成，所以子组件要等它回来再请求 */
const useModeIssueScheme = () => {
  const { workspaceSlug, devMode } = useDevModeDetailContext();
  const schemeId = devMode?.issue_scheme ?? undefined;
  const { data: scheme, error } = useSWR(
    workspaceSlug && schemeId ? `DEV_MODE_ISSUE_SCHEME_${workspaceSlug}_${schemeId}` : null,
    workspaceSlug && schemeId ? () => issueSchemeService.getIssueScheme(workspaceSlug, schemeId) : null,
    { revalidateOnFocus: false }
  );
  return { schemeId, scheme, error, scopeKey: schemeId ? toIssueSchemeScopeKey(schemeId) : undefined };
};

const PanelLoader = () => (
  <div className="flex flex-col gap-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="h-12 animate-pulse rounded-lg border border-subtle bg-layer-1" />
    ))}
  </div>
);

/**
 * 模式详情的「工作项配置」子页（docs/issue-scheme/ 4）：模式方案的类型与属性 / 状态 / 工作流。
 *
 * 三段直接复用项目设置的组件，传方案作用域键（`scheme:<id>`）：请求走方案级接口，
 * 编辑权限看研发模式管理权限。这里的修改立即作用到所有跟随本模式的项目。
 */
export function DevModeIssueSchemePanel() {
  const { workspaceSlug, devModeId } = useDevModeDetailContext();
  const { scheme, error, scopeKey } = useModeIssueScheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (TABS.find((item) => item.key === searchParams.get("tab"))?.key ?? "types") as TTabKey;

  const handleTabChange = (key: TTabKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === "types") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-14 font-semibold text-primary">工作项配置</h2>
          <p className="mt-1 max-w-4xl text-12 leading-5 text-tertiary">
            跟随本模式的项目共用这套工作项类型、属性、状态和工作流，这里的修改会立即作用到这些项目；已切换为项目自定义的项目不受影响。
            新增的类型要在工作区「角色模板」里勾选它的权限并同步到项目，成员才能使用。
          </p>
        </div>
        {scheme && (
          <span className="shrink-0 whitespace-nowrap pt-1 text-12 text-tertiary">
            <b className="text-14 font-semibold tabular-nums text-primary">{scheme.following_project_count}</b> 个项目正在跟随
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-subtle">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleTabChange(item.key)}
            className={cn(
              "relative mr-3 h-9 px-1 text-13 font-medium transition-colors",
              tab === item.key ? "text-primary" : "text-secondary hover:text-primary"
            )}
          >
            {item.label}
            {tab === item.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-sm bg-accent-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {error ? (
        <div className="py-12 text-center text-13 text-secondary">加载工作项配置失败，请刷新重试。</div>
      ) : !scheme || !scopeKey ? (
        <PanelLoader />
      ) : tab === "types" ? (
        <IssueTypesSettingsContent workspaceSlug={workspaceSlug} projectId={scopeKey} />
      ) : tab === "states" ? (
        <ProjectStateRoot workspaceSlug={workspaceSlug} projectId={scopeKey} />
      ) : (
        <ProjectWorkflowRoot
          workspaceSlug={workspaceSlug}
          projectId={scopeKey}
          getWorkflowDetailPath={(workflowId) => devModeIssueSchemeWorkflowPath(workspaceSlug, devModeId, workflowId)}
        />
      )}
    </div>
  );
}

/** 「工作项配置」下某条工作流的流转配置（同项目设置的工作流详情页） */
export function DevModeIssueSchemeWorkflowPanel() {
  const { workspaceSlug, devModeId } = useDevModeDetailContext();
  const { workflowId } = useParams();
  const { scheme, scopeKey } = useModeIssueScheme();
  const [workflow, setWorkflow] = useState<TWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!scheme || !scopeKey || !workflowId) return;
    setIsLoading(true);
    workflowService
      .fetchWorkflows(workspaceSlug, scopeKey)
      .then((workflows) => setWorkflow(workflows.find((item) => item.id === workflowId) ?? null))
      .catch(() => setWorkflow(null))
      .finally(() => setIsLoading(false));
  }, [scheme, scopeKey, workflowId, workspaceSlug]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link
        to={`${devModeIssueSchemePath(workspaceSlug, devModeId)}?tab=workflows`}
        className="flex w-fit items-center gap-1 text-13 text-secondary hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        返回工作流
      </Link>
      {isLoading || !scopeKey ? (
        <PanelLoader />
      ) : !workflow ? (
        <div className="py-16 text-center text-13 text-secondary">未找到工作流</div>
      ) : (
        <WorkflowTransitionsRoot workspaceSlug={workspaceSlug} projectId={scopeKey} workflow={workflow} />
      )}
    </div>
  );
}
