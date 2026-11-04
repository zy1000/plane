/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowLeft } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
// components
import { WorkspaceLogo } from "@/components/workspace/logo";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useWorkspace } from "@/hooks/store/use-workspace";
// plane web imports
import { SubscriptionPill } from "@/plane-web/components/common/subscription/subscription-pill";

const WORKSPACE_KEYS = Object.values(PERMISSION_KEYS).filter((key) => key.startsWith("workspace."));

export const WorkspaceSettingsSidebarHeader = observer(function WorkspaceSettingsSidebarHeader() {
  // router
  const router = useAppRouter();
  // store hooks
  const { workspaceInfoBySlug, isWorkspaceOwner, getWorkspacePermissionKeysByWorkspaceSlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  // derived values：身份说法只是展示，按「所有者 / 工作区 key 全有 / 其他」三档
  const slug = currentWorkspace?.slug ?? "";
  const isMember = Boolean(slug && workspaceInfoBySlug(slug));
  const heldKeys = getWorkspacePermissionKeysByWorkspaceSlug(slug);
  const isAdmin = WORKSPACE_KEYS.every((key) => heldKeys.includes(key));
  const identityLabel = isWorkspaceOwner(slug) ? "所有者" : isAdmin ? "管理员" : "成员";
  // translation
  const { t } = useTranslation();

  if (!isMember) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1 py-3 pr-5 pl-4 text-body-md-medium">
        <IconButton
          variant="ghost"
          size="base"
          icon={ArrowLeft}
          onClick={() => router.push(`/${currentWorkspace?.slug}/`)}
        />
        <p>{t("workspace_settings.label")}</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 px-5 py-0.5">
        <div className="flex items-center gap-2 truncate">
          <WorkspaceLogo
            logo={currentWorkspace?.logo_url}
            name={currentWorkspace?.name}
            classNames="shrink-0 size-8 border border-subtle"
          />
          <div className="truncate">
            <p className="truncate text-body-sm-medium">{currentWorkspace?.name}</p>
            <p className="truncate text-caption-md-regular">{identityLabel}</p>
          </div>
        </div>
        <div className="shrink-0">
          <SubscriptionPill />
        </div>
      </div>
    </div>
  );
});
