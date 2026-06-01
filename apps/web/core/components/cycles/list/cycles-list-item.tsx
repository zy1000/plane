/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import { useRef } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckIcon } from "@plane/propel/icons";
// plane imports
import { CircularProgressIndicator } from "@plane/ui";
// components
import { generateQueryParams, calculateCycleProgress } from "@plane/utils";
import { ListItem } from "@/components/core/list";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { CycleOverdueTag } from "../cycle-overdue-tag";
import { getCycleOverdueToneTextClass, getCycleRowTone } from "../cycle-overdue-utils";
import { CycleQuickActions } from "../quick-actions";
import { CycleListItemAction } from "./cycle-list-item-action";

type TCyclesListItem = {
  cycleId: string;
  handleEditCycle?: () => void;
  handleDeleteCycle?: () => void;
  handleAddToFavorites?: () => void;
  handleRemoveFromFavorites?: () => void;
  workspaceSlug: string;
  projectId: string;
  className?: string;
};

export const CyclesListItem = observer(function CyclesListItem(props: TCyclesListItem) {
  const { cycleId, workspaceSlug, projectId, className = "" } = props;
  // refs
  const parentRef = useRef(null);
  // router
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // hooks
  const { isMobile } = usePlatformOS();
  // store hooks
  const { getCycleById } = useCycle();

  // derived values
  const cycleDetails = getCycleById(cycleId);

  if (!cycleDetails) return null;

  // computed
  const cycleStatus = cycleDetails.status ?? "not_started";
  const isActive = cycleStatus === "in_progress";
  const overdueTone = getCycleRowTone(cycleDetails);

  // handlers
  const openCycleOverview = (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const query = generateQueryParams(searchParams, ["peekCycle"]);
    if (searchParams.has("peekCycle") && searchParams.get("peekCycle") === cycleId) {
      router.push(`${pathname}?${query}`);
    } else {
      router.push(`${pathname}?${query && `${query}&`}peekCycle=${cycleId}`);
    }
  };

  // handlers
  const handleArchivedCycleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    openCycleOverview(e);
  };

  const handleItemClick = cycleDetails.archived_at ? handleArchivedCycleClick : undefined;

  const progress = calculateCycleProgress(cycleDetails);

  return (
    <ListItem
      title={cycleDetails?.name ?? ""}
      titleClassName={getCycleOverdueToneTextClass(overdueTone)}
      itemLink={`/${workspaceSlug}/projects/${projectId}/cycles/${cycleDetails.id}/overview`}
      onItemClick={handleItemClick}
      className={className}
      prependTitleElement={
        <CircularProgressIndicator size={32} percentage={progress} strokeWidth={4}>
          {progress === 100 ? (
            <CheckIcon className="h-3.5 w-3.5 stroke-2 text-primary" />
          ) : (
            <span className="text-10 font-medium tabular-nums leading-none text-primary">{`${progress}%`}</span>
          )}
        </CircularProgressIndicator>
      }
      appendTitleElement={
        <CycleOverdueTag
          cycleDetails={cycleDetails}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleDetails.id}
        />
      }
      actionableItems={
        <CycleListItemAction
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          cycleDetails={cycleDetails}
          parentRef={parentRef}
          isActive={isActive}
        />
      }
      quickActionElement={
        <div className="block md:hidden">
          <CycleQuickActions
            parentRef={parentRef}
            cycleId={cycleId}
            projectId={projectId}
            workspaceSlug={workspaceSlug}
          />
        </div>
      }
      isMobile={isMobile}
      parentRef={parentRef}
      isSidebarOpen={searchParams.has("peekCycle")}
    />
  );
});
