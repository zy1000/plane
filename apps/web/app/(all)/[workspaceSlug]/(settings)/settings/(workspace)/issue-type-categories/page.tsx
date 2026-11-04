/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { IssueTypeCategoriesList } from "@/components/workspace/settings/issue-type-categories/issue-type-categories-list";
// hooks
import { useIssueTypeCategories } from "@/hooks/store/use-issue-type-categories";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { IssueTypeCategoriesWorkspaceSettingsHeader } from "./header";

const WorkspaceIssueTypeCategoriesPage = observer(function WorkspaceIssueTypeCategoriesPage({
  params,
}: Route.ComponentProps) {
  const { workspaceSlug } = params;

  const { workspaceUserInfo, isWorkspaceMember, allowWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 读 = 工作区成员，写 = workspace.issue_scheme.manage（后端 WorkspaceIssueSchemeConfigPermission）
  const isAdmin = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_ISSUE_SCHEME_MANAGE], workspaceSlug);
  const canView = isWorkspaceMember(workspaceSlug);

  const { categories, isLoading, fetchCategories, createCategory, updateCategory, deleteCategory } =
    useIssueTypeCategories(workspaceSlug);

  useSWR(canView ? `WORKSPACE_ISSUE_TYPE_CATEGORIES_${workspaceSlug}` : null, canView ? fetchCategories : null);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 工作项类别` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypeCategoriesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <IssueTypeCategoriesList
        categories={categories}
        isLoading={isLoading}
        isAdmin={isAdmin}
        onCreate={createCategory}
        onUpdate={updateCategory}
        onDelete={deleteCategory}
      />
    </SettingsContentWrapper>
  );
});

export default WorkspaceIssueTypeCategoriesPage;
