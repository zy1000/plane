/**
 * 研发模式各页的路径与选中判定。路径集中在这里，左栏、页签、跳转都从这里取，别再手写字符串。
 * `devModesBasePath` 是「全部模式对比」，模式页的页签是 阶段与评审（索引）/ 工作项 / 视图 / 组件。
 */

export const devModesBasePath = (workspaceSlug: string) => `/${workspaceSlug}/templates/dev-modes`;

export const devModeDetailPath = (workspaceSlug: string, devModeId: string) =>
  `${devModesBasePath(workspaceSlug)}/${devModeId}`;

/** 阶段页 = 详情的默认子页，没有自己的路径段 */
export const devModeStagesPath = devModeDetailPath;

export const devModeFeaturesPath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/features`;

/**
 * 「工作项」页签：本模式关联的类型库类型（关联 / 取消关联 / 排序 / 新建）。
 * 类型本身的属性、状态、工作流在类型库页维护（issue-types/routes.ts）。路径段沿用旧名 issue-scheme。
 */
export const devModeIssueSchemePath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/issue-scheme`;

/** 「视图」页签：研发模式视图；页面分段用 `?scope=` */
export const devModeViewsPath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/views`;

/** 研发模式视图「在项目中打开」：项目里对应页面，`?view=` 让页签直接停在这个视图 */
export const projectViewPagePath = (
  workspaceSlug: string,
  projectId: string,
  scope: "issues" | "defects" | "requirements",
  viewId: string
) => `/${workspaceSlug}/projects/${projectId}/${scope}?view=${viewId}`;

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
