import { type FC } from "react";
import { observer } from "mobx-react";
import { CalendarClock, Award, UserCircle2 } from "lucide-react";
import { PROJECT_GRADE_OPTIONS } from "@plane/constants";
import { DoubleCircleIcon } from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";
import type { IProject, TProject, TProjectGrade } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { getDate, renderFormattedDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
import { useProject } from "@/hooks/store/use-project";
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
  ({ workspaceSlug, project, analyticsData: _analyticsData, disabled = false }) => {
    const { t } = useTranslation();
    const { updateProject } = useProject();

    const handleUpdate = async (data: Partial<TProject>) => {
      if (!disabled) await updateProject(workspaceSlug, project.id, data);
    };

    const gradeSelectValue = project.grade ?? "";

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
              <MemberDropdown
                value={
                  (typeof project.project_lead === "string"
                    ? project.project_lead
                    : project.project_lead?.id) || null
                }
                onChange={(val: string | string[] | null) =>
                  handleUpdate({ project_lead: Array.isArray(val) ? val[0] : val })
                }
                disabled={disabled}
                projectId={project.id}
                placeholder="选择负责人"
                buttonVariant="transparent-with-text"
                className="w-full"
                buttonContainerClassName="w-full text-left"
                buttonClassName={`text-sm font-normal !px-0 !py-0 ${project?.project_lead ? "text-primary" : "text-placeholder"}`}
                hideIcon={!project.project_lead}
                dropdownArrow
                dropdownArrowClassName="h-3 w-3"
                multiple={false}
                showUserDetails
              />
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
              {disabled ? (
                <div className="flex min-h-6 items-center">
                  {project.grade ? (
                    <ProjectGradeBadge grade={project.grade} />
                  ) : (
                    <span className="text-sm font-normal text-placeholder">-</span>
                  )}
                </div>
              ) : (
                <div className="w-full min-w-0" onClick={(e) => e.stopPropagation()}>
                  <CustomSelect
                    className="w-full"
                    value={gradeSelectValue}
                    noChevron
                    onChange={(val: string) => {
                      void handleUpdate({
                        grade: val === "" ? null : (val as TProjectGrade),
                      });
                    }}
                    label={
                      gradeSelectValue ? (
                        <span className="flex items-center gap-1.5">
                          <ProjectGradeBadge grade={gradeSelectValue as TProjectGrade} />
                        </span>
                      ) : (
                        <span className="text-placeholder text-sm">{t("select_project_grade")}</span>
                      )
                    }
                    buttonClassName="!border-0 !shadow-none w-full justify-start bg-transparent !px-0 !py-0 text-left font-normal focus:outline-none focus:ring-0 focus-visible:ring-0 hover:!bg-transparent"
                    input
                  >
                    <CustomSelect.Option value="">
                      <span className="text-13 text-secondary">{t("common.none")}</span>
                    </CustomSelect.Option>
                    {PROJECT_GRADE_OPTIONS.map((opt) => (
                      <CustomSelect.Option key={opt} value={opt}>
                        <ProjectGradeBadge grade={opt} />
                      </CustomSelect.Option>
                    ))}
                  </CustomSelect>
                </div>
              )}
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
