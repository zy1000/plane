/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
// hooks
import { useProjectStage } from "@/hooks/store/use-project-stage";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string) => void;
  searchQuery: string;
};

/** 「无阶段」在筛选里的值 */
const NO_STAGE_VALUE = "None";

/** 迭代筛选：所属阶段。候选是项目阶段树先序（根阶段带编码、子阶段缩进），末尾一项「无阶段」。 */
export const FilterStage = observer(function FilterStage(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // states
  const [previewEnabled, setPreviewEnabled] = useState(true);
  // hooks
  const { t } = useTranslation();
  const { getProjectStageIds, getProjectStageOptions, fetchStages } = useProjectStage();

  // 阶段池通常已由 project-wrapper 预热；没拉过就补拉一次（同下拉打开时的懒拉）
  const stageIds = projectId ? getProjectStageIds(projectId.toString()) : null;
  useEffect(() => {
    if (!stageIds && workspaceSlug && projectId) void fetchStages(workspaceSlug.toString(), projectId.toString());
  }, [stageIds, workspaceSlug, projectId, fetchStages]);

  const appliedFiltersCount = appliedFilters?.length ?? 0;
  const query = searchQuery.trim().toLowerCase();
  const noStageTitle = t("stage_field.no_stage");

  const options = projectId ? getProjectStageOptions(projectId.toString()) : [];
  const stageOptions = options
    .map(({ stage, depth }) => ({
      value: stage.id,
      title: depth === 0 ? `${stage.code} ${stage.name}` : stage.name,
      depth,
    }))
    .filter((option) => !query || option.title.toLowerCase().includes(query));
  const showNoStage = !query || noStageTitle.toLowerCase().includes(query);

  return (
    <>
      <FilterHeader
        title={`${t("stage_field.cycle_label")}${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {stageOptions.length > 0 || showNoStage ? (
            <>
              {stageOptions.map((option) => (
                <div key={option.value} style={{ paddingLeft: option.depth * 12 }}>
                  <FilterOption
                    isChecked={appliedFilters?.includes(option.value) ? true : false}
                    onClick={() => handleUpdate(option.value)}
                    title={option.title}
                  />
                </div>
              ))}
              {showNoStage && (
                <FilterOption
                  isChecked={appliedFilters?.includes(NO_STAGE_VALUE) ? true : false}
                  onClick={() => handleUpdate(NO_STAGE_VALUE)}
                  title={noStageTitle}
                />
              )}
            </>
          ) : (
            <p className="text-11 text-placeholder italic">No matches found</p>
          )}
        </div>
      )}
    </>
  );
});
