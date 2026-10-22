/**
 * 研发模式各页的路径与选中判定。路径集中在这里，左栏、页签、跳转都从这里取，别再手写字符串。
 * `devModesBasePath` 是「全部模式对比」，模式页的三个页签是 阶段与评审（索引）/ 工作项 / 组件。
 */

export const devModesBasePath = (workspaceSlug: string) => `/${workspaceSlug}/templates/dev-modes`;

export const devModeDetailPath = (workspaceSlug: string, devModeId: string) =>
  `${devModesBasePath(workspaceSlug)}/${devModeId}`;

/** 阶段页 = 详情的默认子页，没有自己的路径段 */
export const devModeStagesPath = devModeDetailPath;

export const devModeFeaturesPath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/features`;

/**
 * 「工作项」页签：模式方案的类型、属性、状态、工作流（docs/issue-scheme/ 4.1）。
 * 选中类型用 `?type=`，属性 / 状态 / 工作流分段用 `?tab=`；流转配置是它下面的子路径。
 */
export const devModeIssueSchemePath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/issue-scheme`;

export const devModeIssueSchemeWorkflowPath = (workspaceSlug: string, devModeId: string, workflowId: string) =>
  `${devModeIssueSchemePath(workspaceSlug, devModeId)}/workflows/${workflowId}`;

/** 评审模板库里某个阶段类型的维护入口（阶段页右栏的「评审模板库」链接） */
export const reviewTemplatesPath = (workspaceSlug: string, stageTypeId?: string) =>
  stageTypeId
    ? `/${workspaceSlug}/templates/reviews?stage=${stageTypeId}`
    : `/${workspaceSlug}/templates/reviews`;

const normalizePath = (path: string) => path.replace(/\/+$/, "");

/**
 * 子页页签的选中判定。
 *
 * 阶段页是索引页（路径就是详情本身），所以不能用前缀匹配 —— 那样 /features 也会
 * 把阶段页判成选中。索引页只认全等，其余子页认前缀。
 */
export const isDevModeSubPageActive = (pathname: string, subPagePath: string, isIndex: boolean) => {
  const current = normalizePath(pathname);
  const base = normalizePath(subPagePath);
  return isIndex ? current === base : current === base || current.startsWith(`${base}/`);
};
