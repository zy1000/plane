import { type FC } from "react";
import { observer } from "mobx-react";
import { CalendarClock, Award, UserCircle2 } from "lucide-react";
import { DoubleCircleIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getDate, getFileURL, renderFormattedDate } from "@plane/utils";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { useMember } from "@/hooks/store/use-member";
import type { IProjectOverviewAnalytics } from "./overview-analytics.types";

type Props = {
  workspaceSlug: string;
  project: IProject;
  analyticsData: IProjectOverviewAnalytics | null;
  disabled?: boolean;
};

const cardBase =
  "rounded-lg border border-subtle bg-surface-1 px-4 py-6 transition-all duration-200 hover:border-primary/20 hover:shadow-sm";
const cardContentBase = "min-w-0 flex-1 space-y-1.5";
const cardLabelClass = "text-sm font-medium text-primary";
const cardValueClass = "text-sm font-normal text-primary";
const kpiIconShell = "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sm bg-surface-2";

export const ProjectOverviewKpiCards: FC<Props> = observer(
  ({ project, analyticsData: _analyticsData }) => {
    const { getUserDetails } = useMember();

    const projectLead =
      typeof project.project_lead === "string"
        ? getUserDetails(project.project_lead)
        : project.project_lead ?? undefined;

    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={cardBase}>
          <div className="flex items-center gap-2.5">
            <div className={kpiIconShell}>
              <DoubleCircleIcon className="h-5 w-5 text-placeholder" />
            </div>
            <div className={cardContentBase}>
              <div className={cardLabelClass}>项目状态</div>
              <div className={cardValueClass}>{project.archived_at ? "已归档" : "进行中"}</div>
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center gap-2.5">
            <div className={kpiIconShell}>
              <UserCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className={cardContentBase}>
              <div className={cardLabelClass}>项目负责人</div>
              {projectLead ? (
                <div className="flex min-h-6 items-center gap-2 min-w-0">
                  <Avatar
                    name={projectLead.display_name}
                    src={getFileURL(projectLead.avatar_url)}
                    showTooltip={false}
                  />
                  <span className="truncate text-sm font-normal text-primary">
                    {projectLead.display_name ?? projectLead.email}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center gap-2.5">
            <div className={kpiIconShell}>
              <Award className="h-5 w-5 text-amber-500" />
            </div>
            <div className={cardContentBase}>
              <div className={cardLabelClass}>项目等级</div>
              {project.grade ? (
                <div className="flex min-h-6 items-center">
                  <ProjectGradeBadge grade={project.grade} />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center gap-2.5">
            <div className={kpiIconShell}>
              <CalendarClock className="h-5 w-5 text-violet-500" />
            </div>
            <div className={cardContentBase}>
              <div className={cardLabelClass}>创建时间</div>
              <div className={cardValueClass}>
                {project.created_at ? renderFormattedDate(getDate(project.created_at)) : "-"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
