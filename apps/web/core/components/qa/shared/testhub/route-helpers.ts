// 测试管理分两处：用例 / 用例库 / 用例评审在产品下，测试计划 / 测试报告在项目下（2026-11）
export type TTestHubScopeKind = "project" | "product";

export const tmProjectBasePath = (workspaceSlug: string, projectId: string) =>
  `/${workspaceSlug}/projects/${projectId}/testhub`;

export const tmProductBasePath = (workspaceSlug: string, productId: string) =>
  `/${workspaceSlug}/products/${productId}/testhub`;

export const tmBasePath = (workspaceSlug: string, kind: TTestHubScopeKind, id: string) =>
  kind === "product" ? tmProductBasePath(workspaceSlug, id) : tmProjectBasePath(workspaceSlug, id);

/** 产品下某条用例的详情页 */
export const tmCaseDetailPath = (workspaceSlug: string, productId: string, caseId: string) =>
  `${tmProductBasePath(workspaceSlug, productId)}/cases/${caseId}`;

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

// 项目侧：计划 / 执行 / 报告
export const isTMPlansActive = (pathname: string, base: string) => isAt(pathname, base, "/plans");
export const isTMPlansMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/plans", "/plan-cases", "/test-execution");
export const isTMReportsActive = (pathname: string, base: string) => isAt(pathname, base, "/reports");
export const isTMReportsMenuActive = (pathname: string, base: string) =>
  isUnder(pathname, base, "/reports", "/report-detail");
