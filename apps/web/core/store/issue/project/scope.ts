/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectIssueScope = "issues" | "requirements" | "defects";

export const DEFAULT_PROJECT_ISSUE_SCOPE: TProjectIssueScope = "issues";

export const getProjectIssueScopeKey = (
  projectId: string,
  scope: TProjectIssueScope = DEFAULT_PROJECT_ISSUE_SCOPE
): string => `${projectId}__${scope}`;

export const getProjectIssueScopeFromPathname = (pathname: string | null | undefined): TProjectIssueScope => {
  if (pathname?.includes("/requirements")) return "requirements";
  if (pathname?.includes("/defects")) return "defects";
  return DEFAULT_PROJECT_ISSUE_SCOPE;
};
