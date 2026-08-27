import { type FC, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Award, Shapes, UserCircle2 } from "lucide-react";
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

/** 项目静态信息（状态/负责人/等级/类型/创建时间），用于概览 Hero 左侧区域。 */
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
      key: "product-type",
      label: "产品类型",
      icon: Shapes,
      iconClassName: "text-violet-500",
      value: <span className="truncate text-sm text-primary">{project.product_type ?? "-"}</span>,
    },
  ];
  const createdAt = project.created_at ? renderFormattedDate(getDate(project.created_at), "yyyy-MM-dd") : "-";

  return (
    <div className="flex h-full w-full flex-col justify-between">
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-8">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.key} className="flex min-w-0 items-start gap-1.5">
              <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${fact.iconClassName}`} />
              <div className="min-w-0">
                <span className="block text-[11px] leading-4 text-placeholder">{fact.label}</span>
                <div className="mt-1.5 flex min-w-0 items-center truncate">{fact.value}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pt-3 text-[12px] leading-4 text-placeholder">创建时间 {createdAt}</div>
    </div>
  );
});
