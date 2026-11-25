import { useEffect, useMemo, useState } from "react";
// hooks
import { useIssueTypeLibrary } from "@/hooks/store/use-issue-type-library";
import { useProject } from "@/hooks/store/use-project";
// services
import { ProjectIssueTypeService } from "@/services/project/project-issue-type.service";
import type { TIssueType } from "@/services/project/project-issue-type.service";

export type TIssueTypeCopyScopeOption = {
  /** 作用域键：类型库 `scheme:<id>`，项目自定义的项目直接是项目 id */
  key: string;
  label: string;
  group: "library" | "project";
};

const projectIssueTypeService = new ProjectIssueTypeService();

/**
 * 复制类型的来源：类型库 + 我参与的「项目自定义」项目（跟随研发模式的项目用的就是类型库，不单列）。
 * `scopeKey` 选定后拉该作用域的类型列表（service 有缓存）。调用方组件要是 observer。
 */
export const useIssueTypeCopySources = (workspaceSlug: string, scopeKey: string | undefined, enabled: boolean) => {
  const { scopeKey: libraryScopeKey } = useIssueTypeLibrary(enabled ? workspaceSlug : undefined);
  const { joinedProjectIds, getProjectById } = useProject();
  const [issueTypes, setIssueTypes] = useState<TIssueType[] | undefined>();

  const scopeOptions = useMemo<TIssueTypeCopyScopeOption[]>(() => {
    const options: TIssueTypeCopyScopeOption[] = [];
    if (libraryScopeKey) options.push({ key: libraryScopeKey, label: "类型库", group: "library" });
    for (const projectId of joinedProjectIds) {
      const project = getProjectById(projectId);
      if (project?.issue_scheme_detail?.is_project_owned) {
        options.push({ key: project.id, label: project.name, group: "project" });
      }
    }
    return options;
  }, [libraryScopeKey, joinedProjectIds, getProjectById]);

  useEffect(() => {
    if (!enabled || !scopeKey) return;
    let cancelled = false;
    setIssueTypes(undefined);
    projectIssueTypeService
      .fetchProjectIssueTypes(workspaceSlug, scopeKey)
      .then((types) => {
        if (!cancelled) setIssueTypes(types ?? []);
      })
      .catch(() => {
        if (!cancelled) setIssueTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceSlug, scopeKey]);

  return { scopeOptions, issueTypes };
};
