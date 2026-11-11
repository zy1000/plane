/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DEFAULT_DATA_DICTIONARY_COLOR, PERMISSION_KEYS } from "@plane/constants";
import type { TJobRoleReference, TJobRoleReferenceDimension } from "@plane/types";

/** 与后端 views/workspace/job_role.py 同一口径：查看看数据字典查看 / 维护，增删改排序看数据字典维护 */
export const JOB_ROLE_READ_KEYS = [
  PERMISSION_KEYS.WORKSPACE_DATA_DICTIONARY_VIEW,
  PERMISSION_KEYS.WORKSPACE_DATA_DICTIONARY_MANAGE,
];
export const JOB_ROLE_MANAGE_KEYS = [PERMISSION_KEYS.WORKSPACE_DATA_DICTIONARY_MANAGE];
/** 在角色上添加 / 移除工作区成员：同成员页编辑角色 */
export const JOB_ROLE_MEMBER_MANAGE_KEYS = [PERMISSION_KEYS.WORKSPACE_MEMBER_MANAGE];

export type TJobRoleTab = "workspace" | "projects" | "references";
export const JOB_ROLE_TABS: TJobRoleTab[] = ["workspace", "projects", "references"];
export const isJobRoleTab = (value: string | null): value is TJobRoleTab =>
  !!value && (JOB_ROLE_TABS as string[]).includes(value);

export const getJobRolesPath = (workspaceSlug: string) => `/${workspaceSlug}/settings/job-roles`;
export const getJobRoleDetailPath = (workspaceSlug: string, roleId: string, tab?: TJobRoleTab) =>
  `/${workspaceSlug}/settings/job-roles/${roleId}${tab ? `?tab=${tab}` : ""}`;

/** 角色页总按颜色显示，没指定颜色按灰 */
export const getJobRoleColor = (role: { color: string }) => role.color || DEFAULT_DATA_DICTIONARY_COLOR;

/** 「8 人」「12 个流转」；0 显示「—」 */
export const formatJobRoleCount = (count: number, unit: string) => (count > 0 ? `${count} ${unit}` : "—");

export const JOB_ROLE_DIMENSION_LABELS: Record<TJobRoleReferenceDimension, string> = {
  initiator: "发起人",
  assignee: "目标负责人",
  approver: "审批人",
};

/** 审批规则只对审批人有意义，其余维度显示「—」 */
export const formatJobRoleApprovalRule = (reference: TJobRoleReference) => {
  if (reference.dimension !== "approver") return "—";
  if (reference.approval_type === "all") return "全部审批人通过";
  if (reference.approval_type === "n_of_m") return `至少 ${reference.required_count ?? 1} 人通过`;
  return "任一审批人通过";
};

/** 类型库的工作流在模板中心维护，项目方案的在项目设置里 */
export const getJobRoleReferencePath = (workspaceSlug: string, reference: TJobRoleReference) =>
  reference.scope.kind === "project" && reference.scope.project_id
    ? `/${workspaceSlug}/settings/projects/${reference.scope.project_id}/workflow`
    : `/${workspaceSlug}/templates/issue-types/workflows/${reference.workflow.id}`;
