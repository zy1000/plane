/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { Pencil, Settings, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { CustomMenu, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TWorkflow } from "@/services/project/project-workflow.service";

type TWorkflowCardProps = {
  workflow: TWorkflow;
  workspaceSlug: string;
  projectId: string;
  canEditWorkflow: boolean;
  canDeleteWorkflow: boolean;
  canConfigWorkflow: boolean;
  onToggleActive: (workflow: TWorkflow, value: boolean) => Promise<void>;
  onEdit: (workflow: TWorkflow) => void;
  onDelete: (workflowId: string) => Promise<void>;
};

export const WorkflowCard: FC<TWorkflowCardProps> = ({
  workflow,
  workspaceSlug,
  projectId,
  canEditWorkflow,
  canDeleteWorkflow,
  canConfigWorkflow,
  onToggleActive,
  onEdit,
  onDelete,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const workflowSettingsPath = `/${workspaceSlug}/settings/projects/${projectId}/workflow/${workflow.id}${location.search}`;

  const handleToggleActive = async (value: boolean) => {
    if (!canEditWorkflow || isToggling) return;
    setIsToggling(true);
    try {
      await onToggleActive(workflow, value);
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteWorkflow || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(workflow.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    navigate(workflowSettingsPath);
  };

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3.5 transition-shadow hover:shadow-sm"
      )}
      onClick={handleCardClick}
    >
      {/* left: name + description */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{workflow.name}</p>
        {workflow.description && <p className="mt-0.5 truncate text-xs text-secondary">{workflow.description}</p>}
      </div>

      {/* right: badges + toggle + menu */}
      <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {workflow.is_active && (
          <span className="inline-flex items-center rounded-sm bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-primary">
            活动
          </span>
        )}

        <ToggleSwitch
          value={workflow.is_active}
          onChange={handleToggleActive}
          disabled={!canEditWorkflow || isToggling}
          size="sm"
        />

        <CustomMenu ellipsis placement="bottom-end">
          <CustomMenu.MenuItem
            onClick={() => {
              if (canConfigWorkflow) {
                navigate(workflowSettingsPath);
              }
            }}
            disabled={!canConfigWorkflow}
          >
            <span className="flex items-center gap-2 text-sm">
              <Settings className="h-3.5 w-3.5" />
              配置流转
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={() => {
              if (canEditWorkflow) onEdit(workflow);
            }}
            disabled={!canEditWorkflow}
          >
            <span className="flex items-center gap-2 text-sm">
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={handleDelete} disabled={!canDeleteWorkflow || isDeleting}>
            <span
              className={cn(
                "flex items-center gap-2 text-sm",
                canDeleteWorkflow ? "text-danger-primary" : "text-placeholder"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </span>
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
    </div>
  );
};
