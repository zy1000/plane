/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 个人主页「我的工作」：待处理 / 已处理 / 我发起的 三个视图共用的行形状与设置。
 * 与后端 `plane/utils/user_work.py` 一一对应；行是异构的，按 `type` 决定图标与专属列。
 */

export const USER_WORK_TYPES = [
  "review",
  "review_activity",
  "tailoring_approval",
  "issue_approval",
  "requirement_change",
  "work_item",
  "defect",
  "requirement",
  "case_execution",
  "case_review",
  "plan_review",
] as const;

export type TUserWorkType = (typeof USER_WORK_TYPES)[number];

export const USER_WORK_INITIATED_TYPES: TUserWorkType[] = [
  "work_item",
  "defect",
  "requirement",
  "requirement_change",
  "issue_approval",
  "tailoring_approval",
];

export type TUserWorkOwner = {
  kind: "project" | "product";
  id: string;
  name: string;
  identifier: string | null;
};

export type TUserWorkStatus = {
  key: string | null;
  label: string | null;
  color: string | null;
  group: string | null;
};

export type TUserWorkAction = {
  key: "start_review" | "submit_for_approval" | "audit" | "approve" | "review" | "handle" | "sign" | "execute" | "recheck";
  role: "leader" | "auditor" | "approver" | "reviewer" | "assignee" | "signer" | "executor";
};

export type TUserWorkStateMeta = { id: string; name: string; color: string; group: string } | null;

export type TUserWorkMeta = {
  // 评审 / 评审活动
  kind?: string;
  stage?: string | null;
  stage_id?: string | null;
  product?: string | null;
  parent_id?: string | null;
  parent_title?: string | null;
  result?: string | null;
  // 工作项审批
  issue_id?: string;
  transition_id?: string;
  from_state?: TUserWorkStateMeta;
  to_state?: TUserWorkStateMeta;
  transition_status?: string;
  // 审批 / 签批 / 变更单
  requester?: string | null;
  requested_at?: string | null;
  round?: number;
  tailoring_kind?: string;
  change_type?: string | null;
  item_count?: number;
  approval_type?: string;
  change_status?: string;
  // 工作项
  type_name?: string | null;
  sequence_id?: number;
  // 测试
  plan_id?: string;
  plan_name?: string;
  case_id?: string;
  review_status?: string;
  review_id?: string;
  review_name?: string;
};

export type TUserWorkDueBucket = "overdue" | "today" | "week" | "later" | null;

export type TUserWorkProcessedActionKey =
  | "started"
  | "submitted"
  | "rejected_result"
  | "audited"
  | "rolled_back"
  | "completed"
  | "closed"
  | "released"
  | "transition_approved"
  | "transition_rejected"
  | "change_approved"
  | "change_rejected"
  | "tailoring_approved"
  | "tailoring_rejected"
  | "executed"
  | "case_reviewed"
  | "rechecked";

export type TUserWorkRow = {
  key: string;
  type: TUserWorkType;
  id: string;
  code: string;
  title: string;
  meta: TUserWorkMeta;
  owner: TUserWorkOwner | null;
  project_id: string | null;
  product_id: string | null;
  status: TUserWorkStatus | null;
  action: TUserWorkAction | null;
  due_date: string | null;
  due_bucket: TUserWorkDueBucket;
  priority: string | null;
  created_at: string | null;
  // 已处理专有
  acted_at?: string | null;
  processed_action?: { key: TUserWorkProcessedActionKey; result: string | null; comment: string | null } | null;
  current_status?: TUserWorkStatus | null;
};

export type TUserWorkPendingGroupBy = "type" | "owner" | "due_date" | "none";
export type TUserWorkPendingOrderBy = "due_date" | "created_at";
export type TUserWorkProcessedGroupBy = "date" | "type" | "owner" | "none";
export type TUserWorkProcessedDays = 7 | 30 | 90;

export type TUserWorkConfig = {
  pending: {
    sources: Record<TUserWorkType, boolean>;
    group_by: TUserWorkPendingGroupBy;
    order_by: TUserWorkPendingOrderBy;
    overdue_first: boolean;
  };
  processed: {
    sources: Record<TUserWorkType, boolean>;
    days: TUserWorkProcessedDays;
    group_by: TUserWorkProcessedGroupBy;
  };
};

export type TUserWorkConfigPatch = {
  pending?: Partial<Omit<TUserWorkConfig["pending"], "sources">> & { sources?: Partial<Record<TUserWorkType, boolean>> };
  processed?: Partial<Omit<TUserWorkConfig["processed"], "sources">> & {
    sources?: Partial<Record<TUserWorkType, boolean>>;
  };
};

export type TUserWorkQuickBucket = "overdue" | "today" | "week";

export type TUserWorkSummary = {
  pending: {
    total: number;
    enabled_total: number;
    enabled_types: TUserWorkType[];
    by_type: Partial<Record<TUserWorkType, number>>;
    quick: Record<TUserWorkQuickBucket, { total: number; by_type: Partial<Record<TUserWorkType, number>> }>;
    by_action: Partial<Record<TUserWorkAction["key"], number>>;
  };
  initiated: { total: number; by_type: Partial<Record<TUserWorkType, number>> };
  config: TUserWorkConfig;
  can_edit_config: boolean;
};

export type TUserWorkPendingParams = {
  types?: TUserWorkType[];
  search?: string;
  quick?: TUserWorkQuickBucket | null;
  owners?: string[];
};

export type TUserWorkPendingResponse = { rows: TUserWorkRow[]; total: number; types: TUserWorkType[] };

export type TUserWorkProcessedParams = {
  types?: TUserWorkType[];
  search?: string;
  owners?: string[];
  days?: TUserWorkProcessedDays;
  page?: number;
  page_size?: number;
};

export type TUserWorkProcessedResponse = {
  rows: TUserWorkRow[];
  total: number;
  page: number;
  page_size: number;
  by_type: Partial<Record<TUserWorkType, number>>;
  days: TUserWorkProcessedDays;
  types: TUserWorkType[];
};

export type TUserWorkInitiatedParams = { types?: TUserWorkType[]; search?: string; owners?: string[] };

export type TUserWorkInitiatedResponse = {
  rows: TUserWorkRow[];
  total: number;
  by_type: Partial<Record<TUserWorkType, number>>;
  types: TUserWorkType[];
};
