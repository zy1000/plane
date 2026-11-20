/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** 统一通知入口（邮件）的前端类型，对应后端 plane/app/views/notify.py */

/** 订阅人的接收方式 */
export type TNotifyMode = "instant" | "digest";

/** 可以挂订阅人的对象类型（工作项用自己的订阅接口） */
export type TNotifyEntityType = "release" | "cycle" | "requirement" | "project_stage" | "test_plan";

/** 可以展示「通知对象」的对象类型 */
export type TNotifyScopeEntityType = TNotifyEntityType | "issue" | "risk" | "stage_review";

export type TNotifySubscriber = {
  id: string;
  subscriber_id: string;
  display_name: string;
  mode: TNotifyMode;
  created_at: string;
};

export type TNotifySubscribersResponse = {
  subscribers: TNotifySubscriber[];
  /** 当前用户能否给别人加 / 改 / 移除订阅 */
  can_manage?: boolean;
};

export type TNotifyScopeChip = {
  role: string;
  label: string;
  users: { id: string; display_name: string }[];
};

export type TNotifyScope = {
  instant: TNotifyScopeChip[];
  digest: TNotifyScopeChip[];
};

export type TMySubscriptionType = "issue" | TNotifyEntityType;

export type TMySubscription = {
  id: string;
  type: TMySubscriptionType;
  entity_id: string;
  code: string;
  name: string;
  project_id: string | null;
  project_name: string;
  mode: TNotifyMode;
  created_at: string;
  url_path: string;
};

export type TMySubscriptionsResponse = {
  counts: Record<TMySubscriptionType, number>;
  projects: { id: string; name: string }[];
  total: number;
  results: TMySubscription[];
};

export type TMySubscriptionsQuery = {
  type?: TMySubscriptionType;
  mode?: TNotifyMode;
  project_id?: string;
  search?: string;
  page?: number;
  per_page?: number;
};

export type TNotifyMailStatus = "pending" | "sent" | "failed" | "no_recipient";
export type TNotifyMailKind = "instant" | "digest";

export type TNotifyMail = {
  id: string;
  created_at: string;
  receiver_name: string;
  kind: TNotifyMailKind;
  subject: string;
  status: TNotifyMailStatus;
  reason: string;
  attempts: number;
};

export type TNotifyMailsResponse = {
  stats: { sent_24h: number; failed: number; no_recipient_7d: number; pending: number };
  total: number;
  results: TNotifyMail[];
};

export type TNotifyMailsQuery = {
  status?: TNotifyMailStatus;
  kind?: TNotifyMailKind;
  range?: "24h" | "7d" | "30d";
  search?: string;
  page?: number;
  per_page?: number;
};

/** 个人设置里的三类接收方式；「待我审批」固定即时，不在这里 */
export type TNotifyPreference = {
  assign_mode: "instant" | "digest";
  result_mode: "instant" | "digest" | "none";
  inform_mode: "digest" | "none";
};

/** 通知规则里一个收件角色的方式 */
export type TNotifyRuleMode = "instant" | "digest" | "none";

export type TNotifyRuleRole = {
  role: string;
  label: string;
  mode: TNotifyRuleMode;
  /** 系统默认的方式，用来判断「已修改」和做「恢复默认」 */
  default_mode: TNotifyRuleMode;
};

export type TNotifyRule = {
  /** 事件代码，如 release.overdue */
  event: string;
  /** 所属分组的 key（工作项 / 迭代 / 发布 / 审批 / …） */
  group: string;
  /** 一组里有多种对象时的对象名（如「工作流审批」），否则为空串 */
  object: string;
  label: string;
  roles: TNotifyRuleRole[];
  modified: boolean;
  /** 近 30 天日均即时条数 */
  daily_instant: number;
};

export type TNotifyRulesResponse = {
  /** 固定参数，只读展示 */
  params: { merge_minutes: number; daily_instant_cap: number; digest_schedule: string; remind_on_days: number[] };
  groups: { key: string; label: string; count: number }[];
  rules: TNotifyRule[];
  /** 发送失败的邮件数，「发送记录」页签的角标 */
  failed_mail_count: number;
};
