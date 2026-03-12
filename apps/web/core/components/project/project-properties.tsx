"use client";

import type { FC } from "react";
import { observer } from "mobx-react";
import { CalendarClock, Users, UserCircle2 } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui icons
import { DoubleCircleIcon } from "@plane/propel/icons";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// helpers
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// types
import type { TProject } from "@plane/types";

interface IProjectProperties {
  workspaceSlug: string;
  projectId: string;
  disabled?: boolean;
}

export const ProjectProperties: FC<IProjectProperties> = observer((props) => {
  const { workspaceSlug, projectId, disabled = false } = props;
  const { t } = useTranslation();

  // store hooks
  const { getProjectById, updateProject } = useProject();

  // derived values
  const project = getProjectById(projectId);
  if (!project) return <></>;

  const handleProjectUpdate = async (data: Partial<TProject>) => {
    if (!disabled) {
      await updateProject(workspaceSlug, projectId, data);
    }
  };

  return (
    <div>
      <h5 className="text-lg font-medium">{t("common.properties")}</h5>
      <div className={`w-full grid grid-cols-2 gap-4 mt-3 ${disabled ? "opacity-60" : ""}`}>
        {/* 项目状态 */}
        <div className="flex w-full items-center gap-3 h-8">
          <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
            <DoubleCircleIcon className="h-4 w-4 flex-shrink-0" />
            <span>状态</span>
          </div>
          <StateDropdown
            value={project?.default_state}
            onChange={(val) => handleProjectUpdate({ default_state: val })}
            projectId={projectId}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="w-2/3 flex-grow group"
            buttonContainerClassName="w-full text-left"
            buttonClassName="text-sm"
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          />
        </div>

        {/* 项目负责人 */}
        <div className="flex w-full items-center gap-3 h-8">
          <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
            <UserCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>项目负责人</span>
          </div>
          <MemberDropdown
            value={(typeof project.project_lead === "string" ? project.project_lead : project.project_lead?.id) || null}
            onChange={(val: string | string[] | null) =>
              handleProjectUpdate({ project_lead: Array.isArray(val) ? val[0] : val })
            }
            disabled={disabled}
            projectId={projectId}
            placeholder="选择负责人"
            buttonVariant="transparent-with-text"
            className="w-2/3 flex-grow group"
            buttonContainerClassName="w-full text-left"
            buttonClassName={`text-sm ${project?.project_lead ? "" : "text-placeholder"}`}
            hideIcon={!project.project_lead}
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
            multiple={false}
            showUserDetails={true}
          />
        </div>

        {/* 项目成员 */}
        <div className="flex w-full items-center gap-3 h-8">
          <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>成员数量</span>
          </div>
          <div className="w-full h-full flex items-center gap-1.5 rounded px-2 py-0.5 text-sm justify-between cursor-not-allowed">
            <span className="flex-grow truncate leading-5">{project.members?.length || 0} 名成员</span>
          </div>
        </div>

        {/* 创建者 */}
        {/* {createdByDetails && (
          <div className="flex w-full items-center gap-3 h-8">
            <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
              <UserCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>创建者</span>
            </div>
            <div className="w-full h-full flex items-center gap-1.5 rounded px-2 py-0.5 text-sm justify-between cursor-not-allowed">
              <ButtonAvatars showTooltip userIds={createdByDetails?.id} />
              <span className="flex-grow truncate leading-5">{createdByDetails?.display_name}</span>
            </div>
          </div>
        )} */}

        {/* 项目可见性 */}
        {/* <div className="flex w-full items-center gap-3 h-8">
          <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
            {project.network === 0 ? (
              <Lock className="h-4 w-4 flex-shrink-0" />
            ) : (
              <Globe className="h-4 w-4 flex-shrink-0" />
            )}
            <span>可见性</span>
          </div>
          <div className="w-full h-full flex items-center gap-1.5 rounded px-2 py-0.5 text-sm justify-between cursor-not-allowed">
            <span className="flex-grow truncate leading-5">{project.network === 0 ? "私有" : "公开"}</span>
          </div>
        </div> */}

        {/* 创建时间 */}
        <div className="flex w-full items-center gap-3 h-8">
          <div className="flex items-center gap-1 w-1/3 flex-shrink-0 text-sm text-secondary">
            <CalendarClock className="h-4 w-4 flex-shrink-0" />
            <span>创建时间</span>
          </div>
          <DateDropdown
            value={project.created_at}
            onChange={(val) =>
              handleProjectUpdate({
                created_at: val ? renderFormattedPayloadDate(val) : undefined,
              })
            }
            placeholder="选择创建时间"
            buttonVariant="transparent-with-text"
            disabled={true}
            className="w-2/3 flex-grow group"
            buttonContainerClassName="w-full text-left"
            buttonClassName={`text-sm ${project?.created_at ? "" : "text-placeholder"}`}
            hideIcon
            clearIconClassName="h-3 w-3 hidden group-hover:inline"
          />
        </div>
      </div>
    </div>
  );
});
