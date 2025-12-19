export const tmProjectBasePath = (workspaceSlug: string, projectId: string) =>
  `/${workspaceSlug}/projects/${projectId}/testhub`;
const normalizePath = (path: string) => path.replace(/\/+$/, "");
export const isTMOverviewActive = (pathname: string, workspaceSlug: string, projectId: string) =>
  normalizePath(pathname) === normalizePath(tmProjectBasePath(workspaceSlug, projectId));
