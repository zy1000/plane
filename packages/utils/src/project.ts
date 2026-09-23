/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
// plane imports
import type {
  IPartialProject,
  TDevModeFeatureKey,
  TDevModeFeatures,
  TProject,
  TProjectDisplayFilters,
  TProjectFilters,
  TProjectOrderByOptions,
} from "@plane/types";
// local imports
import { getDate } from "./datetime";
import { satisfiesDateFilter } from "./filter";

/**
 * Updates the sort order of the project.
 * @param sortIndex
 * @param destinationIndex
 * @param projectId
 * @returns number | undefined
 */
export const orderJoinedProjects = (
  sourceIndex: number,
  destinationIndex: number,
  currentProjectId: string,
  joinedProjects: TProject[]
): number | undefined => {
  if (!currentProjectId || sourceIndex < 0 || destinationIndex < 0 || joinedProjects.length <= 0) return undefined;

  let updatedSortOrder: number | undefined = undefined;
  const sortOrderDefaultValue = 10000;

  if (destinationIndex === 0) {
    // updating project at the top of the project
    const currentSortOrder = joinedProjects[destinationIndex].sort_order || 0;
    updatedSortOrder = currentSortOrder - sortOrderDefaultValue;
  } else if (destinationIndex === joinedProjects.length) {
    // updating project at the bottom of the project
    const currentSortOrder = joinedProjects[destinationIndex - 1].sort_order || 0;
    updatedSortOrder = currentSortOrder + sortOrderDefaultValue;
  } else {
    // updating project in the middle of the project
    const destinationTopProjectSortOrder = joinedProjects[destinationIndex - 1].sort_order || 0;
    const destinationBottomProjectSortOrder = joinedProjects[destinationIndex].sort_order || 0;
    const updatedValue = (destinationTopProjectSortOrder + destinationBottomProjectSortOrder) / 2;
    updatedSortOrder = updatedValue;
  }

  return updatedSortOrder;
};

/**
 * 研发模式的组件开关 key -> 项目上对应的功能位。
 *
 * 只有 `intake_view` 两边不同名：后端列叫 `intake_view`，序列化给前端的字段是历史拼写
 * `inbox_view`。别把这个拼写扩散出去，要映射就只在这一张表里映射。
 */
export const DEV_MODE_FEATURE_TO_PROJECT_FIELD: Record<TDevModeFeatureKey, keyof IPartialProject> = {
  cycle_view: "cycle_view",
  module_view: "module_view",
  release_view: "release_view",
  issue_views_view: "issue_views_view",
  page_view: "page_view",
  intake_view: "inbox_view",
  is_time_tracking_enabled: "is_time_tracking_enabled",
  is_issue_type_enabled: "is_issue_type_enabled",
  review_view: "review_view",
};

/**
 * 这个组件的研发模式开着吗（也就是「项目允不允许开」）。
 *
 * 模式信息缺失时一律当开：老接口、未加载完的项目对象都不该把整块侧栏藏掉。
 */
export const isDevModeFeatureAllowed = (
  project: IPartialProject | undefined | null,
  featureKey: TDevModeFeatureKey
): boolean => project?.dev_mode_detail?.features?.[featureKey] !== false;

/**
 * 这个组件在项目里要不要显示 = 模式位 AND 项目位。
 *
 * 模式关掉的组件立即隐藏，项目自己那一位原样留着；模式再打开时按它恢复。
 * 侧栏 tab 与项目设置的功能页都走这里，别只读 `project[key]`。
 */
export const isProjectFeatureEnabled = (
  project: IPartialProject | undefined | null,
  featureKey: TDevModeFeatureKey
): boolean => {
  if (!project) return false;
  if (!isDevModeFeatureAllowed(project, featureKey)) return false;
  return Boolean(project[DEV_MODE_FEATURE_TO_PROJECT_FIELD[featureKey]]);
};

/**
 * 按研发模式把提交给后端的功能位收窄一遍。
 *
 * 创建弹窗里已经没有功能开关那一步了，默认值是「全部特性开启」；要是原样提交，
 * 选了 IDOV（迭代关）这类模式就会被后端的上限校验挡下来（400）。提交前过一遍这里，
 * 模式关掉的位一律落 false。
 */
export const clampProjectFeaturesToDevMode = (
  payload: Partial<IPartialProject>,
  features: TDevModeFeatures | undefined | null
): Partial<IPartialProject> => {
  if (!features) return payload;
  const writable = payload as Record<string, unknown>;
  for (const featureKey of Object.keys(DEV_MODE_FEATURE_TO_PROJECT_FIELD) as TDevModeFeatureKey[]) {
    if (features[featureKey] === false) writable[DEV_MODE_FEATURE_TO_PROJECT_FIELD[featureKey]] = false;
  }
  return payload;
};

export const projectIdentifierSanitizer = (identifier: string): string =>
  identifier.replace(/[^ÇŞĞIİÖÜA-Za-z0-9]/g, "");

/**
 * @description filters projects based on the filter
 * @param {TProject} project
 * @param {TProjectFilters} filters
 * @param {TProjectDisplayFilters} displayFilters
 * @returns {boolean}
 */
export const shouldFilterProject = (
  project: TProject,
  displayFilters: TProjectDisplayFilters,
  filters: TProjectFilters
): boolean => {
  let fallsInFilters = true;
  Object.keys(filters).forEach((key) => {
    const filterKey = key as keyof TProjectFilters;
    if (filterKey === "access" && filters.access && filters.access.length > 0)
      fallsInFilters = fallsInFilters && filters.access.includes(`${project.network}`);
    if (filterKey === "lead" && filters.lead && filters.lead.length > 0)
      fallsInFilters = fallsInFilters && filters.lead.includes(`${project.project_lead}`);
    if (filterKey === "members" && filters.members && filters.members.length > 0) {
      const memberIds = project.members;
      fallsInFilters = fallsInFilters && filters.members.some((memberId) => memberIds?.includes(memberId));
    }
    if (filterKey === "created_at" && filters.created_at && filters.created_at.length > 0) {
      const createdDate = getDate(project.created_at);
      filters.created_at.forEach((dateFilter) => {
        fallsInFilters = fallsInFilters && !!createdDate && satisfiesDateFilter(createdDate, dateFilter);
      });
    }
  });
  if (displayFilters.my_projects && !project.member_role) fallsInFilters = false;
  if (displayFilters.archived_projects && !project.archived_at) fallsInFilters = false;
  if (!displayFilters.archived_projects && !displayFilters.show_archived_projects && project.archived_at)
    fallsInFilters = false;

  return fallsInFilters;
};

/**
 * @description orders projects based on the orderByKey
 * @param {TProject[]} projects
 * @param {TProjectOrderByOptions | undefined} orderByKey
 * @returns {TProject[]}
 */
export const orderProjects = (projects: TProject[], orderByKey: TProjectOrderByOptions | undefined): TProject[] => {
  let orderedProjects: TProject[] = [];
  if (projects.length === 0) return orderedProjects;

  if (orderByKey === "sort_order") orderedProjects = sortBy(projects, [(p) => p.sort_order]);
  if (orderByKey === "name") orderedProjects = sortBy(projects, [(p) => p.name.toLowerCase()]);
  if (orderByKey === "-name") orderedProjects = sortBy(projects, [(p) => p.name.toLowerCase()]).reverse();
  if (orderByKey === "created_at") orderedProjects = sortBy(projects, [(p) => p.created_at]);
  if (orderByKey === "-created_at") orderedProjects = sortBy(projects, [(p) => p.created_at ?? ""]).reverse();
  if (orderByKey === "members_length") orderedProjects = sortBy(projects, [(p) => p.members?.length]);
  if (orderByKey === "-members_length") orderedProjects = sortBy(projects, [(p) => p.members?.length]).reverse();

  return orderedProjects;
};
