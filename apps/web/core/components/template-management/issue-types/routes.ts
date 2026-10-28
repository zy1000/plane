/**
 * 工作项类型库页的路径。选中类型用 `?type=`，属性 / 状态 / 工作流分段用 `?tab=`（属性是默认段，不写）；
 * 流转配置是它下面的子路径，带上 `?type=` 返回时回到原来的类型。
 */

export type TIssueTypeLibrarySegment = "props" | "states" | "workflows";

export const issueTypeLibraryBasePath = (workspaceSlug: string) => `/${workspaceSlug}/templates/issue-types`;

export const issueTypeLibraryPath = (
  workspaceSlug: string,
  options: { typeId?: string | null; tab?: TIssueTypeLibrarySegment } = {}
) => {
  const params = new URLSearchParams();
  if (options.typeId) params.set("type", options.typeId);
  if (options.tab && options.tab !== "props") params.set("tab", options.tab);
  const query = params.toString();
  return `${issueTypeLibraryBasePath(workspaceSlug)}${query ? `?${query}` : ""}`;
};

export const issueTypeLibraryWorkflowPath = (workspaceSlug: string, workflowId: string, typeId?: string | null) =>
  `${issueTypeLibraryBasePath(workspaceSlug)}/workflows/${workflowId}${typeId ? `?type=${typeId}` : ""}`;
