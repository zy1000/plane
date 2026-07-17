/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IPermission } from "@plane/types";

export type TPermissionSortScope = "workspace" | "project";
type TSortablePermission = Pick<IPermission, "key" | "name" | "action" | "sort_order" | "module">;

const CATEGORY_ORDER: Record<TPermissionSortScope, string[]> = {
  workspace: [
    "工作区设置",
    "工作区成员",
    "工作区角色模板",
    "工作区用户组",
    "工作区项目",
    "成员画像",
    "工作区分析",
    "工作区",
    "其他",
  ],
  project: [
    "项目设置",
    "项目成员",
    "项目角色",
    "项目用户组授权",
    "项目概览",
    "项目公告",
    "工作项",
    "需求",
    "缺陷",
    "工作项评论",
    "工作项链接",
    "工作项关联",
    "工作项附件",
    "工作项类型",
    "收集",
    "需求收集",
    "迭代",
    "模块",
    "视图",
    "笔记",
    "项目状态",
    "项目标签",
    "项目估算",
    "项目里程碑",
    "发布",
    "工作流",
    "项目资产",
    "测试管理",
    "项目",
    "其他",
  ],
};

const ACTION_ORDER = [
  "view",
  "create",
  "invite",
  "edit",
  "config",
  "mark_default",
  "bind_role",
  "manage",
  "manage_member",
  "manage_role",
  "manage_saved_view",
  "issue_manage",
  "cycle_manage",
  "plan_manage",
  "add",
  "upload",
  "download",
  "import_export",
  "export",
  "archive",
  "unarchive",
  "lock",
  "leave",
  "remove",
  "delete",
];

const PERMISSION_KEY_ORDER = [
  "workspace.settings.view",
  "workspace.settings.edit",
  "workspace.settings.delete",
  "workspace.member.view",
  "workspace.member.invite",
  "workspace.member.edit",
  "workspace.member.remove",
  "workspace.member.leave",
  "workspace.role.view",
  "workspace.role.create",
  "workspace.role.edit",
  "workspace.role.delete",
  "workspace.group.view",
  "workspace.group.create",
  "workspace.group.edit",
  "workspace.group.delete",
  "workspace.group.manage_member",
  "workspace.group.manage_role",
  "workspace.project.view",
  "workspace.project.create",
  "workspace.user_profile.view",
  "workspace.user_profile.export",
  "workspace.analytics.view",
  "workspace.analytics.manage_saved_view",
  "workspace.analytics.export",
  "project.settings.view",
  "project.settings.edit",
  "project.member.view",
  "project.member.invite",
  "project.member.bind_role",
  "project.member.remove",
  "project.member.leave",
  "project.role.view",
  "project.role.create",
  "project.role.edit",
  "project.role.delete",
  "project.group_grant.view",
  "project.group_grant.create",
  "project.group_grant.edit",
  "project.group_grant.delete",
  "project.analytics.view",
  "project.announcement.create",
  "project.announcement.delete",
  "project.work_items.view",
  "project.requirements.view",
  "project.defects.view",
  "issue.import_export",
  "issue.comment.create",
  "issue.comment.edit",
  "issue.comment.delete",
  "issue.link.manage",
  "issue.relation.manage",
  "issue.attachment.download",
  "issue.attachment.upload",
  "issue.attachment.delete",
  "intake.view",
  "intake.create",
  "intake.edit",
  "intake.delete",
  "intake.issue.view",
  "intake.issue.create",
  "intake.issue.edit",
  "intake.issue.delete",
  "intake.description_version.view",
  "sprints.view",
  "sprints.create",
  "sprints.edit",
  "sprints.delete",
  "sprints.archive",
  "sprints.issue.manage",
  "sprints.plan.manage",
  "sprints.file.download",
  "sprints.file.upload",
  "sprints.file.delete",
  "sprints.comment.create",
  "modules.view",
  "modules.create",
  "modules.edit",
  "modules.delete",
  "modules.archive",
  "modules.issue.manage",
  "view.view",
  "view.create",
  "view.edit",
  "view.delete",
  "note.view",
  "note.create",
  "note.edit",
  "note.delete",
  "note.archive",
  "note.lock",
  "note.access.manage",
  "note.version.view",
  "state.view",
  "state.create",
  "state.edit",
  "state.delete",
  "state.mark_default",
  "label.view",
  "label.create",
  "label.edit",
  "label.delete",
  "estimate.view",
  "estimate.create",
  "estimate.edit",
  "estimate.delete",
  "milestone.view",
  "milestone.create",
  "milestone.edit",
  "milestone.delete",
  "milestone.issue.view",
  "milestone.issue.add",
  "milestone.issue.remove",
  "releases.view",
  "releases.create",
  "releases.edit",
  "releases.delete",
  "releases.archive",
  "releases.issue.manage",
  "releases.cycle.manage",
  "releases.plan.manage",
  "releases.file.download",
  "releases.file.upload",
  "releases.file.delete",
  "releases.comment.create",
  "workflow.view",
  "workflow.create",
  "workflow.edit",
  "workflow.delete",
  "workflow.config",
  "project.asset.view",
  "project.asset.upload",
  "project.asset.edit",
  "project.asset.delete",
  "project.asset.download",
  "qa.case.view",
  "qa.case.create",
  "qa.case.edit",
  "qa.case.delete",
  "qa.case.import_export",
  "qa.plan.view",
  "qa.plan.create",
  "qa.plan.edit",
  "qa.plan.delete",
  "qa.review.view",
  "qa.review.create",
  "qa.review.edit",
  "qa.review.delete",
  "qa.report.view",
  "qa.report.create",
  "qa.report.edit",
  "qa.report.delete",
  "qa.report.export",
  "qa.mindmap.view",
  "qa.mindmap.edit",
  "project.archive",
  "project.unarchive",
  "project.delete",
];

const CATEGORY_ORDER_INDEX: Record<TPermissionSortScope, Map<string, number>> = {
  workspace: new Map(CATEGORY_ORDER.workspace.map((category, index) => [category, index])),
  project: new Map(CATEGORY_ORDER.project.map((category, index) => [category, index])),
};
const ACTION_ORDER_INDEX = new Map(ACTION_ORDER.map((action, index) => [action, index]));
const PERMISSION_KEY_ORDER_INDEX = new Map(PERMISSION_KEY_ORDER.map((key, index) => [key, index]));

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

const getCategoryOrder = (scope: TPermissionSortScope, category: string) => {
  const normalizedCategory = category.startsWith("工作项类型 - ") ? "工作项类型" : category;
  return CATEGORY_ORDER_INDEX[scope].get(normalizedCategory) ?? Number.MAX_SAFE_INTEGER;
};

const getPermissionAction = (permission: TSortablePermission) => {
  if (permission.action) return permission.action;

  const keyParts = permission.key.split(".");
  return keyParts[keyParts.length - 1] ?? "";
};

export const comparePermissions = (a: TSortablePermission, b: TSortablePermission) => {
  const keyOrderDiff =
    (PERMISSION_KEY_ORDER_INDEX.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
    (PERMISSION_KEY_ORDER_INDEX.get(b.key) ?? Number.MAX_SAFE_INTEGER);
  if (keyOrderDiff !== 0) return keyOrderDiff;

  const actionOrderDiff =
    (ACTION_ORDER_INDEX.get(getPermissionAction(a)) ?? Number.MAX_SAFE_INTEGER) -
    (ACTION_ORDER_INDEX.get(getPermissionAction(b)) ?? Number.MAX_SAFE_INTEGER);
  if (actionOrderDiff !== 0) return actionOrderDiff;

  const sortOrderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (sortOrderDiff !== 0) return sortOrderDiff;

  const moduleDiff = collator.compare(a.module ?? "", b.module ?? "");
  if (moduleDiff !== 0) return moduleDiff;

  const nameDiff = collator.compare(a.name, b.name);
  if (nameDiff !== 0) return nameDiff;

  return collator.compare(a.key, b.key);
};

export const comparePermissionCategories = (scope: TPermissionSortScope, a: string, b: string) => {
  const categoryOrderDiff = getCategoryOrder(scope, a) - getCategoryOrder(scope, b);
  if (categoryOrderDiff !== 0) return categoryOrderDiff;

  return collator.compare(a, b);
};
