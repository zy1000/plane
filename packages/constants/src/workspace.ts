/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TStaticViewTypes, IWorkspaceSearchResults } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";

export const ORGANIZATION_SIZE: string[] = ["Just myself", "2-10", "11-50", "51-200", "201-500", "500+"];

export const RESTRICTED_URLS: string[] = [
  "404",
  "accounts",
  "api",
  "create-workspace",
  "god-mode",
  "installations",
  "invitations",
  "onboarding",
  "profile",
  "spaces",
  "workspace-invitations",
  "password",
  "flags",
  "monitor",
  "monitoring",
  "ingest",
  "plane-pro",
  "plane-ultimate",
  "enterprise",
  "plane-enterprise",
  "disco",
  "silo",
  "chat",
  "calendar",
  "drive",
  "channels",
  "upgrade",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "config",
  "live",
  "admin",
  "m",
  "import",
  "importers",
  "integrations",
  "integration",
  "configuration",
  "initiatives",
  "initiative",
  "config",
  "workflow",
  "workflows",
  "epics",
  "epic",
  "story",
  "mobile",
  "dashboard",
  "desktop",
  "onload",
  "real-time",
  "one",
  "pages",
  "mobile",
  "business",
  "pro",
  "settings",
  "monitor",
  "license",
  "licenses",
  "instances",
  "instance",
];

export const WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY = "workspace.settings.view" as const;
export const WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY = "workspace.settings.edit" as const;
export const WORKSPACE_SETTINGS_DELETE_PERMISSION_KEY = "workspace.settings.delete" as const;
export const WORKSPACE_MEMBER_VIEW_PERMISSION_KEY = "workspace.member.view" as const;
export const WORKSPACE_MEMBER_INVITE_PERMISSION_KEY = "workspace.member.invite" as const;
export const WORKSPACE_MEMBER_EDIT_PERMISSION_KEY = "workspace.member.edit" as const;
export const WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY = "workspace.member.remove" as const;
export const WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY = "workspace.member.leave" as const;
export const WORKSPACE_ROLE_VIEW_PERMISSION_KEY = "workspace.role.view" as const;
export const WORKSPACE_ROLE_CREATE_PERMISSION_KEY = "workspace.role.create" as const;
export const WORKSPACE_ROLE_EDIT_PERMISSION_KEY = "workspace.role.edit" as const;
export const WORKSPACE_ROLE_DELETE_PERMISSION_KEY = "workspace.role.delete" as const;
export const WORKSPACE_GROUP_VIEW_PERMISSION_KEY = "workspace.group.view" as const;
export const WORKSPACE_GROUP_CREATE_PERMISSION_KEY = "workspace.group.create" as const;
export const WORKSPACE_GROUP_EDIT_PERMISSION_KEY = "workspace.group.edit" as const;
export const WORKSPACE_GROUP_DELETE_PERMISSION_KEY = "workspace.group.delete" as const;
export const WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY = "workspace.group.manage_member" as const;
export const WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY = "workspace.group.manage_role" as const;
export const WORKSPACE_PROJECT_VIEW_PERMISSION_KEY = "workspace.project.view" as const;
export const WORKSPACE_PROJECT_CREATE_PERMISSION_KEY = "workspace.project.create" as const;
export const WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY = "workspace.user_profile.view" as const;
export const WORKSPACE_USER_PROFILE_EXPORT_PERMISSION_KEY = "workspace.user_profile.export" as const;
export const WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY = "workspace.analytics.view" as const;
export const WORKSPACE_ANALYTICS_MANAGE_SAVED_VIEW_PERMISSION_KEY = "workspace.analytics.manage_saved_view" as const;
export const WORKSPACE_ANALYTICS_EXPORT_PERMISSION_KEY = "workspace.analytics.export" as const;

export const WORKSPACE_SETTINGS = {
  "my-access": {
    key: "my-access",
    i18n_label: "workspace_settings.settings.my_access.title",
    href: `/settings/my-access`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/my-access/`,
  },
  general: {
    key: "general",
    i18n_label: "workspace_settings.settings.general.title",
    href: `/settings`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    permissionKeys: [WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/`,
  },
  members: {
    key: "members",
    i18n_label: "workspace_settings.settings.members.title",
    href: `/settings/members`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    permissionKeys: [WORKSPACE_MEMBER_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/members/`,
  },
  groups: {
    key: "groups",
    i18n_label: "workspace_settings.settings.groups.title",
    href: `/settings/groups`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    permissionKeys: [WORKSPACE_GROUP_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/groups/`,
  },
  roles: {
    key: "roles",
    i18n_label: "workspace_settings.settings.roles.title",
    href: `/settings/roles`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    permissionKeys: [WORKSPACE_ROLE_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/roles/`,
  },
  templates: {
    key: "templates",
    i18n_label: "workspace_settings.settings.templates.title",
    href: `/settings/templates`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    permissionKeys: [WORKSPACE_ROLE_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/templates/`,
  },
  export: {
    key: "export",
    i18n_label: "workspace_settings.settings.exports.title",
    href: `/settings/exports`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/exports/`,
  },
  webhooks: {
    key: "webhooks",
    i18n_label: "workspace_settings.settings.webhooks.title",
    href: `/settings/webhooks`,
    access: [EUserWorkspaceRoles.ADMIN],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/webhooks/`,
  },
  "issue-type-categories": {
    key: "issue-type-categories",
    i18n_label: "workspace_settings.settings.issue_type_categories.title",
    href: `/settings/issue-type-categories`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/issue-type-categories`),
  },
  "requirement-types": {
    key: "requirement-types",
    i18n_label: "workspace_settings.settings.requirement_types.title",
    href: `/settings/requirement-types`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/requirement-types`),
  },
  "data-dictionaries": {
    key: "data-dictionaries",
    i18n_label: "workspace_settings.settings.data_dictionaries.title",
    href: `/settings/data-dictionaries`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/data-dictionaries`),
  },
  changelog: {
    key: "changelog",
    i18n_label: "更新日志管理",
    href: `/settings/changelog`,
    access: [EUserWorkspaceRoles.ADMIN],
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/changelog/`,
  },
};

export const WORKSPACE_SETTINGS_ACCESS = Object.fromEntries(
  Object.entries(WORKSPACE_SETTINGS).map(([_, { href, access }]) => [href, access])
);

export const WORKSPACE_SETTINGS_LINKS: {
  key: string;
  i18n_label: string;
  href: string;
  access: EUserWorkspaceRoles[];
  permissionKeys?: string[];
  requiresMembership?: boolean;
  highlight: (pathname: string, baseUrl: string) => boolean;
}[] = [
  WORKSPACE_SETTINGS["my-access"],
  WORKSPACE_SETTINGS["general"],
  WORKSPACE_SETTINGS["members"],
  WORKSPACE_SETTINGS["groups"],
  WORKSPACE_SETTINGS["roles"],
  WORKSPACE_SETTINGS["export"],
  WORKSPACE_SETTINGS["webhooks"],
  WORKSPACE_SETTINGS["changelog"],
];

export const ROLE = {
  [EUserWorkspaceRoles.GUEST]: "Guest",
  [EUserWorkspaceRoles.MEMBER]: "Member",
  [EUserWorkspaceRoles.ADMIN]: "Admin",
};

export const ROLE_DETAILS = {
  [EUserWorkspaceRoles.GUEST]: {
    i18n_title: "role_details.guest.title",
    i18n_description: "role_details.guest.description",
  },
  [EUserWorkspaceRoles.MEMBER]: {
    i18n_title: "role_details.member.title",
    i18n_description: "role_details.member.description",
  },
  [EUserWorkspaceRoles.ADMIN]: {
    i18n_title: "role_details.admin.title",
    i18n_description: "role_details.admin.description",
  },
};

export const USER_ROLES = [
  {
    value: "Product / Project Manager",
    i18n_label: "user_roles.product_or_project_manager",
  },
  {
    value: "Development / Engineering",
    i18n_label: "user_roles.development_or_engineering",
  },
  {
    value: "Founder / Executive",
    i18n_label: "user_roles.founder_or_executive",
  },
  {
    value: "Freelancer / Consultant",
    i18n_label: "user_roles.freelancer_or_consultant",
  },
  { value: "Marketing / Growth", i18n_label: "user_roles.marketing_or_growth" },
  {
    value: "Sales / Business Development",
    i18n_label: "user_roles.sales_or_business_development",
  },
  {
    value: "Support / Operations",
    i18n_label: "user_roles.support_or_operations",
  },
  {
    value: "Student / Professor",
    i18n_label: "user_roles.student_or_professor",
  },
  { value: "Human Resources", i18n_label: "user_roles.human_resources" },
  { value: "Other", i18n_label: "user_roles.other" },
];

export const IMPORTERS_LIST = [
  {
    provider: "github",
    type: "import",
    i18n_title: "importer.github.title",
    i18n_description: "importer.github.description",
  },
  {
    provider: "jira",
    type: "import",
    i18n_title: "importer.jira.title",
    i18n_description: "importer.jira.description",
  },
];

export const EXPORTERS_LIST = [
  {
    provider: "csv",
    type: "export",
    i18n_title: "exporter.csv.title",
    i18n_description: "exporter.csv.description",
  },
  {
    provider: "xlsx",
    type: "export",
    i18n_title: "exporter.excel.title",
    i18n_description: "exporter.csv.description",
  },
  {
    provider: "json",
    type: "export",
    i18n_title: "exporter.json.title",
    i18n_description: "exporter.csv.description",
  },
];

export const DEFAULT_GLOBAL_VIEWS_LIST: {
  key: TStaticViewTypes;
  i18n_label: string;
}[] = [
  {
    key: "all-issues",
    i18n_label: "default_global_view.all_issues",
  },
  {
    key: "assigned",
    i18n_label: "default_global_view.assigned",
  },
  {
    key: "created",
    i18n_label: "default_global_view.created",
  },
  {
    key: "subscribed",
    i18n_label: "default_global_view.subscribed",
  },
];

export interface IWorkspaceSidebarNavigationItem {
  key: string;
  labelTranslationKey: string;
  href: string;
  access: EUserWorkspaceRoles[];
  permissionKeys?: string[];
  highlight: (pathname: string, url: string) => boolean;
}

export const WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS: Record<string, IWorkspaceSidebarNavigationItem> = {
  views: {
    key: "views",
    labelTranslationKey: "views",
    href: `/workspace-views/all-issues/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  analytics: {
    key: "analytics",
    labelTranslationKey: "analytics",
    href: `/analytics/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    permissionKeys: [WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  archives: {
    key: "archives",
    labelTranslationKey: "archives",
    href: `/projects/archives/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    permissionKeys: [WORKSPACE_PROJECT_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
};

export const WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS: IWorkspaceSidebarNavigationItem[] = [
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["views"],
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["analytics"],
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["archives"],
];

export const WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS: Record<string, IWorkspaceSidebarNavigationItem> = {
  home: {
    key: "home",
    labelTranslationKey: "home.title",
    href: `/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => pathname === url,
  },
  inbox: {
    key: "inbox",
    labelTranslationKey: "notification.label",
    href: `/notifications/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  "your-work": {
    key: "your_work",
    labelTranslationKey: "your_work",
    href: `/profile/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  stickies: {
    key: "stickies",
    labelTranslationKey: "sidebar.stickies",
    href: `/stickies/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  drafts: {
    key: "drafts",
    labelTranslationKey: "drafts",
    href: `/drafts/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  projects: {
    key: "projects",
    labelTranslationKey: "projects",
    href: `/projects/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    permissionKeys: [WORKSPACE_PROJECT_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, url: string) => {
      const normalizedPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
      if (!normalizedPathname.startsWith(normalizedUrl)) return false;
      return !normalizedPathname.startsWith(`${normalizedUrl}archives/`);
    },
  },
  products: {
    key: "products",
    labelTranslationKey: "products",
    href: `/products/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => {
      const normalizedPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
      return normalizedPathname === normalizedUrl;
    },
  },
  templates: {
    key: "templates",
    labelTranslationKey: "templates",
    /** 点进来的落地页；改这里不影响下面的高亮范围 */
    href: `/templates/libraries/`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    highlight: (pathname: string, url: string) => {
      const normalizedPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
      // 整个 /templates 子树都算命中，与默认落地的是哪个 tab 无关
      const marker = "/templates/";
      const markerIndex = normalizedUrl.indexOf(marker);
      if (markerIndex === -1) return normalizedPathname.startsWith(normalizedUrl);
      return normalizedPathname.startsWith(normalizedUrl.slice(0, markerIndex + marker.length));
    },
  },
};

export const WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS: IWorkspaceSidebarNavigationItem[] = [
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["home"],
];

export const WORKSPACE_SIDEBAR_STATIC_PINNED_NAVIGATION_ITEMS_LINKS: IWorkspaceSidebarNavigationItem[] = [
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["projects"],
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["products"],
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["templates"],
];

export const IS_FAVORITE_MENU_OPEN = "is_favorite_menu_open";
export const WORKSPACE_DEFAULT_SEARCH_RESULT: IWorkspaceSearchResults = {
  results: {
    workspace: [],
    project: [],
    issue: [],
    cycle: [],
    module: [],
    issue_view: [],
    page: [],
  },
};

export const USE_CASES = [
  "Plan and track product roadmaps",
  "Manage engineering sprints",
  "Coordinate cross-functional projects",
  "Replace our current tool",
  "Just exploring",
];
