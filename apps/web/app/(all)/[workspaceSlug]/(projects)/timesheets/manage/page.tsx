"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceTimesheetFill } from "@/components/timesheets/workspace-timesheet-fill";

function WorkspaceTimesheetsManagePage() {
  const { workspaceSlug } = useParams();

  return (
    <>
      <PageHead title="工时管理 - 填报工时" />
      <WorkspaceTimesheetFill workspaceSlug={workspaceSlug?.toString() ?? ""} />
    </>
  );
}

export default observer(WorkspaceTimesheetsManagePage);
