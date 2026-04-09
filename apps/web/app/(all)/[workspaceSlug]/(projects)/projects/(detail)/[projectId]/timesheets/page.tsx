"use client";

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { useUser } from "@/hooks/store/user";
import { useProject } from "@/hooks/store/use-project";
import { useTimesheetPage } from "@/hooks/store/use-timesheet-page";
import { TimesheetTableView } from "@/components/timesheets/timesheet-table-view";
import { TimesheetTimelineView } from "@/components/timesheets/timesheet-timeline-view";
import { TimesheetPageToolbar } from "@/components/timesheets/timesheet-page-toolbar";

function ProjectTimesheetsPage() {
  const { workspaceSlug, projectId } = useParams();
  const { data: currentUser } = useUser();
  const { currentProjectDetails } = useProject();

  const timesheetPage = useTimesheetPage({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: projectId?.toString(),
    memberId: currentUser?.id,
    projectName: currentProjectDetails?.name,
  });

  const { viewType, fetchTimesheets, weekStart } = timesheetPage;

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets, weekStart]);

  return (
    <>
      <PageHead title="工时" />
      <div className="flex h-full w-full flex-col overflow-hidden">
        <TimesheetPageToolbar timesheetPage={timesheetPage} />
        <div className="flex-1 min-h-0 overflow-auto">
          {viewType === "table" ? (
            <TimesheetTableView
              timesheetPage={timesheetPage}
              workspaceSlug={workspaceSlug?.toString() ?? ""}
              currentUserId={currentUser?.id}
            />
          ) : (
            <TimesheetTimelineView timesheetPage={timesheetPage} workspaceSlug={workspaceSlug?.toString() ?? ""} />
          )}
        </div>
      </div>
    </>
  );
}

export default observer(ProjectTimesheetsPage);
