/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TProjectSettingsItem, TProjectSettingsTabs } from "@plane/types";
// local imports
import { PROJECT_MEMBER_ACCESS } from "../permission-access";

export enum PROJECT_SETTINGS_CATEGORY {
  GENERAL = "general",
  FEATURES = "features",
  WORK_STRUCTURE = "work-structure",
  EXECUTION = "execution",
}

export const PROJECT_SETTINGS_CATEGORIES: PROJECT_SETTINGS_CATEGORY[] = [
  PROJECT_SETTINGS_CATEGORY.GENERAL,
  PROJECT_SETTINGS_CATEGORY.FEATURES,
  PROJECT_SETTINGS_CATEGORY.WORK_STRUCTURE,
  PROJECT_SETTINGS_CATEGORY.EXECUTION,
];

export const PROJECT_SETTINGS: Record<TProjectSettingsTabs, TProjectSettingsItem> = {
  general: {
    key: "general",
    i18n_label: "common.general",
    href: ``,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/`,
  },
  members: {
    key: "members",
    i18n_label: "common.members",
    href: `/members`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.member.manage"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/members/`,
  },
  teams: {
    key: "teams",
    i18n_label: "common.teams",
    href: `/teams`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.member.manage"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/teams/`,
  },
  roles: {
    key: "roles",
    i18n_label: "project_settings.roles.label",
    href: `/permission`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.permission_group.manage"],
    highlight: (pathname: string, baseUrl: string) => pathname.startsWith(`${baseUrl}/permission/`),
  },
  products: {
    key: "products",
    i18n_label: "project_settings.products.label",
    href: `/products`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.product.manage"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/products/`,
  },
  features_cycles: {
    key: "features_cycles",
    i18n_label: "project_settings.features.cycles.short_title",
    href: `/features/cycles`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/cycles/`,
  },
  features_modules: {
    key: "features_modules",
    i18n_label: "project_settings.features.modules.short_title",
    href: `/features/modules`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/modules/`,
  },
  features_releases: {
    key: "features_releases",
    i18n_label: "project_settings.features.releases.short_title",
    href: `/features/releases`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/releases/`,
  },
  features_views: {
    key: "features_views",
    i18n_label: "project_settings.features.views.short_title",
    href: `/features/views`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/views/`,
  },
  features_pages: {
    key: "features_pages",
    i18n_label: "project_settings.features.pages.short_title",
    href: `/features/pages`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/pages/`,
  },
  features_intake: {
    key: "features_intake",
    i18n_label: "project_settings.features.intake.short_title",
    href: `/features/intake`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/intake/`,
  },
  features_reviews: {
    key: "features_reviews",
    i18n_label: "project_settings.features.reviews.short_title",
    href: `/features/reviews`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/reviews/`,
  },
  states: {
    key: "states",
    i18n_label: "common.states",
    href: `/states`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/states/`,
  },
  issue_types: {
    key: "issue_types",
    i18n_label: "project_settings.issue_types.label",
    href: `/issue-types`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.issue_type.manage"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/issue-types/`,
  },
  labels: {
    key: "labels",
    i18n_label: "common.labels",
    href: `/labels`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/labels/`,
  },
  estimates: {
    key: "estimates",
    i18n_label: "common.estimates",
    href: `/estimates`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/estimates/`,
  },
  automations: {
    key: "automations",
    i18n_label: "project_settings.automations.label",
    href: `/automations`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/automations/`,
  },
  workflow: {
    key: "workflow",
    i18n_label: "project_settings.workflow.label",
    href: `/workflow`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/workflow/`,
  },
  pms_sync: {
    key: "pms_sync",
    i18n_label: "project_settings.pms_sync.label",
    href: `/pms-sync`,
    permissionKeys: [PROJECT_MEMBER_ACCESS],
    editPermissionKeys: ["project.settings.edit"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/pms-sync/`,
  },
};

export const PROJECT_SETTINGS_FLAT_MAP: TProjectSettingsItem[] = Object.values(PROJECT_SETTINGS);

export const GROUPED_PROJECT_SETTINGS: Record<PROJECT_SETTINGS_CATEGORY, TProjectSettingsItem[]> = {
  [PROJECT_SETTINGS_CATEGORY.GENERAL]: [
    PROJECT_SETTINGS["general"],
    PROJECT_SETTINGS["members"],
    PROJECT_SETTINGS["teams"],
    PROJECT_SETTINGS["roles"],
    PROJECT_SETTINGS["products"],
  ],
  [PROJECT_SETTINGS_CATEGORY.FEATURES]: [
    PROJECT_SETTINGS["features_cycles"],
    PROJECT_SETTINGS["features_modules"],
    // 顺序照侧栏：发布紧跟模块，评审在最后
    PROJECT_SETTINGS["features_releases"],
    PROJECT_SETTINGS["features_views"],
    PROJECT_SETTINGS["features_pages"],
    PROJECT_SETTINGS["features_intake"],
    PROJECT_SETTINGS["features_reviews"],
  ],
  [PROJECT_SETTINGS_CATEGORY.WORK_STRUCTURE]: [
    PROJECT_SETTINGS["states"],
    PROJECT_SETTINGS["issue_types"],
    PROJECT_SETTINGS["labels"],
    PROJECT_SETTINGS["estimates"],
  ],
  [PROJECT_SETTINGS_CATEGORY.EXECUTION]: [
    PROJECT_SETTINGS["automations"],
    PROJECT_SETTINGS["workflow"],
  ],
};
