import { observer } from "mobx-react";
import type { TProjectListLookups } from "../filters/use-project-list-lookups";
import { ProjectQuickFilterBar } from "./project-quick-filter-bar";
import { useProjectQuickFilters } from "./use-project-quick-filters";

type Props = {
  workspaceSlug: string;
  lookups: TProjectListLookups;
};

/** 列表页根挂的快捷筛选条：把 store 状态接到展示组件上 */
export const ProjectQuickFilters = observer(function ProjectQuickFilters({ workspaceSlug, lookups }: Props) {
  const quick = useProjectQuickFilters(workspaceSlug, lookups);
  return (
    <ProjectQuickFilterBar
      scope={quick.scope}
      counts={quick.counts}
      mainStatuses={quick.mainStatuses}
      closedStatuses={quick.closedStatuses}
      myProjects={quick.myProjects}
      onScopeChange={quick.setScope}
      onMyProjectsChange={quick.setMyProjects}
    />
  );
});
