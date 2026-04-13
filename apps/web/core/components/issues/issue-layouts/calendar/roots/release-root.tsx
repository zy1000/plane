/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ReleaseIssueQuickActions } from "../../quick-action-dropdowns/release-issue";
import { BaseCalendarRoot } from "../base-calendar-root";

export const ReleaseCalendarLayout = observer(function ReleaseCalendarLayout() {
  const { releaseId } = useParams();

  if (!releaseId) return null;

  return <BaseCalendarRoot QuickActions={ReleaseIssueQuickActions} viewId={releaseId?.toString()} />;
});
