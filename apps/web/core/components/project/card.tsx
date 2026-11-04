/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArchiveRestoreIcon, Settings } from "lucide-react";
// plane imports
import { IS_FAVORITE_MENU_OPEN, PERMISSION_KEYS } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { LinkIcon, NewTabIcon, TrashIcon } from "@plane/propel/icons";
import { setPromiseToast, setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IProject } from "@plane/types";
import type { TContextMenuItem } from "@plane/ui";
import { Avatar, AvatarGroup, ContextMenu, FavoriteStar } from "@plane/ui";
import { copyUrlToClipboard, cn, getFileURL, renderFormattedDate } from "@plane/utils";
// components
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { buildProjectSettingsPath, getPathWithSearch } from "@/components/settings/project/navigation";
import { DeleteProjectModal } from "./delete-project-modal";
import { ArchiveRestoreProjectModal } from "./archive-restore-modal";

type Props = {
  project: IProject;
};

export const ProjectCard = observer(function ProjectCard(props: Props) {
  const { project } = props;
  // states
  const [deleteProjectModalOpen, setDeleteProjectModal] = useState(false);
  const [restoreProject, setRestoreProject] = useState(false);
  // refs
  const projectCardRef = useRef(null);
  // router
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // store hooks
  const { getUserDetails } = useMember();
  const { addProjectToFavorites, removeProjectFromFavorites } = useProject();
  const { isProjectMember, allowProjectPermissionKeys } = useUserPermissions();
  // hooks
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  // derived values
  const projectMembersIds = project.members;
  // auth：能进 = 成员 / 负责人 / 白名单访客（列表接口只返回能看见的项目，所以这里基本都是 true）
  const isMemberOfProject = !!project.is_member || isProjectMember(workspaceSlug?.toString(), project.id);
  // 归档项目的恢复 / 删除：与后端 ProjectArchiveUnarchiveEndpoint / ProjectViewSet.destroy 同一把 key
  const canRestoreProject = allowProjectPermissionKeys(
    [PERMISSION_KEYS.PROJECT_SETTINGS_ARCHIVE],
    workspaceSlug?.toString(),
    project.id
  );
  const canDeleteProject = allowProjectPermissionKeys(
    [PERMISSION_KEYS.PROJECT_SETTINGS_DELETE],
    workspaceSlug?.toString(),
    project.id
  );
  // archive
  const isArchived = !!project.archived_at;
  const workspaceSlugString = workspaceSlug?.toString();
  const currentPath = getPathWithSearch(pathname, searchParams);
  const projectSettingsPath = workspaceSlugString
    ? buildProjectSettingsPath({ workspaceSlug: workspaceSlugString, projectId: project.id, currentPath })
    : "#";
  // local storage
  const { setValue: toggleFavoriteMenu, storedValue: isFavoriteMenuOpen } = useLocalStorage<boolean>(
    IS_FAVORITE_MENU_OPEN,
    false
  );

  const handleAddToFavorites = () => {
    if (!workspaceSlug) return;

    const addToFavoritePromise = addProjectToFavorites(workspaceSlug.toString(), project.id);
    setPromiseToast(addToFavoritePromise, {
      loading: "Adding project to favorites...",
      success: {
        title: "Success!",
        message: () => "Project added to favorites.",
        actionItems: () => {
          if (!isFavoriteMenuOpen) toggleFavoriteMenu(true);
          return <></>;
        },
      },
      error: {
        title: "Error!",
        message: () => "Couldn't add the project to favorites. Please try again.",
      },
    });
  };

  const handleRemoveFromFavorites = () => {
    if (!workspaceSlug) return;

    const removeFromFavoritePromise = removeProjectFromFavorites(workspaceSlug.toString(), project.id);
    setPromiseToast(removeFromFavoritePromise, {
      loading: "Removing project from favorites...",
      success: {
        title: "Success!",
        message: () => "Project removed from favorites.",
      },
      error: {
        title: "Error!",
        message: () => "Couldn't remove the project from favorites. Please try again.",
      },
    });
  };

  const projectLink = `${workspaceSlug}/projects/${project.id}/issues`;
  const handleCopyText = () =>
    copyUrlToClipboard(projectLink).then(() =>
      setToast({
        type: TOAST_TYPE.INFO,
        title: "Link Copied!",
        message: "Project link copied to clipboard.",
      })
    );
  const handleOpenInNewTab = () => window.open(`/${projectLink}`, "_blank");

  const MENU_ITEMS: TContextMenuItem[] = [
    {
      key: "settings",
      action: () => {
        if (workspaceSlugString) router.push(projectSettingsPath);
      },
      title: "Settings",
      icon: Settings,
      shouldRender: !isArchived && isMemberOfProject,
    },
    {
      key: "open-new-tab",
      action: handleOpenInNewTab,
      title: "Open in new tab",
      icon: NewTabIcon,
      shouldRender: !isArchived,
    },
    {
      key: "copy-link",
      action: handleCopyText,
      title: "Copy link",
      icon: LinkIcon,
      shouldRender: !isArchived,
    },
    {
      key: "restore",
      action: () => setRestoreProject(true),
      title: "Restore",
      icon: ArchiveRestoreIcon,
      shouldRender: isArchived && canRestoreProject,
    },
    {
      key: "delete",
      action: () => setDeleteProjectModal(true),
      title: "Delete",
      icon: TrashIcon,
      shouldRender: isArchived && canDeleteProject,
    },
  ];

  return (
    <>
      {/* Delete Project Modal */}
      <DeleteProjectModal
        project={project}
        isOpen={deleteProjectModalOpen}
        onClose={() => setDeleteProjectModal(false)}
      />
      {/* Restore project modal */}
      {workspaceSlug && project && (
        <ArchiveRestoreProjectModal
          workspaceSlug={workspaceSlug.toString()}
          projectId={project.id}
          isOpen={restoreProject}
          onClose={() => setRestoreProject(false)}
          archive={false}
        />
      )}
      <Link
        ref={projectCardRef}
        href={`/${workspaceSlug}/projects/${project.id}/issues`}
        onClick={(e) => {
          if (!isMemberOfProject || isArchived) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        data-prevent-progress={!isMemberOfProject || isArchived}
        className={cn(
          "group/project-card flex w-full flex-col justify-between overflow-hidden rounded-lg border border-subtle bg-layer-2 transition-all duration-300 hover:border-strong hover:shadow-raised-200"
        )}
      >
        <ContextMenu parentRef={projectCardRef} items={MENU_ITEMS} />
        <div className="flex h-[68px] w-full items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-grow items-center gap-2.5">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md border border-subtle bg-layer-1">
              <Logo logo={project.logo_props} size={18} />
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-0.5">
              <h3 className="truncate text-14 font-semibold text-primary">{project.name}</h3>
              <span className="flex items-center gap-1.5">
                <p className="text-11 font-medium text-tertiary">{project.identifier} </p>
              </span>
            </div>
          </div>

          {!isArchived && (
            <div data-prevent-progress className="flex flex-shrink-0 items-center gap-1">
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm text-placeholder hover:bg-layer-1 hover:text-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleCopyText();
                }}
              >
                <LinkIcon className="h-3 w-3" />
              </button>
              <FavoriteStar
                buttonClassName="h-6 w-6 rounded-sm hover:bg-layer-1"
                iconClassName={cn("h-3 w-3", {
                  "text-placeholder": !project.is_favorite,
                })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (project.is_favorite) handleRemoveFromFavorites();
                  else handleAddToFavorites();
                }}
                selected={!!project.is_favorite}
              />
            </div>
          )}
        </div>

        <div className="flex h-[104px] w-full flex-col justify-between rounded-b-sm p-4 pt-0">
          <p className="line-clamp-2 break-words text-13 text-tertiary">
            {project.description && project.description.trim() !== ""
              ? project.description
              : `Created on ${renderFormattedDate(project.created_at)}`}
          </p>
          <div className="item-center flex justify-between">
            <div className="flex items-center justify-center gap-2">
              <Tooltip
                isMobile={isMobile}
                tooltipHeading="Members"
                tooltipContent={
                  project.members && project.members.length > 0 ? `${project.members.length} Members` : "No Member"
                }
                position="top"
              >
                {projectMembersIds && projectMembersIds.length > 0 ? (
                  <div className="flex cursor-pointer items-center gap-2 text-secondary">
                    <AvatarGroup showTooltip={false}>
                      {projectMembersIds.map((memberId) => {
                        const member = getUserDetails(memberId);
                        if (!member) return null;
                        return (
                          <Avatar key={member.id} name={member.display_name} src={getFileURL(member.avatar_url)} />
                        );
                      })}
                    </AvatarGroup>
                  </div>
                ) : (
                  <span className="text-13 text-placeholder italic">No Member Yet</span>
                )}
              </Tooltip>
              {isArchived && (
                <span className="inline-flex items-center rounded border border-subtle bg-surface-1 px-1.5 py-0.5 text-11 font-medium text-placeholder">
                  已归档
                </span>
              )}
            </div>
            {isArchived ? (
              (canRestoreProject || canDeleteProject) && (
                <div className="flex items-center justify-center gap-2">
                  {canRestoreProject && (
                    <div
                      className="flex items-center justify-center text-11 font-medium text-placeholder hover:text-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRestoreProject(true);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <ArchiveRestoreIcon className="h-3.5 w-3.5" />
                        Restore
                      </div>
                    </div>
                  )}
                  {canDeleteProject && (
                    <div
                      className="flex items-center justify-center text-11 font-medium text-placeholder hover:text-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteProjectModal(true);
                      }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              )
            ) : (
              <>
                {isMemberOfProject && (
                  <Link
                    className="flex items-center justify-center rounded-sm p-1 text-placeholder hover:bg-layer-1 hover:text-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    href={projectSettingsPath}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </Link>
    </>
  );
});
