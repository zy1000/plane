import useSWR from "swr";
import { toIssueSchemeScopeKey } from "@/services/project/issue-scheme-scope";
import { IssueSchemeService } from "@/services/project/issue-scheme.service";

const issueSchemeService = new IssueSchemeService();

/**
 * 研发模式的方案概况（跟随项目数等）。
 *
 * 方案没有内容时后端会在这个请求里先补生成，所以类型 / 状态 / 工作流都要等它回来再拉：
 * `scopeKey` 只在方案到手后才给，下游 hook 拿到 undefined 就不发请求。
 */
export const useDevModeIssueScheme = (workspaceSlug: string | undefined, schemeId: string | null | undefined) => {
  const key = workspaceSlug && schemeId ? `DEV_MODE_ISSUE_SCHEME_${workspaceSlug}_${schemeId}` : null;
  const { data: scheme, error } = useSWR(
    key,
    workspaceSlug && schemeId ? () => issueSchemeService.getIssueScheme(workspaceSlug, schemeId) : null,
    { revalidateOnFocus: false }
  );
  return {
    scheme,
    schemeError: error as unknown,
    scopeKey: scheme && schemeId ? toIssueSchemeScopeKey(schemeId) : undefined,
  };
};
