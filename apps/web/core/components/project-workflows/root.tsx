/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState, useEffect } from "react";
import { Plus, Workflow } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@plane/ui";
import { LayersIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// hooks
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectWorkflows } from "@/hooks/store/use-project-workflows";
import { useUserPermissions } from "@/hooks/store/user";
import { EUserPermissionsLevel } from "@plane/constants";
import { EUserProjectRoles } from "@plane/types";
// services
import type { TWorkflow } from "@/services/project/project-workflow.service";
// types
import type { TIssueType } from "@/services/project/project-issue-type.service";
// components
import { WorkflowCard } from "./workflow-card";
import { WorkflowFormModal } from "./workflow-form-modal";

type TProjectWorkflowRootProps = {
  workspaceSlug: string;
  projectId: string;
};

type TIssueTypeSidebarItemProps = {
  issueType: TIssueType;
  isSelected: boolean;
  onClick: () => void;
};

const IssueTypeSidebarItem: FC<TIssueTypeSidebarItemProps> = ({ issueType, isSelected, onClick }) => {
  const { name, color, background_color } = issueType.logo_props?.icon || {};
  const IconComp = name ? ((LucideIcons as any)[name] as React.FC<any> | undefined) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-150",
        isSelected
          ? "bg-accent-primary/10 text-accent-primary font-medium"
          : "text-secondary hover:bg-layer-1 hover:text-primary"
      )}
    >
      <span
        className="inline-flex flex-shrink-0 items-center justify-center rounded"
        style={{
          backgroundColor: background_color || "transparent",
          color: color || "currentColor",
          width: "20px",
          height: "20px",
        }}
      >
        {IconComp ? <IconComp className="h-3.5 w-3.5" strokeWidth={2} /> : <LayersIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="truncate text-sm font-medium">{issueType.name}</span>
      {isSelected && <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />}
    </button>
  );
};

const WorkflowListSkeleton: FC = () => (
  <div className="flex flex-col gap-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="h-16 animate-pulse rounded-lg border border-subtle bg-layer-1" />
    ))}
  </div>
);

export const ProjectWorkflowRoot: FC<TProjectWorkflowRootProps> = ({ workspaceSlug, projectId }) => {
  const { issueTypes, isLoading: issueTypesLoading } = useProjectIssueTypes(workspaceSlug, projectId);
  const { allowPermissions } = useUserPermissions();
  const { fetchWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, getWorkflowsByIssueTypeId, isLoadingForIssueType } =
    useProjectWorkflows(workspaceSlug, projectId);

  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState<string | undefined>(undefined);
  const [modalState, setModalState] = useState<{ isOpen: boolean; workflow?: TWorkflow }>({ isOpen: false });

  const isEditable = allowPermissions(
    [EUserProjectRoles.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  // auto-select first issue type
  useEffect(() => {
    if (!selectedIssueTypeId && issueTypes && issueTypes.length > 0) {
      setSelectedIssueTypeId(issueTypes[0].id);
    }
  }, [issueTypes, selectedIssueTypeId]);

  // fetch workflows when issue type is selected
  useEffect(() => {
    if (selectedIssueTypeId) {
      fetchWorkflows(selectedIssueTypeId);
    }
  }, [selectedIssueTypeId, fetchWorkflows]);

  const selectedIssueType = issueTypes?.find((t) => t.id === selectedIssueTypeId);
  const workflows = selectedIssueTypeId ? getWorkflowsByIssueTypeId(selectedIssueTypeId) : [];
  const isLoadingWorkflows = selectedIssueTypeId ? isLoadingForIssueType(selectedIssueTypeId) : false;

  const handleToggleActive = async (workflow: TWorkflow, value: boolean) => {
    if (!selectedIssueTypeId) return;
    await updateWorkflow(selectedIssueTypeId, { id: workflow.id, is_active: value });
  };

  const handleEdit = (workflow: TWorkflow) => {
    setModalState({ isOpen: true, workflow });
  };

  const handleDelete = async (workflowId: string) => {
    if (!selectedIssueTypeId) return;
    await deleteWorkflow(selectedIssueTypeId, workflowId);
  };

  const handleModalSubmit = async (data: { name: string; description: string; issue_type_id: string }) => {
    if (!selectedIssueTypeId) return;
    if (modalState.workflow) {
      await updateWorkflow(selectedIssueTypeId, { id: modalState.workflow.id, ...data });
    } else {
      await createWorkflow({ ...data, is_active: false });
    }
  };

  if (issueTypesLoading) {
    return (
      <div className="flex gap-6">
        <aside className="w-44 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-layer-1" />
            ))}
          </div>
        </aside>
        <div className="w-px flex-shrink-0 bg-border-subtle" />
        <div className="min-w-0 flex-1">
          <WorkflowListSkeleton />
        </div>
      </div>
    );
  }

  if (!issueTypes || issueTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-secondary gap-3">
        <Workflow className="size-10 text-tertiary" strokeWidth={1.2} />
        <p className="text-sm">该项目暂无工作项类型，请先创建工作项类型。</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-6">
        {/* left sidebar: issue type list */}
        <aside className="flex w-44 flex-shrink-0 flex-col gap-0.5">
          <p className="mb-1.5 px-2.5 text-xs font-medium uppercase tracking-wider text-tertiary">工作项类型</p>
          {issueTypes.map((issueType) => (
            <IssueTypeSidebarItem
              key={issueType.id}
              issueType={issueType}
              isSelected={selectedIssueTypeId === issueType.id}
              onClick={() => setSelectedIssueTypeId(issueType.id)}
            />
          ))}
        </aside>

        {/* vertical divider */}
        <div className="w-px flex-shrink-0 bg-border-subtle" />

        {/* right content: workflows for selected issue type */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-secondary">
              {selectedIssueType ? `${selectedIssueType.name} 的工作流` : "工作流"}
            </p>
            {isEditable && selectedIssueTypeId && (
              <Button
                variant="primary"
                size="sm"
                prependIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setModalState({ isOpen: true, workflow: undefined })}
              >
                新建工作流
              </Button>
            )}
          </div>

          {isLoadingWorkflows ? (
            <WorkflowListSkeleton />
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-12 text-center gap-3">
              <Workflow className="size-8 text-tertiary" strokeWidth={1.2} />
              <div>
                <p className="text-sm font-medium text-secondary">暂无工作流</p>
                <p className="mt-1 text-xs text-tertiary">
                  {isEditable ? "点击「新建工作流」创建第一条工作流" : "该工作项类型下尚未配置工作流"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {[...workflows]
                .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))
                .map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  isEditable={isEditable}
                  onToggleActive={handleToggleActive}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedIssueTypeId && (
        <WorkflowFormModal
          isOpen={modalState.isOpen}
          workflow={modalState.workflow}
          issueTypeId={selectedIssueTypeId}
          onClose={() => setModalState({ isOpen: false })}
          onSubmit={handleModalSubmit}
        />
      )}
    </>
  );
};
