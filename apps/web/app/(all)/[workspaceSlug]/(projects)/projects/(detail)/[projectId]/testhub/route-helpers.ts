export const tmProjectBasePath = (workspaceSlug: string, projectId: string) =>
  `/${workspaceSlug}/projects/${projectId}/testhub`;
const normalizePath = (path: string) => path.replace(/\/+$/, "");
export const isTMOverviewActive = (pathname: string, workspaceSlug: string, projectId: string) =>
  normalizePath(pathname) === normalizePath(tmProjectBasePath(workspaceSlug, projectId));

export const isTMOverviewMenuActive = (pathname: string, workspaceSlug: string, projectId: string) => {
  const base = normalizePath(tmProjectBasePath(workspaceSlug, projectId));
  const current = normalizePath(pathname);
  return current === base || current.startsWith(`${base}/cases`);
};

export const isTMPlansMenuActive = (pathname: string, workspaceSlug: string, projectId: string) => {
  const base = normalizePath(tmProjectBasePath(workspaceSlug, projectId));
  const current = normalizePath(pathname);
  return current.startsWith(`${base}/plans`) || current.startsWith(`${base}/plan-cases`);
};

export const isTMReviewsMenuActive = (pathname: string, workspaceSlug: string, projectId: string) => {
  const base = normalizePath(tmProjectBasePath(workspaceSlug, projectId));
  const current = normalizePath(pathname);
  return current.startsWith(`${base}/reviews`) || current.startsWith(`${base}/caseManagementReviewDetail`);
};
