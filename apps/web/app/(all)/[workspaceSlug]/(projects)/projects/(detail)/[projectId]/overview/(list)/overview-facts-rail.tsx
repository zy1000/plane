import { type FC, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Award, CalendarClock, Timer, UserCircle2, Users } from "lucide-react";
import { DoubleCircleIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getDate, getFileURL, renderFormattedDate } from "@plane/utils";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  project: IProject;
  totalHours: number;
  memberCount: number;
  onMembersClick?: () => void;
  onHoursClick?: () => void;
};

type TFact = {
  key: string;
  label: string;
  icon: typeof Award;
  iconClassName: string;
  value: ReactNode;
  onClick?: () => void;
};

export const OverviewFactsRail: FC<Props> = observer(({ project, totalHours, memberCount, onMembersClick, onHoursClick }) => {
  const { getUserDetails } = useMember();

  const projectLead =
    typeof project.project_lead === "string"
      ? getUserDetails(project.project_lead)
      : project.project_lead ?? undefined;

  const facts: TFact[] = [
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
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={projectLead.display_name} src={getFileURL(projectLead.avatar_url)} size={18} showTooltip={false} />
          <span className="truncate text-sm text-primary">{projectLead.display_name ?? projectLead.email}</span>
        </div>
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
      key: "members",
      label: "成员",
      icon: Users,
      iconClassName: "text-[#3f76ff]",
      value: <span className="text-sm tabular-nums text-primary">{memberCount} 人</span>,
      onClick: onMembersClick,
    },
    {
      key: "hours",
      label: "累计工时",
      icon: Timer,
      iconClassName: "text-amber-500",
      value: (
        <span className="text-sm tabular-nums text-primary">
          {totalHours}
          <span className="ml-0.5 text-xs text-placeholder">h</span>
        </span>
      ),
      onClick: onHoursClick,
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
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-subtle bg-layer-1 px-2 py-1 sm:grid-cols-3 xl:grid-cols-6">
      {facts.map((fact) => {
        const Icon = fact.icon;
        const isClickable = Boolean(fact.onClick);
        return (
          <div
            key={fact.key}
            className={`flex min-w-0 items-center gap-2.5 px-2 py-2 xl:px-3${isClickable ? " cursor-pointer rounded-md transition-colors hover:bg-layer-1-hover" : ""}`}
            onClick={fact.onClick}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fact.onClick?.();
                    }
                  }
                : undefined
            }
          >
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center">
              <Icon className={`h-4 w-4 ${fact.iconClassName}`} />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] leading-tight text-placeholder">{fact.label}</span>
              <div className="flex min-h-5 items-center">{fact.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
