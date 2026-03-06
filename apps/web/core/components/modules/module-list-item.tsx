"use client";

import React, { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Check } from "lucide-react";
// ui
import { CircularProgressIndicator } from "@plane/ui";
// components
import { ListItem } from "@/components/core/list";
import { ModuleDetailDrawer } from "@/components/modules/module-detail-drawer";
import { ModuleListItemAction, ModuleQuickActions } from "@/components/modules";
// helpers
// hooks
import { useModule } from "@/hooks/store/use-module";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useState } from "react";

type Props = {
  moduleId: string;
};

export const ModuleListItem: React.FC<Props> = observer((props) => {
  const { moduleId } = props;
  // refs
  const parentRef = useRef(null);
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getModuleById } = useModule();
  const { isMobile } = usePlatformOS();
  // states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // derived values
  const moduleDetails = getModuleById(moduleId);

  if (!moduleDetails) return null;

  const completionPercentage =
    ((moduleDetails.completed_issues + moduleDetails.cancelled_issues) / moduleDetails.total_issues) * 100;

  const progress = isNaN(completionPercentage) ? 0 : Math.floor(completionPercentage);

  const completedModuleCheck = moduleDetails.status === "completed";

  // handlers
  const openModuleOverview = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDrawerOpen(true);
  };

  const handleArchivedModuleClick = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    openModuleOverview(e);
  };

  const handleItemClick = moduleDetails.archived_at ? handleArchivedModuleClick : undefined;

  return (
    <>
      <ListItem
        title={moduleDetails?.name ?? ""}
        itemLink={`/${workspaceSlug?.toString()}/projects/${moduleDetails.project_id}/modules/${moduleDetails.id}/overview`}
        onItemClick={handleItemClick}
        prependTitleElement={
          <CircularProgressIndicator size={30} percentage={progress} strokeWidth={3}>
            {completedModuleCheck ? (
              progress === 100 ? (
                <Check className="h-3 w-3 stroke-[2] text-custom-primary-100" />
              ) : (
                <span className="text-sm text-custom-primary-100">{`!`}</span>
              )
            ) : progress === 100 ? (
              <Check className="h-3 w-3 stroke-[2] text-custom-primary-100" />
            ) : (
              <span className="text-[9px] text-custom-text-300">{`${progress}%`}</span>
            )}
          </CircularProgressIndicator>
        }
        actionableItems={
          <ModuleListItemAction moduleId={moduleId} moduleDetails={moduleDetails} parentRef={parentRef} />
        }
        quickActionElement={
          <div className="block md:hidden">
            <ModuleQuickActions
              parentRef={parentRef}
              moduleId={moduleId}
              projectId={projectId.toString()}
              workspaceSlug={workspaceSlug.toString()}
            />
          </div>
        }
        isMobile={isMobile}
        parentRef={parentRef}
      />
      <ModuleDetailDrawer
        moduleId={moduleId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        isArchived={!!moduleDetails.archived_at}
      />
    </>
  );
});
