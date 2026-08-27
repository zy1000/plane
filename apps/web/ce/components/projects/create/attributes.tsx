/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useFormContext } from "react-hook-form";
import { ETabIndices } from "@plane/constants";
import { getTabIndex } from "@plane/utils";
import { ProjectPlanSection, ProjectTeamSection } from "@/components/project/form-fields";
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  isMobile?: boolean;
};

/** 创建弹窗的「团队」+「计划」分区（可见性已并入基本信息） */
function ProjectAttributes(props: Props) {
  const { isMobile = false } = props;
  const { control } = useFormContext<TProject>();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);

  return (
    <>
      <ProjectTeamSection control={control} variant="modal" getIndex={getIndex} />
      <ProjectPlanSection control={control} variant="modal" getIndex={getIndex} />
    </>
  );
}

export default ProjectAttributes;
export { ProjectAttributes };
