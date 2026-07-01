/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { MoreHorizontal } from "lucide-react";
import {
  PROJECT_RELEASES_ARCHIVE_PERMISSION_KEY,
  PROJECT_RELEASES_DELETE_PERMISSION_KEY,
  PROJECT_RELEASES_EDIT_PERMISSION_KEY,
} from "@plane/constants";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu, CustomMenu } from "@plane/ui";
import { copyUrlToClipboard, cn } from "@plane/utils";
import { useReleaseMenuItems } from "@/components/common/quick-actions-helper";
import { ArchiveReleaseModal } from "@/components/releases/archive-release-modal";
import { CreateUpdateReleaseModal } from "@/components/releases/create-update-release-modal";
import { DeleteReleaseModal } from "@/components/releases/delete-release-modal";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  parentRef: React.RefObject<HTMLDivElement>;
  releaseId: string;
  projectId: string;
  workspaceSlug: string;
  customClassName?: string;
};

export const ReleaseQuickActions = observer(function ReleaseQuickActions(props: Props) {
  const { parentRef, releaseId, projectId, workspaceSlug, customClassName } = props;
  const router = useAppRouter();
  const [editModal, setEditModal] = useState(false);
  const [archiveModal, setArchiveModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { getReleaseById, restoreRelease } = useRelease();

  const releaseDetails = getReleaseById(releaseId);
  const isArchived = !!releaseDetails?.archived_at;
  const canEditRelease = allowProjectPermissionKeys([PROJECT_RELEASES_EDIT_PERMISSION_KEY], workspaceSlug, projectId);
  const canDeleteRelease = allowProjectPermissionKeys(
    [PROJECT_RELEASES_DELETE_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );
  const canArchiveRelease = allowProjectPermissionKeys(
    [PROJECT_RELEASES_ARCHIVE_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  const releaseLink = `${workspaceSlug}/projects/${projectId}/releases/${releaseId}/overview`;
  const handleCopyText = () =>
    copyUrlToClipboard(releaseLink).then(() => {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Link Copied!",
        message: "Release link copied to clipboard.",
      });
    });
  const handleOpenInNewTab = () => window.open(`/${releaseLink}`, "_blank");

  const handleRestoreRelease = async () => {
    if (!canArchiveRelease || !isArchived) return;
    try {
      await restoreRelease(workspaceSlug, projectId, releaseId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Restore success",
        message: "Your release can be found in project releases.",
      });
      router.push(`/${workspaceSlug}/projects/${projectId}/releases`);
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Release could not be restored. Please try again.",
      });
    }
  };

  const menuResult = useReleaseMenuItems({
    releaseDetails: releaseDetails ?? undefined,
    workspaceSlug,
    projectId,
    releaseId,
    canEditRelease,
    canDeleteRelease,
    canArchiveRelease,
    handleEdit: () => {
      if (!canEditRelease || isArchived) return;
      setEditModal(true);
    },
    handleArchive: () => {
      if (!canArchiveRelease || isArchived) return;
      setArchiveModal(true);
    },
    handleRestore: handleRestoreRelease,
    handleDelete: () => {
      if (!canDeleteRelease || isArchived) return;
      setDeleteModal(true);
    },
    handleCopyLink: handleCopyText,
    handleOpenInNewTab,
  });

  const MENU_ITEMS: TContextMenuItem[] = Array.isArray(menuResult) ? menuResult : menuResult.items;
  const additionalModals = Array.isArray(menuResult) ? null : menuResult.modals;

  const CONTEXT_MENU_ITEMS = MENU_ITEMS.map(function mapContext(item) {
    return {
      ...item,
      onClick: () => {
        item.action();
      },
    };
  });

  return (
    <>
      {releaseDetails && (
        <div className="fixed">
          <CreateUpdateReleaseModal
            isOpen={editModal}
            onClose={() => setEditModal(false)}
            data={releaseDetails}
            projectId={projectId}
            workspaceSlug={workspaceSlug}
          />
          <ArchiveReleaseModal
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            releaseId={releaseId}
            isOpen={archiveModal}
            handleClose={() => setArchiveModal(false)}
          />
          <DeleteReleaseModal data={releaseDetails} isOpen={deleteModal} onClose={() => setDeleteModal(false)} />
          {additionalModals}
        </div>
      )}
      <ContextMenu parentRef={parentRef} items={CONTEXT_MENU_ITEMS} />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
        buttonClassName={customClassName}
      >
        {MENU_ITEMS.map((item) => {
          if (item.shouldRender === false) return null;
          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action();
              }}
              className={cn(
                "flex items-center gap-2",
                {
                  "text-placeholder": item.disabled,
                },
                item.className
              )}
              disabled={item.disabled}
            >
              {item.icon && <item.icon className={cn("h-3 w-3 flex-shrink-0", item.iconClassName)} />}
              <div>
                <h5>{item.title}</h5>
                {item.description && (
                  <p
                    className={cn("whitespace-pre-line text-tertiary", {
                      "text-placeholder": item.disabled,
                    })}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
