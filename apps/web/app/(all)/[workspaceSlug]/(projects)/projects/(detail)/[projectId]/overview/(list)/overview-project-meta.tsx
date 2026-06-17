import { type FC, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Award, CalendarClock, UserCircle2 } from "lucide-react";
import { DoubleCircleIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
import { getDate, renderFormattedDate } from "@plane/utils";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  project: IProject;
};

type TMetaFact = {
  key: string;
  label: string;
  icon: typeof Award;
  iconClassName: string;
  value: ReactNode;
};

/** 项目静态信息（状态/负责人/等级/创建时间），用于概览 Hero 左侧区域。 */
export const OverviewProjectMeta: FC<Props> = observer(({ project }) => {
  const { getUserDetails } = useMember();

  const projectLead =
    typeof project.project_lead === "string"
      ? getUserDetails(project.project_lead)
      : project.project_lead ?? undefined;

  const facts: TMetaFact[] = [
    {
      key: "status",
      label: "项目状态",
      icon: DoubleCircleIcon,
      iconClassName: "text-placeholder",
      value: <span className="text-sm text-primary">{project.archived_at ? "已归档" : "进行中"}</span>,
    },
    {
      key: "lead",
      label: "负责人",
      icon: UserCircle2,
      iconClassName: "text-emerald-500",
      value: projectLead ? (
        <span className="truncate text-sm text-primary">{projectLead.display_name ?? projectLead.email}</span>
      ) : (
        <span className="text-sm text-placeholder">未指定</span>
      ),
    },
    {
      key: "grade",
      label: "项目等级",
      icon: Award,
      iconClassName: "text-amber-500",
      value: project.grade ? <ProjectGradeBadge grade={project.grade} /> : <span className="text-sm text-placeholder">-</span>,
    },
    {
      key: "created",
      label: "创建时间",
      icon: CalendarClock,
      iconClassName: "text-violet-500",
      value: (
        <span className="text-sm tabular-nums text-primary">
          {project.created_at ? renderFormattedDate(getDate(project.created_at), "yyyy-MM-dd") : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
      {facts.map((fact) => {
        const Icon = fact.icon;
        return (
          <div key={fact.key} className="flex min-w-0 items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${fact.iconClassName}`} />
            <span className="flex-shrink-0 text-[11px] text-placeholder">{fact.label}</span>
            <div className="flex min-w-0 items-center truncate">{fact.value}</div>
          </div>
        );
      })}
    </div>
  );
});
