/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ReleaseIssueQuickActions } from "../../quick-action-dropdowns/release-issue";
import { BaseSpreadsheetRoot } from "../base-spreadsheet-root";

export const ReleaseSpreadsheetLayout = observer(function ReleaseSpreadsheetLayout() {
  const { releaseId } = useParams();

  return <BaseSpreadsheetRoot QuickActions={ReleaseIssueQuickActions} viewId={releaseId?.toString()} />;
});
