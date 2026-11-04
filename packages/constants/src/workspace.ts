/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { WORKSPACE_MEMBER_ACCESS, WORKSPACE_OWNER_ACCESS } from "./permission-access";
import { PERMISSION_KEYS } from "./permission-keys.generated";
import type { TStaticViewTypes, IWorkspaceSearchResults } from "@plane/types";

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

export const WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY = WORKSPACE_MEMBER_ACCESS;
export const WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY = "workspace.settings.edit" as const;
export const WORKSPACE_SETTINGS_DELETE_PERMISSION_KEY = WORKSPACE_OWNER_ACCESS;
export const WORKSPACE_MEMBER_VIEW_PERMISSION_KEY = "workspace.member.view" as const;
export const WORKSPACE_MEMBER_INVITE_PERMISSION_KEY = "workspace.member.manage" as const;
export const WORKSPACE_MEMBER_EDIT_PERMISSION_KEY = "workspace.member.manage" as const;
export const WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY = "workspace.member.manage" as const;
export const WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY = WORKSPACE_MEMBER_ACCESS;
export const WORKSPACE_ROLE_VIEW_PERMISSION_KEY = "workspace.permission_group.view" as const;
export const WORKSPACE_ROLE_CREATE_PERMISSION_KEY = "workspace.permission_group.manage" as const;
export const WORKSPACE_ROLE_EDIT_PERMISSION_KEY = "workspace.permission_group.manage" as const;
export const WORKSPACE_ROLE_DELETE_PERMISSION_KEY = "workspace.permission_group.manage" as const;
export const WORKSPACE_GROUP_VIEW_PERMISSION_KEY = WORKSPACE_MEMBER_ACCESS;
export const WORKSPACE_GROUP_CREATE_PERMISSION_KEY = "workspace.team.manage" as const;
export const WORKSPACE_GROUP_EDIT_PERMISSION_KEY = "workspace.team.manage" as const;
export const WORKSPACE_GROUP_DELETE_PERMISSION_KEY = "workspace.team.manage" as const;
export const WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY = "workspace.team.manage" as const;
export const WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY = "workspace.permission_group.manage" as const;
export const WORKSPACE_PROJECT_VIEW_PERMISSION_KEY = WORKSPACE_MEMBER_ACCESS;
export const WORKSPACE_PROJECT_CREATE_PERMISSION_KEY = "workspace.project.create" as const;
export const WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY = "workspace.member.view" as const;
export const WORKSPACE_USER_PROFILE_EXPORT_PERMISSION_KEY = "workspace.member.view" as const;
export const WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY = "workspace.analytics.view" as const;
export const WORKSPACE_ANALYTICS_MANAGE_SAVED_VIEW_PERMISSION_KEY = "workspace.analytics.view" as const;
export const WORKSPACE_ANALYTICS_EXPORT_PERMISSION_KEY = "workspace.analytics.view" as const;
// 模板中心：需求标准库 + 用例模板库 + 评审模板库（与后端 plane/app/permissions/keys.py 的同名段一致）
export const WORKSPACE_REQUIREMENT_LIBRARY_VIEW_PERMISSION_KEY = "workspace.requirement_library.view" as const;
export const WORKSPACE_REQUIREMENT_LIBRARY_MANAGE_PERMISSION_KEY = "workspace.requirement_library.manage" as const;
export const WORKSPACE_REQUIREMENT_LIBRARY_IMPORT_EXPORT_PERMISSION_KEY =
  "workspace.requirement_library.manage" as const;
export const WORKSPACE_CASE_TEMPLATE_VIEW_PERMISSION_KEY = "workspace.case_template.view" as const;
export const WORKSPACE_CASE_TEMPLATE_MANAGE_PERMISSION_KEY = "workspace.case_template.manage" as const;
export const WORKSPACE_CASE_TEMPLATE_IMPORT_EXPORT_PERMISSION_KEY =
  "workspace.case_template.manage" as const;
export const WORKSPACE_REVIEW_TEMPLATE_VIEW_PERMISSION_KEY = "workspace.review_template.view" as const;
export const WORKSPACE_REVIEW_TEMPLATE_MANAGE_PERMISSION_KEY = "workspace.review_template.manage" as const;
export const WORKSPACE_DEV_MODE_VIEW_PERMISSION_KEY = "workspace.dev_mode.view" as const;
export const WORKSPACE_DEV_MODE_MANAGE_PERMISSION_KEY = "workspace.dev_mode.manage" as const;

/** 读标准库：查看或维护任一即可（后端 LIBRARY_READ_KEYS 的对应物） */
export const WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS = [
  WORKSPACE_REQUIREMENT_LIBRARY_VIEW_PERMISSION_KEY,
  WORKSPACE_REQUIREMENT_LIBRARY_MANAGE_PERMISSION_KEY,
];

/** 读用例模板库：查看或维护任一即可 */
export const WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS = [
  WORKSPACE_CASE_TEMPLATE_VIEW_PERMISSION_KEY,
  WORKSPACE_CASE_TEMPLATE_MANAGE_PERMISSION_KEY,
];

/** 读评审模板库：查看或维护任一即可（评审模板库没有导入导出，只有两个 key） */
export const WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS = [
  WORKSPACE_REVIEW_TEMPLATE_VIEW_PERMISSION_KEY,
  WORKSPACE_REVIEW_TEMPLATE_MANAGE_PERMISSION_KEY,
];

/** 读研发模式：查看或维护任一即可 */
export const WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS = [
  WORKSPACE_DEV_MODE_VIEW_PERMISSION_KEY,
  WORKSPACE_DEV_MODE_MANAGE_PERMISSION_KEY,
];

/** 模板中心入口：四个页签任一能看就显示 */
export const WORKSPACE_TEMPLATE_CENTER_PERMISSION_KEYS = [
  ...WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS,
  ...WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS,
  ...WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS,
  ...WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS,
];

export const WORKSPACE_SETTINGS = {
  "my-access": {
    key: "my-access",
    i18n_label: "workspace_settings.settings.my_access.title",
    href: `/settings/my-access`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/my-access/`,
  },
  general: {
    key: "general",
    i18n_label: "workspace_settings.settings.general.title",
    href: `/settings`,
    permissionKeys: [WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/`,
  },
  members: {
    key: "members",
    i18n_label: "workspace_settings.settings.members.title",
    href: `/settings/members`,
    permissionKeys: [WORKSPACE_MEMBER_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/members/`,
  },
  groups: {
    key: "groups",
    i18n_label: "workspace_settings.settings.groups.title",
    href: `/settings/groups`,
    permissionKeys: [WORKSPACE_GROUP_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/groups/`,
  },
  roles: {
    key: "roles",
    i18n_label: "workspace_settings.settings.roles.title",
    href: `/settings/permission`,
    // 权限组列表与详情（/settings/permission/<id>/）；成员管理员要给人分配权限组，也能看
    permissionKeys: [WORKSPACE_ROLE_VIEW_PERMISSION_KEY, WORKSPACE_ROLE_EDIT_PERMISSION_KEY, WORKSPACE_MEMBER_EDIT_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/permission/`),
  },
  // 旧地址：项目权限组模板已并进「权限组」页的第二个页签，不再出现在侧栏，只为旧链接保留鉴权
  templates: {
    key: "templates",
    i18n_label: "workspace_settings.settings.templates.title",
    href: `/settings/templates`,
    permissionKeys: [WORKSPACE_ROLE_VIEW_PERMISSION_KEY, WORKSPACE_ROLE_EDIT_PERMISSION_KEY, WORKSPACE_MEMBER_EDIT_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/templates/`,
  },
  export: {
    key: "export",
    i18n_label: "workspace_settings.settings.exports.title",
    href: `/settings/exports`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/exports/`,
  },
  webhooks: {
    key: "webhooks",
    i18n_label: "workspace_settings.settings.webhooks.title",
    href: `/settings/webhooks`,
    // 原来只给整数管理员看，现在按 key：与后端 webhook 接口同一把
    permissionKeys: [PERMISSION_KEYS.WORKSPACE_WEBHOOK_MANAGE],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/webhooks/`,
  },
  departments: {
    key: "departments",
    i18n_label: "workspace_settings.settings.departments.title",
    href: `/settings/departments`,
    // 与后端 GET departments 的权限 key 一致；「立即同步」另看 WORKSPACE_SETTINGS_EDIT
    permissionKeys: [WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/departments`),
  },
  integrations: {
    key: "integrations",
    i18n_label: "workspace_settings.settings.integrations.title",
    href: `/settings/integrations`,
    // 与后端 GET external-integrations 的权限 key 一致；「立即同步」另看 WORKSPACE_SETTINGS_EDIT
    permissionKeys: [WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/integrations`),
  },
  "issue-type-categories": {
    key: "issue-type-categories",
    i18n_label: "workspace_settings.settings.issue_type_categories.title",
    href: `/settings/issue-type-categories`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/issue-type-categories`),
  },
  "requirement-types": {
    key: "requirement-types",
    i18n_label: "workspace_settings.settings.requirement_types.title",
    href: `/settings/requirement-types`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/requirement-types`),
  },
  "data-dictionaries": {
    key: "data-dictionaries",
    i18n_label: "workspace_settings.settings.data_dictionaries.title",
    href: `/settings/data-dictionaries`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/data-dictionaries`),
  },
  "stage-types": {
    key: "stage-types",
    i18n_label: "workspace_settings.settings.stage_types.title",
    href: `/settings/stage-types`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/settings/stage-types`),
  },
  changelog: {
    key: "changelog",
    i18n_label: "更新日志管理",
    href: `/settings/changelog`,
    requiresMembership: true,
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/changelog/`,
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
  permissionKeys?: string[];
  highlight: (pathname: string, url: string) => boolean;
}

export const WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS: Record<string, IWorkspaceSidebarNavigationItem> = {
  views: {
    key: "views",
    labelTranslationKey: "views",
    href: `/workspace-views/all-issues/`,
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  analytics: {
    key: "analytics",
    labelTranslationKey: "analytics",
    href: `/analytics/`,
    permissionKeys: [WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY],
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  archives: {
    key: "archives",
    labelTranslationKey: "archives",
    href: `/projects/archives/`,
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
    highlight: (pathname: string, url: string) => pathname === url,
  },
  inbox: {
    key: "inbox",
    labelTranslationKey: "notification.label",
    href: `/notifications/`,
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  "your-work": {
    key: "your_work",
    labelTranslationKey: "your_work",
    href: `/profile/`,
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  stickies: {
    key: "stickies",
    labelTranslationKey: "sidebar.stickies",
    href: `/stickies/`,
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  drafts: {
    key: "drafts",
    labelTranslationKey: "drafts",
    href: `/drafts/`,
    highlight: (pathname: string, url: string) => pathname.includes(url),
  },
  projects: {
    key: "projects",
    labelTranslationKey: "projects",
    href: `/projects/`,
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
    permissionKeys: WORKSPACE_TEMPLATE_CENTER_PERMISSION_KEYS,
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
