"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { TimesheetReport } from "@/components/timesheets";

function WorkspaceTimesheetsReportPage() {
  const { workspaceSlug } = useParams();

  return (
    <>
      <PageHead title="工时管理 - 报表" />
      <TimesheetReport workspaceSlug={workspaceSlug?.toString() ?? ""} />
    </>
  );
}

export default observer(WorkspaceTimesheetsReportPage);
