/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
// components
import { CycleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseCalendarRoot } from "../base-calendar-root";

export const CycleCalendarLayout = observer(function CycleCalendarLayout() {
  const { currentProjectCompletedCycleIds } = useCycle();
  const { cycleId } = useParams();

  const isCompletedCycle =
    cycleId && currentProjectCompletedCycleIds ? currentProjectCompletedCycleIds.includes(cycleId.toString()) : false;

  if (!cycleId) return null;

  return (
    <BaseCalendarRoot
      QuickActions={CycleIssueQuickActions}
      isCompletedCycle={isCompletedCycle}
      viewId={cycleId?.toString()}
    />
  );
});
