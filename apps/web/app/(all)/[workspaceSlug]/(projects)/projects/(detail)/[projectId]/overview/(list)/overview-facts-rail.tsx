import { type FC, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Award, CalendarClock, ClipboardList, FileSearch, Package, Repeat, Timer, UserCircle2, Users } from "lucide-react";
import { DoubleCircleIcon, InfoIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getDate, getFileURL, renderFormattedDate } from "@plane/utils";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  project: IProject;
  totalHours: number;
  memberCount: number;
  cycleCount?: number;
  releaseCount?: number;
  testPlanCount?: number;
  caseReviewCount?: number;
  onMembersClick?: () => void;
  onHoursClick?: () => void;
  onCyclesClick?: () => void;
  onReleasesClick?: () => void;
  onTestPlansClick?: () => void;
  onCaseReviewsClick?: () => void;
};

type TFact = {
  key: string;
  label: string;
  icon: typeof Award;
  iconClassName: string;
  value: ReactNode;
  onClick?: () => void;
  actionIcon?: FC<{ className?: string }>;
  onActionClick?: () => void;
};

export const OverviewFactsRail: FC<Props> = observer(
  ({
    project,
    totalHours,
    memberCount,
    cycleCount = 0,
    releaseCount = 0,
    testPlanCount = 0,
    caseReviewCount = 0,
    onMembersClick,
    onHoursClick,
    onCyclesClick,
    onReleasesClick,
    onTestPlansClick,
    onCaseReviewsClick,
  }) => {
  const { getUserDetails } = useMember();

  const projectLead =
    typeof project.project_lead === "string"
      ? getUserDetails(project.project_lead)
      : project.project_lead ?? undefined;

  const primaryFacts: TFact[] = [
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
      actionIcon: InfoIcon,
      onActionClick: onHoursClick,
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

  const progressFacts: TFact[] = [
    {
      key: "members",
      label: "成员",
      icon: Users,
      iconClassName: "text-[#3f76ff]",
      value: <span className="text-sm tabular-nums text-primary">{memberCount} 人</span>,
      actionIcon: InfoIcon,
      onActionClick: onMembersClick,
    },
    {
      key: "cycles",
      label: "迭代",
      icon: Repeat,
      iconClassName: "text-[#3f76ff]",
      value: <span className="text-sm tabular-nums text-primary">{cycleCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onCyclesClick,
    },
    {
      key: "releases",
      label: "发布",
      icon: Package,
      iconClassName: "text-emerald-500",
      value: <span className="text-sm tabular-nums text-primary">{releaseCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onReleasesClick,
    },
    {
      key: "test-plans",
      label: "测试计划",
      icon: ClipboardList,
      iconClassName: "text-amber-500",
      value: <span className="text-sm tabular-nums text-primary">{testPlanCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onTestPlansClick,
    },
    {
      key: "reviews",
      label: "评审",
      icon: FileSearch,
      iconClassName: "text-violet-500",
      value: <span className="text-sm tabular-nums text-primary">{caseReviewCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onCaseReviewsClick,
    },
  ];

  const renderFact = (fact: TFact) => {
    const Icon = fact.icon;
    const ActionIcon = fact.actionIcon;
    const isClickable = Boolean(fact.onClick);

    return (
      <div
        key={fact.key}
        className={`relative flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors${isClickable ? " cursor-pointer hover:bg-layer-1-hover" : ""}`}
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
        {ActionIcon && fact.onActionClick && (
          <button
            type="button"
            className="absolute right-1.5 top-1.5 cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
            aria-label={`查看${fact.label}详情`}
            title={`查看${fact.label}详情`}
            onClick={(e) => {
              e.stopPropagation();
              fact.onActionClick?.();
            }}
          >
            <ActionIcon className="h-3 w-3" />
          </button>
        )}
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center">
          <Icon className={`h-4 w-4 ${fact.iconClassName}`} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] leading-tight text-placeholder">{fact.label}</span>
          <div className="flex min-h-5 items-center truncate">{fact.value}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-subtle bg-layer-1 p-2">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">{primaryFacts.map(renderFact)}</div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
        {progressFacts.map(renderFact)}
      </div>
    </div>
  );
});
