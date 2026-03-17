/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useMemo, useState, useEffect } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { EUserPermissionsLevel } from "@plane/constants";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
import { ProjectStateLoader, GroupList } from "@/components/project-states";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
// types
import type { TIssueType } from "@/services/project/project-issue-type.service";
// lucide icons
import * as LucideIcons from "lucide-react";
import { LayersIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

type TProjectState = {
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

export const ProjectStateRoot = observer(function ProjectStateRoot(props: TProjectState) {
  const { workspaceSlug, projectId } = props;
  // hooks
  const {
    getGroupedProjectStatesByIssueTypeId,
    fetchProjectStates,
    createState,
    moveStatePosition,
    updateState,
    deleteState,
    markStateAsDefault,
  } = useProjectState();
  const { allowPermissions } = useUserPermissions();
  const { issueTypes, isLoading: issueTypesLoading } = useProjectIssueTypes(workspaceSlug, projectId);

  // selected issue type state
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState<string | undefined>(undefined);

  // auto-select first issue type when loaded
  useEffect(() => {
    if (!selectedIssueTypeId && issueTypes && issueTypes.length > 0) {
      setSelectedIssueTypeId(issueTypes[0].id);
    }
  }, [issueTypes, selectedIssueTypeId]);

  // derived values
  const isEditable = allowPermissions(
    [EUserProjectRoles.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const selectedIssueType = issueTypes?.find((t) => t.id === selectedIssueTypeId);

  // Fetching states for the selected issue type
  useSWR(
    workspaceSlug && projectId && selectedIssueTypeId
      ? `PROJECT_STATES_${workspaceSlug}_${projectId}_${selectedIssueTypeId}`
      : null,
    workspaceSlug && projectId && selectedIssueTypeId
      ? () => fetchProjectStates(workspaceSlug.toString(), projectId.toString(), selectedIssueTypeId)
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // grouped states for selected issue type
  const groupedProjectStates = getGroupedProjectStatesByIssueTypeId(projectId, selectedIssueTypeId ?? null);

  // State operations callbacks
  const stateOperationsCallbacks: TStateOperationsCallbacks = useMemo(
    () => ({
      createState: async (data: Partial<IState>) =>
        createState(workspaceSlug, projectId, {
          ...data,
          ...(selectedIssueTypeId ? { issue_type_id: selectedIssueTypeId } : {}),
        }),
      updateState: async (stateId: string, data: Partial<IState>) =>
        updateState(workspaceSlug, projectId, stateId, data),
      deleteState: async (stateId: string) => deleteState(workspaceSlug, projectId, stateId),
      moveStatePosition: async (stateId: string, data: Partial<IState>) =>
        moveStatePosition(workspaceSlug, projectId, stateId, data),
      markStateAsDefault: async (stateId: string) => markStateAsDefault(workspaceSlug, projectId, stateId),
    }),
    [workspaceSlug, projectId, selectedIssueTypeId, createState, moveStatePosition, updateState, deleteState, markStateAsDefault]
  );

  if (issueTypesLoading) return <ProjectStateLoader />;

  if (!issueTypes || issueTypes.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-secondary">
        该项目暂无工作项类型
      </div>
    );
  }

  return (
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

      {/* divider */}
      <div className="w-px flex-shrink-0 bg-border-subtle" />

      {/* right content: states for selected type */}
      <div className="min-w-0 flex-1">
        {selectedIssueType && (
          <p className="mb-4 text-sm font-medium text-secondary">
            {selectedIssueType.name} 的状态
          </p>
        )}
        {!groupedProjectStates ? (
          <ProjectStateLoader />
        ) : (
          <GroupList
            groupedStates={groupedProjectStates}
            stateOperationsCallbacks={stateOperationsCallbacks}
            isEditable={isEditable}
            shouldTrackEvents
          />
        )}
      </div>
    </div>
  );
});
