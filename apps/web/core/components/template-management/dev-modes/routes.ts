/**
 * 研发模式详情的两个子页路径与选中判定。
 *
 * 结构照「评审」标签的子页页签（`components/reviews/routes.ts`）：路径集中在这里，
 * 页签、跳转、面包屑都从这里取，别再手写字符串。以后模式下面加内容就在这里加一条。
 */

export const devModesBasePath = (workspaceSlug: string) => `/${workspaceSlug}/templates/dev-modes`;

export const devModeDetailPath = (workspaceSlug: string, devModeId: string) =>
  `${devModesBasePath(workspaceSlug)}/${devModeId}`;

/** 阶段页 = 详情的默认子页，没有自己的路径段 */
export const devModeStagesPath = devModeDetailPath;

export const devModeFeaturesPath = (workspaceSlug: string, devModeId: string) =>
  `${devModeDetailPath(workspaceSlug, devModeId)}/features`;

/** 评审模板库里某个阶段类型的维护入口（勾选面板的「去评审页签维护这棵树」） */
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
