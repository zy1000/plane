/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// local imports
import { ModuleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseCalendarRoot } from "../base-calendar-root";

export const ModuleCalendarLayout = observer(function ModuleCalendarLayout() {
  const { moduleId } = useParams();

  if (!moduleId) return null;

  return (
    <BaseCalendarRoot QuickActions={ModuleIssueQuickActions} viewId={moduleId?.toString()} />
  );
});
