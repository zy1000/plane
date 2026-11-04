import { useState } from "react";
import { observer } from "mobx-react";
import { EIssueFilterType } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useGroupByOptions } from "@/plane-web/components/issues/issue-layouts/utils";
import {
  DEFECT_QUICK_FILTER_LABEL,
  DEFECT_RAIL_GROUP_BY_KEYS,
  DEFECT_RAIL_GROUP_KEY,
  getDefectRailGroupBy,
} from "./defect-rail-group";
import type { TDefectDisplayFilters, TDefectRailGroupBy } from "./defect-rail-group";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 缺陷页「显示」里的「分组方式」：照工作项的分组方式（同一套选项和名字），
 * 默认项「快捷筛选」即左栏原来的九个口径；选了别的维度，左栏改列该维度的各组。
 */
export const DefectRailGroupByOption = observer(function DefectRailGroupByOption(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { currentProjectDetails } = useProject();
  const [isExpanded, setIsExpanded] = useState(true);
  const groupByOptions = useGroupByOptions(DEFECT_RAIL_GROUP_BY_KEYS);

  const selected = getDefectRailGroupBy(issuesFilter?.getIssueFilters(projectId, "defects")?.displayFilters);

  const handleSelect = (key: TDefectRailGroupBy | null) => {
    if (key === selected) return;
    const update: Partial<TDefectDisplayFilters> = { [DEFECT_RAIL_GROUP_KEY]: key };
    void issuesFilter.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, update, "defects");
  };

  return (
    <>
      <FilterHeader
        title={t("common.group_by")}
        isPreviewEnabled={isExpanded}
        handleIsPreviewEnabled={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <div>
          <FilterOption
            isChecked={selected === null}
            onClick={() => handleSelect(null)}
            title={DEFECT_QUICK_FILTER_LABEL}
            multiple={false}
          />
          {groupByOptions.map(({ key, titleTranslationKey }) => {
            if (!key) return null;
            // 和工作项一样：项目关了迭代 / 模块就不给这两个维度
            if (key === "cycle" && !currentProjectDetails?.cycle_view) return null;
            if (key === "module" && !currentProjectDetails?.module_view) return null;
            return (
              <FilterOption
                key={key}
                isChecked={selected === key}
                onClick={() => handleSelect(key)}
                title={t(titleTranslationKey)}
                multiple={false}
              />
            );
          })}
        </div>
      )}
    </>
  );
});
