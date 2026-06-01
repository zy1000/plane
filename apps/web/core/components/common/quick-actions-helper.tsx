/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CheckCircle2, CirclePlay, XCircle } from "lucide-react";
// types
import type { ICycle, IModule, IProjectView, IRelease, IWorkspaceView } from "@plane/types";
import type { TContextMenuItem } from "@plane/ui";
// hooks
import { useQuickActionsFactory } from "@/plane-web/components/common/quick-actions-factory";

// Types
interface UseCycleMenuItemsProps {
  cycleDetails: ICycle | undefined;
  isEditingAllowed: boolean;
  canEditSprint: boolean;
  canDeleteSprint: boolean;
  canArchiveSprint: boolean;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  handleEdit: () => void;
  handleMarkAsTesting: () => void;
  handleMarkAsCompleted: () => void;
  handleMarkAsCancelled: () => void;
  handleMarkAsInProgress: () => void;
  handleArchive: () => void;
  handleRestore: () => void;
  handleDelete: () => void;
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}

interface UseModuleMenuItemsProps {
  moduleDetails: IModule | undefined;
  isEditingAllowed: boolean;
  canArchiveModule: boolean;
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
  handleEdit: () => void;
  handleArchive: () => void;
  handleRestore: () => void;
  handleDelete: () => void;
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}

interface UseReleaseMenuItemsProps {
  releaseDetails: IRelease | undefined;
  isEditingAllowed: boolean;
  canArchiveRelease: boolean;
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  handleEdit: () => void;
  handleArchive: () => void;
  handleRestore: () => void;
  handleDelete: () => void;
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}

interface UseViewMenuItemsProps {
  isOwner: boolean;
  isAdmin: boolean;
  workspaceSlug: string;
  projectId?: string;
  view: IProjectView | IWorkspaceView;
  handleEdit: () => void;
  handleDelete: () => void;
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}

interface UseLayoutMenuItemsProps {
  workspaceSlug: string;
  projectId: string;
  storeType: "PROJECT" | "EPIC";
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}

type MenuResult = {
  items: TContextMenuItem[];
  modals: JSX.Element | null;
};

export const useCycleMenuItems = (props: UseCycleMenuItemsProps): MenuResult => {
  const factory = useQuickActionsFactory();
  const { cycleDetails, isEditingAllowed, canEditSprint, canDeleteSprint, canArchiveSprint, ...handlers } = props;

  const isArchived = !!cycleDetails?.archived_at;
  const isCompleted = cycleDetails?.status === "completed";
  const cycleStatus = cycleDetails?.status;

  const canMarkTesting = !isArchived && isEditingAllowed && canEditSprint && cycleStatus === "in_progress";
  const canMarkCompleted = !isArchived && isEditingAllowed && canEditSprint && cycleStatus === "testing";
  const canMarkCancelled =
    !isArchived &&
    isEditingAllowed &&
    canEditSprint &&
    (cycleStatus === "not_started" || cycleStatus === "in_progress" || cycleStatus === "testing");
  const canMarkInProgress = false;

  const archiveDisabled = !canArchiveSprint || !isCompleted;
  const archiveDescription = !canArchiveSprint
    ? "您没有归档/恢复迭代的权限"
    : !isCompleted
      ? "Only completed cycles can be archived"
      : undefined;

  const editDisabled = !canEditSprint;
  const editDescription = !canEditSprint ? "您没有编辑迭代的权限" : undefined;
  const deleteDisabled = !canDeleteSprint;
  const deleteDescription = !canDeleteSprint ? "您没有删除迭代的权限" : undefined;

  // Assemble final menu items - order defined here
  const items = [
    factory.createEditMenuItem(handlers.handleEdit, isEditingAllowed && !isCompleted && !isArchived, editDisabled, editDescription),
    factory.createOpenInNewTabMenuItem(handlers.handleOpenInNewTab),
    factory.createCopyLinkMenuItem(handlers.handleCopyLink),
    {
      key: "mark-as-testing",
      title: "标记为测试中",
      icon: CirclePlay,
      action: handlers.handleMarkAsTesting,
      shouldRender: canMarkTesting,
    },
    {
      key: "mark-as-completed",
      title: "标记为已完成",
      icon: CheckCircle2,
      action: handlers.handleMarkAsCompleted,
      shouldRender: canMarkCompleted,
    },
    {
      key: "mark-as-cancelled",
      title: "标记为已取消",
      icon: XCircle,
      action: handlers.handleMarkAsCancelled,
      shouldRender: canMarkCancelled,
    },
    {
      key: "mark-as-in-progress",
      title: "标记为进行中",
      icon: CirclePlay,
      action: handlers.handleMarkAsInProgress,
      shouldRender: canMarkInProgress,
    },
    factory.createArchiveMenuItem(handlers.handleArchive, {
      shouldRender: isEditingAllowed && !isArchived,
      disabled: archiveDisabled,
      description: archiveDescription,
    }),
    factory.createRestoreMenuItem(handlers.handleRestore, isEditingAllowed && isArchived && canArchiveSprint),
    factory.createDeleteMenuItem(handlers.handleDelete, isEditingAllowed && !isCompleted && !isArchived, deleteDisabled, deleteDescription),
  ].filter((item) => item.shouldRender !== false);

  return { items, modals: null };
};

export const useModuleMenuItems = (props: UseModuleMenuItemsProps): MenuResult => {
  const factory = useQuickActionsFactory();
  const { moduleDetails, isEditingAllowed, canArchiveModule, ...handlers } = props;

  const isArchived = !!moduleDetails?.archived_at;
  const moduleState = moduleDetails?.status?.toLocaleLowerCase();
  const isInArchivableGroup = !!moduleState && ["completed", "cancelled"].includes(moduleState);

  const archiveDisabled = !canArchiveModule || !isInArchivableGroup;
  const archiveDescription = !canArchiveModule
    ? "您没有归档模块的权限"
    : !isInArchivableGroup
      ? "Only completed or cancelled modules can be archived"
      : undefined;

  // Assemble final menu items - order defined here
  const items = [
    factory.createEditMenuItem(handlers.handleEdit, isEditingAllowed && !isArchived),
    factory.createOpenInNewTabMenuItem(handlers.handleOpenInNewTab),
    factory.createCopyLinkMenuItem(handlers.handleCopyLink),
    factory.createArchiveMenuItem(handlers.handleArchive, {
      shouldRender: isEditingAllowed && !isArchived,
      disabled: archiveDisabled,
      description: archiveDescription,
    }),
    factory.createRestoreMenuItem(handlers.handleRestore, isEditingAllowed && isArchived && canArchiveModule),
    factory.createDeleteMenuItem(handlers.handleDelete, isEditingAllowed && !isArchived),
  ].filter((item) => item.shouldRender !== false);

  return { items, modals: null };
};

export const useReleaseMenuItems = (props: UseReleaseMenuItemsProps): MenuResult => {
  const factory = useQuickActionsFactory();
  const { releaseDetails, isEditingAllowed, canArchiveRelease, ...handlers } = props;

  const isArchived = !!releaseDetails?.archived_at;
  const releaseState = releaseDetails?.status?.toLocaleLowerCase();
  const isInArchivableGroup = !!releaseState && ["completed", "cancelled"].includes(releaseState);

  const archiveDisabled = !canArchiveRelease || !isInArchivableGroup;
  const archiveDescription = !canArchiveRelease
    ? "您没有归档发布的权限"
    : !isInArchivableGroup
      ? "Only completed or cancelled releases can be archived"
      : undefined;

  const items = [
    factory.createEditMenuItem(handlers.handleEdit, isEditingAllowed && !isArchived),
    factory.createOpenInNewTabMenuItem(handlers.handleOpenInNewTab),
    factory.createCopyLinkMenuItem(handlers.handleCopyLink),
    factory.createArchiveMenuItem(handlers.handleArchive, {
      shouldRender: isEditingAllowed && !isArchived,
      disabled: archiveDisabled,
      description: archiveDescription,
    }),
    factory.createRestoreMenuItem(handlers.handleRestore, isEditingAllowed && isArchived && canArchiveRelease),
    factory.createDeleteMenuItem(handlers.handleDelete, isEditingAllowed && !isArchived),
  ].filter((item) => item.shouldRender !== false);

  return { items, modals: null };
};

export const useViewMenuItems = (props: UseViewMenuItemsProps): MenuResult => {
  const factory = useQuickActionsFactory();
  const { workspaceSlug, isOwner, isAdmin, projectId, view, ...handlers } = props;

  if (!view) return { items: [], modals: null };

  // Assemble final menu items - order defined here
  const items = [
    factory.createEditMenuItem(handlers.handleEdit, isOwner),
    factory.createOpenInNewTabMenuItem(handlers.handleOpenInNewTab),
    factory.createCopyLinkMenuItem(handlers.handleCopyLink),
    factory.createDeleteMenuItem(handlers.handleDelete, isOwner || isAdmin),
  ].filter((item) => item.shouldRender !== false);

  return { items, modals: null };
};

export const useLayoutMenuItems = (props: UseLayoutMenuItemsProps): MenuResult => {
  const factory = useQuickActionsFactory();
  const { ...handlers } = props;

  // Assemble final menu items - order defined here
  const items = [
    factory.createOpenInNewTab(handlers.handleOpenInNewTab),
    factory.createCopyLayoutLinkMenuItem(handlers.handleCopyLink),
  ].filter((item) => item.shouldRender !== false);

  return { items, modals: null };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useIntakeHeaderMenuItems = (props: {
  workspaceSlug: string;
  projectId: string;
  handleCopyLink: () => void;
}): MenuResult => ({ items: [], modals: null });
