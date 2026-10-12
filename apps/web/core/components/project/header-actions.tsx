import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { ProjectDisplayDropdown } from "./display/display-dropdown";
import { useProjectListFilter } from "./filters/use-project-list-filter";

/**
 * 项目列表页头右侧的「筛选」漏斗 + 「显示」面板。
 * 筛选实例按工作区存在 store 里，这里只拿实例；属性配置由列表页根注册。
 */
export const ProjectListHeaderActions = observer(function ProjectListHeaderActions() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const workspaceSlugString = workspaceSlug?.toString();
  const { currentWorkspaceDisplayFilters, currentWorkspaceDisplayProperties, updateDisplayFilters, updateDisplayProperties } =
    useProjectFilter();
  const filter = useProjectListFilter(workspaceSlugString);
  const isArchived = pathname.includes("/archives");

  return (
    <>
      <FiltersToggle filter={filter} enableQuickAddFilter={false} />
      <ProjectDisplayDropdown
        displayFilters={currentWorkspaceDisplayFilters ?? {}}
        displayProperties={currentWorkspaceDisplayProperties}
        hideScopeToggles={isArchived}
        onDisplayFiltersChange={(patch) => workspaceSlugString && updateDisplayFilters(workspaceSlugString, patch)}
        onDisplayPropertiesChange={(patch) => workspaceSlugString && updateDisplayProperties(workspaceSlugString, patch)}
      />
    </>
  );
});
