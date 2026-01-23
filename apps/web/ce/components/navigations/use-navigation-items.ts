import { useMemo, useCallback } from "react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { CycleIcon, IntakeIcon, ModuleIcon, PageIcon, TestManagementIcon, ViewsIcon, WorkItemsIcon } from "@plane/propel/icons";
import type { EUserProjectRoles, IPartialProject } from "@plane/types";
import type { TNavigationItem } from "@/components/navigation/tab-navigation-root";
import { Folder, Milestone, Rss } from "lucide-react";

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
};

export const useNavigationItems = ({
  workspaceSlug,
  projectId,
  project,
  allowPermissions,
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
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Sprints",
        href: `/${workspaceSlug}/projects/${projectId}/cycles`,
        icon: CycleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: !!project?.cycle_view,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Releases",
        href: `/${workspaceSlug}/projects/${projectId}/modules`,
        icon: ModuleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: !!project?.module_view,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.milestones",
        key: "milestones",
        name: "里程碑",
        href: `/${workspaceSlug}/projects/${projectId}/milestones`,
        icon: Milestone,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
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
        shouldRender: !!project?.issue_views_view,
        sortOrder: 6,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${workspaceSlug}/projects/${projectId}/pages`,
        icon: PageIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
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
        shouldRender: true,
        sortOrder: 9,
      },
    ],
    [project]
  );

  // Combine, filter, and sort navigation items
  const navigationItems = useMemo(() => {
    const navItems = baseNavigation(workspaceSlug, projectId);

    // Filter by permissions and shouldRender
    const filteredItems = navItems.filter((item) => {
      if (!item.shouldRender) return false;
      const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project?.id ?? "");
      return hasAccess;
    });

    // Sort by sortOrder
    return filteredItems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, baseNavigation, allowPermissions, project?.id]);

  return navigationItems;
};
