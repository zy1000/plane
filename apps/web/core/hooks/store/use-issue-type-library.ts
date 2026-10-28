import useSWR from "swr";
import { toIssueSchemeScopeKey } from "@/services/project/issue-scheme-scope";
import { IssueSchemeService } from "@/services/project/issue-scheme.service";

const issueSchemeService = new IssueSchemeService();

export const getIssueTypeLibrarySWRKey = (workspaceSlug: string) => `ISSUE_TYPE_LIBRARY_${workspaceSlug}`;

/**
 * 工作区的工作项类型库（所有研发模式共用的一个方案）。
 *
 * 库不存在时后端在这个请求里先建并生成种子，所以类型 / 状态 / 工作流 / 字段都要等它回来再拉：
 * `scopeKey` 只在库到手后才给，下游 hook 拿到 undefined 就不发请求。
 */
export const useIssueTypeLibrary = (workspaceSlug: string | undefined) => {
  const { data: library, error } = useSWR(
    workspaceSlug ? getIssueTypeLibrarySWRKey(workspaceSlug) : null,
    workspaceSlug ? () => issueSchemeService.getIssueTypeLibrary(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );
  return {
    library,
    libraryError: error as unknown,
    scopeKey: library ? toIssueSchemeScopeKey(library.id) : undefined,
  };
};
