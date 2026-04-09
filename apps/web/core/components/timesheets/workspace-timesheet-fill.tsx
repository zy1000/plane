import { useEffect } from "react";
import { observer } from "mobx-react";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useTimesheetPage } from "@/hooks/store/use-timesheet-page";
import { TimesheetTableView } from "./timesheet-table-view";
import { TimesheetTimelineView } from "./timesheet-timeline-view";
import { TimesheetPageToolbar } from "./timesheet-page-toolbar";

type TWorkspaceTimesheetFillProps = {
  workspaceSlug: string;
};

export const WorkspaceTimesheetFill = observer(function WorkspaceTimesheetFill({
  workspaceSlug,
}: TWorkspaceTimesheetFillProps) {
  const { data: currentUser } = useUser();
  const { fetchProjects } = useProject();

  useEffect(() => {
    if (workspaceSlug) {
      fetchProjects(workspaceSlug);
    }
  }, [workspaceSlug, fetchProjects]);

  const timesheetPage = useTimesheetPage({
    workspaceSlug,
    memberId: currentUser?.id,
  });

  const { viewType, fetchTimesheets, weekStart } = timesheetPage;

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets, weekStart]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TimesheetPageToolbar timesheetPage={timesheetPage} />
      <div className="flex-1 min-h-0 overflow-auto">
        {viewType === "table" ? (
          <TimesheetTableView
            timesheetPage={timesheetPage}
            workspaceSlug={workspaceSlug}
            currentUserId={currentUser?.id}
          />
        ) : (
          <TimesheetTimelineView timesheetPage={timesheetPage} workspaceSlug={workspaceSlug} />
        )}
      </div>
    </div>
  );
});
