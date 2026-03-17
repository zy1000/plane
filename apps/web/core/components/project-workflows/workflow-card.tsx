/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { Pencil, Settings, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { CustomMenu, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TWorkflow } from "@/services/project/project-workflow.service";

type TWorkflowCardProps = {
  workflow: TWorkflow;
  workspaceSlug: string;
  projectId: string;
  isEditable: boolean;
  onToggleActive: (workflow: TWorkflow, value: boolean) => Promise<void>;
  onEdit: (workflow: TWorkflow) => void;
  onDelete: (workflowId: string) => Promise<void>;
};

export const WorkflowCard: FC<TWorkflowCardProps> = ({
  workflow,
  workspaceSlug,
  projectId,
  isEditable,
  onToggleActive,
  onEdit,
  onDelete,
}) => {
  const navigate = useNavigate();
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleActive = async (value: boolean) => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      await onToggleActive(workflow, value);
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(workflow.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    navigate(`/${workspaceSlug}/settings/projects/${projectId}/workflow/${workflow.id}`);
  };

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3.5 transition-shadow hover:shadow-sm cursor-pointer"
      )}
      onClick={handleCardClick}
    >
      {/* left: name + description */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{workflow.name}</p>
        {workflow.description && (
          <p className="mt-0.5 truncate text-xs text-secondary">{workflow.description}</p>
        )}
      </div>

      {/* right: badges + toggle + menu */}
      <div
        className="flex flex-shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {workflow.is_active && (
          <span className="inline-flex items-center rounded-sm bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-primary">
            活动
          </span>
        )}

        <ToggleSwitch
          value={workflow.is_active}
          onChange={handleToggleActive}
          disabled={!isEditable || isToggling}
          size="sm"
        />

        {isEditable && (
          <CustomMenu ellipsis placement="bottom-end">
            <CustomMenu.MenuItem onClick={() => navigate(`/${workspaceSlug}/settings/projects/${projectId}/workflow/${workflow.id}`)}>
              <span className="flex items-center gap-2 text-sm">
                <Settings className="h-3.5 w-3.5" />
                配置流转
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onEdit(workflow)}>
              <span className="flex items-center gap-2 text-sm">
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={handleDelete}>
              <span className="flex items-center gap-2 text-sm text-danger-primary">
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
        )}
      </div>
    </div>
  );
};
