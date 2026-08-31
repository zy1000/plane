/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useCallback } from "react";
// plane imports
import {
  EUserPermissions,
  EUserPermissionsLevel,
  PROJECT_ARCHIVES_VIEW_PERMISSION_KEYS,
  PROJECT_ASSET_VIEW_PERMISSION_KEY,
  PROJECT_DEFECTS_VIEW_PERMISSION_KEY,
  PROJECT_INTAKE_VIEW_PERMISSION_KEY,
  PROJECT_MILESTONE_VIEW_PERMISSION_KEY,
  PROJECT_MODULES_VIEW_PERMISSION_KEY,
  PROJECT_OVERVIEW_VIEW_PERMISSION_KEY,
  PROJECT_NOTES_VIEW_PERMISSION_KEY,
  PROJECT_QA_VIEW_PERMISSION_KEYS,
  PROJECT_RELEASES_VIEW_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY,
  PROJECT_SPRINTS_VIEW_PERMISSION_KEY,
  PROJECT_VIEWS_VIEW_PERMISSION_KEY,
  PROJECT_WORK_ITEMS_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import {
  CycleIcon,
  IntakeIcon,
  ModuleIcon,
  PageIcon,
  RequirementIcon,
  TestManagementIcon,
  ViewsIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
import type { EUserProjectRoles, IPartialProject } from "@plane/types";
import type { TNavigationItem } from "@/components/navigation/tab-navigation-root";
import { ArchiveIcon, Bug, Folder, Milestone, Rocket, Rss } from "lucide-react";

type UseNavigationItemsProps = {
  workspaceSlug: string;
  projectId: string;
  project?: IPartialProject;
  allowPermissions: (
    access: EUserPermissions[] | EUserProjectRoles[],
    level: EUserPermissionsLevel,
    workspaceSlug: string,
    projectId: string
  ) => boolean;
  allowProjectPermissionKeys: (permissionKeys: string[], workspaceSlug: string, projectId: string) => boolean;
};

export const useNavigationItems = ({
  workspaceSlug,
  projectId,
  project,
  allowPermissions,
  allowProjectPermissionKeys,
}: UseNavigationItemsProps): TNavigationItem[] => {
  // Base navigation items
  const baseNavigation = useCallback(
    (workspaceSlug: string, projectId: string): TNavigationItem[] => [
      {
        i18n_key: "sidebar.overview",
        key: "overview",
        name: "Overview",
        href: `/${workspaceSlug}/projects/${projectId}/overview`,
        icon: Rss,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_OVERVIEW_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 0,
      },
      {
        i18n_key: "sidebar.work_items",
        key: "work_items",
        name: "Work items",
        href: `/${workspaceSlug}/projects/${projectId}/issues`,
        icon: WorkItemsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_WORK_ITEMS_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.requirements",
        key: "requirements",
        name: "需求",
        href: `/${workspaceSlug}/projects/${projectId}/requirements`,
        icon: RequirementIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 1.2,
      },
      {
        i18n_key: "sidebar.defects",
        key: "defects",
        name: "缺陷",
        href: `/${workspaceSlug}/projects/${projectId}/defects`,
        icon: Bug,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_DEFECTS_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 1.6,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Sprints",
        href: `/${workspaceSlug}/projects/${projectId}/cycles`,
        icon: CycleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        permissionKeys: [PROJECT_SPRINTS_VIEW_PERMISSION_KEY],
        shouldRender: !!project?.cycle_view,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Modules",
        href: `/${workspaceSlug}/projects/${projectId}/modules`,
        icon: ModuleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_MODULES_VIEW_PERMISSION_KEY],
        shouldRender: !!project?.module_view,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.releases",
        key: "releases",
        name: "Releases",
        href: `/${workspaceSlug}/projects/${projectId}/releases`,
        icon: Rocket,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_RELEASES_VIEW_PERMISSION_KEY],
        shouldRender: !!project?.module_view,
        sortOrder: 3.5,
      },
      {
        i18n_key: "sidebar.milestones",
        key: "milestones",
        name: "里程碑",
        href: `/${workspaceSlug}/projects/${projectId}/milestones`,
        icon: Milestone,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        permissionKeys: [PROJECT_MILESTONE_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 4,
      },
      {
        i18n_key: "test_management",
        key: "testhub",
        name: "测试",
        href: `/${workspaceSlug}/projects/${projectId}/testhub`,
        icon: TestManagementIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        permissionKeys: [...PROJECT_QA_VIEW_PERMISSION_KEYS],
        shouldRender: true,
        sortOrder: 5,
      },
      {
        i18n_key: "sidebar.views",
        key: "views",
        name: "Views",
        href: `/${workspaceSlug}/projects/${projectId}/views`,
        icon: ViewsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_VIEWS_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 6,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${workspaceSlug}/projects/${projectId}/pages`,
        icon: PageIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_NOTES_VIEW_PERMISSION_KEY],
        shouldRender: !!project?.page_view,
        sortOrder: 7,
      },
      {
        i18n_key: "sidebar.intake",
        key: "intake",
        name: "Intake",
        href: `/${workspaceSlug}/projects/${projectId}/intake`,
        icon: IntakeIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        permissionKeys: [PROJECT_INTAKE_VIEW_PERMISSION_KEY],
        shouldRender: !!project?.inbox_view,
        sortOrder: 8,
      },
      {
        i18n_key: "sidebar.filestore",
        key: "filestore",
        name: "文件",
        href: `/${workspaceSlug}/projects/${projectId}/filestore`,
        icon: Folder,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        permissionKeys: [PROJECT_ASSET_VIEW_PERMISSION_KEY],
        shouldRender: true,
        sortOrder: 9,
      },
      {
        i18n_key: "archives",
        key: "archives",
        name: "归档",
        href: `/${workspaceSlug}/projects/${projectId}/archives/issues`,
        icon: ArchiveIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        permissionKeys: [...PROJECT_ARCHIVES_VIEW_PERMISSION_KEYS],
        shouldRender: true,
        sortOrder: 9.5,
      },
    ],
    [project]
  );

  // Filter/sort 必须在 render 阶段执行，避免 useMemo 屏蔽 MobX 对
  // permission_keys、project.cycle_view / module_view / page_view / inbox_view 等 observable 的订阅。
  // 否则接口返回后 store 已更新，但 useMemo 依赖未变，会一直返回"残缺菜单"。
  const filteredItems = baseNavigation(workspaceSlug, projectId)
    .filter((item) => {
      if (!item.shouldRender) return false;
      const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project?.id ?? "");
      if (!hasAccess) return false;
      if (item.permissionKeys?.length) {
        return allowProjectPermissionKeys(item.permissionKeys, workspaceSlug, project?.id ?? "");
      }
      return true;
    })
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // 用 workspace + project + tab key 列表做内容指纹，只在菜单实际变化时换引用，
  // 避免下游 useEffect / useMemo（如默认 tab 跳转）因为新数组引用无谓抖动。
  // 必须包含 projectId：否则切换项目后 stableKey 不变，href 仍指向上一项目（如缺陷页跳错项目）。
  const stableKey = `${workspaceSlug}:${projectId}:${filteredItems.map((i) => i.key).join("|")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const navigationItems = useMemo(() => filteredItems, [stableKey]);

  return navigationItems;
};
