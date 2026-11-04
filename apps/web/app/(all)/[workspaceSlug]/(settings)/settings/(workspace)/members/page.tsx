/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// types
import { WORKSPACE_MEMBER_INVITE_PERMISSION_KEY, WORKSPACE_MEMBER_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceBulkInviteFormData } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceMembersFilterBar } from "@/components/workspace/settings/members-filter-bar";
import { WorkspaceMembersList } from "@/components/workspace/settings/members-list";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// plane web components
import { SendWorkspaceInvitationModal, MembersActivityButton } from "@/plane-web/components/workspace/members";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// local imports
import type { Route } from "./+types/page";
import { MembersWorkspaceSettingsHeader } from "./header";

/** 工作区设置 › 成员（效果图「工作区成员」）：搜索 + 角色 / 权限组 / 部门筛选，表格里角色、权限组两列 */
const WorkspaceMembersSettingsPage = observer(function WorkspaceMembersSettingsPage({ params }: Route.ComponentProps) {
  // states
  const [inviteModal, setInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const {
    workspace: { inviteMembersToWorkspace, getFilteredWorkspaceMemberIds, getSearchedWorkspaceMemberIds },
  } = useMember();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  // derived values
  const canViewMembers = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_VIEW_PERMISSION_KEY], workspaceSlug);
  const canInviteMembers = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_INVITE_PERMISSION_KEY], workspaceSlug);
  const resultIds = searchQuery
    ? getSearchedWorkspaceMemberIds(searchQuery)
    : getFilteredWorkspaceMemberIds(workspaceSlug);

  const handleWorkspaceInvite = async (data: IWorkspaceBulkInviteFormData) => {
    try {
      await inviteMembersToWorkspace(workspaceSlug, data);

      setInviteModal(false);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invitations_sent_successfully"),
      });
    } catch (error: unknown) {
      let message = undefined;
      if (error instanceof Error) {
        const err = error as Error & { error?: string };
        message = err.error;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: `${message ?? t("something_went_wrong_please_try_again")}`,
      });

      throw error;
    }
  };

  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 成员` : undefined;

  // if user is not authorized to view this page
  if (workspaceUserInfo && !canViewMembers) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper
      header={
        <MembersWorkspaceSettingsHeader
          actions={
            <>
              <MembersActivityButton workspaceSlug={workspaceSlug} />
              {canInviteMembers && (
                <Button variant="primary" size="lg" onClick={() => setInviteModal(true)}>
                  {t("workspace_settings.settings.members.add_member")}
                </Button>
              )}
            </>
          }
        />
      }
      hugging
    >
      <PageHead title={pageTitle} />
      <SendWorkspaceInvitationModal
        isOpen={inviteModal}
        onClose={() => setInviteModal(false)}
        onSubmit={handleWorkspaceInvite}
      />
      <section
        className={cn("size-full", {
          "opacity-60": !canViewMembers,
        })}
      >
        <div className="pb-3.5">
          <WorkspaceMembersFilterBar
            workspaceSlug={workspaceSlug}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            resultCount={resultIds ? resultIds.length : null}
          />
        </div>
        <WorkspaceMembersList searchQuery={searchQuery} isAdmin={canInviteMembers} />
      </section>
    </SettingsContentWrapper>
  );
});

export default WorkspaceMembersSettingsPage;
