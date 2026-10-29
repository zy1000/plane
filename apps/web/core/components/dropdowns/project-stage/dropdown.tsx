import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import type { TDropdownProps } from "../types";
import { ProjectStageDropdownBase } from "./base";

type TProjectStageDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  projectId: string | undefined;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  valueName?: string | null;
  /** 迭代侧用「所属阶段」，工作项侧默认「阶段」 */
  tooltipHeading?: string;
};

/** 候选 = 项目阶段（树先序、父子都可选）；打开时懒拉，照 ProductDropdown。 */
export const ProjectStageDropdown = observer(function ProjectStageDropdown(props: TProjectStageDropdownProps) {
  const { projectId } = props;
  const { workspaceSlug } = useParams();
  const { getStageById, getProjectStageIds, getProjectStageOptions, fetchStages } = useProjectStage();
  const stageIds = projectId ? getProjectStageIds(projectId) : [];
  const options = projectId ? getProjectStageOptions(projectId) : [];

  const onDropdownOpen = () => {
    if (!stageIds && projectId && workspaceSlug) fetchStages(workspaceSlug.toString(), projectId);
  };

  return (
    <ProjectStageDropdownBase
      {...props}
      getStageById={getStageById}
      options={stageIds ? options : undefined}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
