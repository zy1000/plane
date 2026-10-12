import { useMemo } from "react";
import type { TProject } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useProjectFiltersConfig } from "./use-project-filters-config";
import { useProjectListFilter } from "./use-project-list-filter";
import { useProjectListLookups } from "./use-project-list-lookups";

/**
 * 项目列表页根调一次：拉字典、按已加载的项目拼筛选属性、把配置注册到工作区的筛选实例上。
 * 返回的 `lookups` 往下传给表格（状态 / 类型 / BU 列靠它把 id 翻成文字），`filter` 给 FiltersRow。
 */
export const useProjectListFiltering = (workspaceSlug: string | undefined) => {
  const lookups = useProjectListLookups(workspaceSlug);
  const { totalProjectIds, getProjectById } = useProject();
  const { data: currentUser } = useUser();
  const {
    workspace: { workspaceMemberIds },
    getUserDetails,
  } = useMember();

  const projects = useMemo(
    () => (totalProjectIds ?? []).map((id) => getProjectById(id)).filter((project): project is TProject => !!project),
    [totalProjectIds, getProjectById]
  );
  const memberIds = useMemo(() => workspaceMemberIds ?? [], [workspaceMemberIds]);

  const configs = useProjectFiltersConfig({
    workspaceSlug: workspaceSlug ?? "",
    projects,
    lookups,
    currentUser,
    workspaceMemberIds: memberIds,
    getUserDetails,
  });
  const filter = useProjectListFilter(workspaceSlug, configs);

  return { lookups, filter };
};
