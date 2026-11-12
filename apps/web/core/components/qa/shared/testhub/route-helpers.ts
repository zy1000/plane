// 测试管理分两处：用例 / 用例库 / 用例评审归产品，测试计划 / 测试报告归项目（2026-11）。
// 项目里也能直接看关联产品的用例和评审：产品 id 放进项目路径（…/testhub/products/:productId/…），
// 页面与弹窗照常从路由取 productId，和产品入口共用一套实现。
export type TTestHubScopeKind = "project" | "product";

export const tmProjectBasePath = (workspaceSlug: string, projectId: string) =>
  `/${workspaceSlug}/projects/${projectId}/testhub`;

export const tmProductBasePath = (workspaceSlug: string, productId: string) =>
  `/${workspaceSlug}/products/${productId}/testhub`;

export const tmBasePath = (workspaceSlug: string, kind: TTestHubScopeKind, id: string) =>
  kind === "product" ? tmProductBasePath(workspaceSlug, id) : tmProjectBasePath(workspaceSlug, id);

/** 项目里某个关联产品的用例 / 评审根路径 */
export const tmProjectProductBasePath = (workspaceSlug: string, projectId: string, productId: string) =>
  `${tmProjectBasePath(workspaceSlug, projectId)}/products/${productId}`;

/**
 * 用例 / 评审页面的根路径（后面接 /cases、/reviews、/caseManagementReviewDetail…）。
 * 当前在项目里（路由带 projectId）就留在项目里，否则走产品入口。
 */
export const tmCaseBasePath = (workspaceSlug: string, productId: string, projectId?: string | null) =>
  projectId
    ? tmProjectProductBasePath(workspaceSlug, projectId, productId)
    : tmProductBasePath(workspaceSlug, productId);

/** 某条用例的详情页 */
export const tmCaseDetailPath = (workspaceSlug: string, productId: string, caseId: string, projectId?: string | null) =>
  `${tmCaseBasePath(workspaceSlug, productId, projectId)}/cases/${caseId}`;

const normalizePath = (path: string) => path.replace(/\/+$/, "");
const isAt = (pathname: string, base: string, sub = "") => normalizePath(pathname) === normalizePath(`${base}${sub}`);
const isUnder = (pathname: string, base: string, ...subs: string[]) => {
  const current = normalizePath(pathname);
  const root = normalizePath(base);
  return subs.some((sub) => current.startsWith(`${root}${sub}`));
};

// 产品侧：用例库列表（base 本身）/ 用例页 / 评审
export const isTMOverviewActive = (pathname: string, base: string) => isAt(pathname, base);
export const isTMOverviewMenuActive = (pathname: string, base: string) =>
  isAt(pathname, base) || isUnder(pathname, base, "/cases");
export const isTMReviewsActive = (pathname: string, base: string) => isAt(pathname, base, "/reviews");
export const isTMReviewsMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/reviews", "/caseManagementReviewDetail", "/case-review");

// 项目侧：关联产品的用例 / 评审（路径里带产品 id，没带的是待解析的入口页）
const underProjectProduct = (pathname: string, base: string, ...subs: string[]) => {
  const current = normalizePath(pathname);
  const root = normalizePath(base);
  if (!current.startsWith(`${root}/products/`)) return false;
  const rest = current.slice(`${root}/products/`.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return false;
  return subs.some((sub) => rest.slice(slash).startsWith(sub));
};
export const isTMProjectCasesMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/cases") || underProjectProduct(pathname, base, "/cases");
export const isTMProjectReviewsActive = (pathname: string, base: string) => {
  const current = normalizePath(pathname);
  return underProjectProduct(pathname, base, "/reviews") && current.endsWith("/reviews");
};
export const isTMProjectReviewsMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/reviews") ||
  underProjectProduct(pathname, base, "/reviews", "/caseManagementReviewDetail", "/case-review");

// 项目侧：计划 / 执行 / 报告
export const isTMPlansActive = (pathname: string, base: string) => isAt(pathname, base, "/plans");
export const isTMPlansMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/plans", "/plan-cases", "/test-execution");
export const isTMReportsActive = (pathname: string, base: string) => isAt(pathname, base, "/reports");
export const isTMReportsMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/reports", "/report-detail");
