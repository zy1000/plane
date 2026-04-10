"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { TimesheetOverview } from "@/components/timesheets/overview";
import { useUser } from "@/hooks/store/user";

function WorkspaceTimesheetsOverviewPage() {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();

  return (
    <>
      <PageHead title="工时管理 - 概览" />
      <TimesheetOverview workspaceSlug={workspaceSlug?.toString() ?? ""} memberId={currentUser?.id} />
    </>
  );
}

export default observer(WorkspaceTimesheetsOverviewPage);
