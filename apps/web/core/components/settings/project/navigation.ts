/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const PROJECT_SETTINGS_RETURN_TO_PARAM = "returnTo";

export const getPathWithSearch = (pathname: string, searchParams?: URLSearchParams): string => {
  const search = searchParams?.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
};

export const buildProjectSettingsPath = (params: {
  currentPath?: string;
  projectId: string;
  settingsPath?: string;
  workspaceSlug: string;
}): string => {
  const { currentPath, projectId, settingsPath = "", workspaceSlug } = params;
  const basePath = `/${workspaceSlug}/settings/projects/${projectId}${settingsPath}`;
  const normalizedPath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!currentPath) return normalizedPath;

  const searchParams = new URLSearchParams({
    [PROJECT_SETTINGS_RETURN_TO_PARAM]: currentPath,
  });
  return `${normalizedPath}?${searchParams.toString()}`;
};

export const getProjectSettingsReturnPath = (params: {
  projectId: string;
  returnTo: string | null;
  workspaceSlug?: string;
}): string => {
  const { projectId, returnTo, workspaceSlug } = params;
  const fallbackPath = workspaceSlug ? `/${workspaceSlug}/projects/${projectId}/issues/` : "/";
  if (!workspaceSlug || !returnTo) return fallbackPath;

  const workspacePathPrefix = `/${workspaceSlug}/`;
  const projectSettingsPathPrefix = `/${workspaceSlug}/settings/projects/`;
  if (!returnTo.startsWith(workspacePathPrefix)) return fallbackPath;
  if (returnTo.startsWith(projectSettingsPathPrefix)) return fallbackPath;

  return returnTo;
};
