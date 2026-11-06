/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import {
  Bug,
  CheckCheck,
  ClipboardCheck,
  FileDiff,
  FileText,
  GitBranch,
  Layers,
  ListChecks,
  Play,
  SquareCheck,
  Table2,
} from "lucide-react";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { getDate, renderFormattedDate } from "@plane/utils";
import type { TUserWorkProcessedActionKey, TUserWorkRow, TUserWorkStatus, TUserWorkType } from "@/types/user-work";

type TTranslate = (key: string, params?: Record<string, string | number>) => string;

/** 左栏与分组的固定顺序：先是等人表态的（评审 / 审批），再是自己手上的，最后是测试 */
export const WORK_TYPE_ORDER: TUserWorkType[] = [
  "review",
  "review_activity",
  "issue_approval",
  "requirement_change",
  "tailoring_approval",
  "work_item",
  "defect",
  "requirement",
  "case_execution",
  "case_review",
  "plan_review",
];

export const WORK_TYPE_ICON: Record<TUserWorkType, ComponentType<{ className?: string }>> = {
  review: ClipboardCheck,
  review_activity: ListChecks,
  issue_approval: GitBranch,
  requirement_change: FileDiff,
  tailoring_approval: Table2,
  work_item: Layers,
  defect: Bug,
  requirement: FileText,
  case_execution: Play,
  case_review: SquareCheck,
  plan_review: CheckCheck,
};

/** 编号格里类型图标的颜色：同一类在三个视图里长一样 */
export const WORK_TYPE_ICON_CLASS: Record<TUserWorkType, string> = {
  review: "text-accent-primary",
  review_activity: "text-accent-primary",
  issue_approval: "text-warning-primary",
  requirement_change: "text-[#7a5af8]",
  tailoring_approval: "text-accent-primary",
  work_item: "text-[#3f7fbf]",
  defect: "text-danger-primary",
  requirement: "text-[#7a5af8]",
  case_execution: "text-secondary",
  case_review: "text-secondary",
  plan_review: "text-secondary",
};

export const workTypeLabel = (t: TTranslate, type: TUserWorkType) => t(`profile.work.types.${type}`);

export const sortTypes = (types: Iterable<TUserWorkType>) => {
  const set = new Set(types);
  return WORK_TYPE_ORDER.filter((type) => set.has(type));
};

// ─────────────────────────── 状态 ───────────────────────────

export type TPillTone = "neutral" | "blue" | "amber" | "green" | "red" | "purple";

const REVIEW_STATUS_TONE: Record<string, TPillTone> = {
  not_started: "neutral",
  in_review: "blue",
  in_approval: "amber",
  completed: "green",
};

const STATE_GROUP_TONE: Record<string, TPillTone> = {
  backlog: "neutral",
  unstarted: "neutral",
  started: "amber",
  completed: "green",
  cancelled: "red",
  triage: "neutral",
};

const GENERIC_STATUS_TONE: Record<string, TPillTone> = {
  pending_approval: "amber",
  pending_review: "purple",
  pending_sign: "amber",
  not_executed: "neutral",
  not_reviewed: "neutral",
  not_rechecked: "amber",
  pending: "amber",
  approved: "green",
  rejected: "red",
  cancelled: "neutral",
  draft: "neutral",
  revising: "blue",
  released: "green",
  closed: "neutral",
  in_progress: "amber",
  projected: "blue",
  成功: "green",
  失败: "red",
  阻塞: "amber",
  无效: "neutral",
  通过: "green",
  不通过: "red",
  复核中: "amber",
  评审中: "blue",
  重新提审: "amber",
};

const GENERIC_STATUS_I18N: Record<string, string> = {
  pending_approval: "profile.work.status.pending_approval",
  pending_review: "profile.work.status.pending_review",
  pending_sign: "profile.work.status.pending_sign",
  not_executed: "profile.work.status.not_executed",
  not_reviewed: "profile.work.status.not_reviewed",
  not_rechecked: "profile.work.status.not_rechecked",
  approved: "profile.work.status.approved",
  rejected: "profile.work.status.rejected",
  cancelled: "profile.work.status.cancelled",
};

/** 把后端给的 status 翻成「文案 + 色调 + 原色」：工作项用状态原色，评审 / 需求走 i18n，其它看 key */
export function resolveStatus(
  t: TTranslate,
  row: Pick<TUserWorkRow, "type">,
  status: TUserWorkStatus | null | undefined
): { label: string; tone: TPillTone; color: string | null } {
  if (!status || !status.key) return { label: "—", tone: "neutral", color: null };
  const key = status.key;
  if (row.type === "work_item" || row.type === "defect" || (row.type === "issue_approval" && status.color)) {
    return { label: status.label ?? key, tone: STATE_GROUP_TONE[status.group ?? ""] ?? "neutral", color: status.color };
  }
  if (row.type === "review" || row.type === "review_activity") {
    return { label: t(`stage_review.status.${key}`), tone: REVIEW_STATUS_TONE[key] ?? "neutral", color: null };
  }
  if (row.type === "requirement") {
    return {
      label: t(`requirement_fields.statuses.${key}`) || status.label || key,
      tone: GENERIC_STATUS_TONE[key] ?? "neutral",
      color: null,
    };
  }
  const i18nKey = GENERIC_STATUS_I18N[key];
  return {
    label: i18nKey ? t(i18nKey) : (status.label ?? key),
    tone: GENERIC_STATUS_TONE[key] ?? "neutral",
    color: null,
  };
}

const PROCESSED_ACTION_TONE: Record<TUserWorkProcessedActionKey, TPillTone> = {
  started: "neutral",
  submitted: "blue",
  rejected_result: "red",
  audited: "green",
  rolled_back: "amber",
  completed: "green",
  closed: "neutral",
  released: "green",
  transition_approved: "green",
  transition_rejected: "red",
  change_approved: "green",
  change_rejected: "red",
  tailoring_approved: "green",
  tailoring_rejected: "red",
  executed: "blue",
  case_reviewed: "blue",
  rechecked: "blue",
};

export function resolveProcessedAction(t: TTranslate, row: TUserWorkRow) {
  const action = row.processed_action;
  if (!action) return null;
  let detail: string | null = null;
  if (action.result) {
    detail =
      row.type === "review" || row.type === "review_activity"
        ? t(`stage_review.result.${action.result}`) || action.result
        : action.result;
  }
  return { label: t(`profile.work.processed_actions.${action.key}`), tone: PROCESSED_ACTION_TONE[action.key], detail };
}

// ─────────────────────────── 日期 ───────────────────────────

export const formatDay = (value: string | null | undefined) => {
  const date = getDate(value ?? undefined);
  return date ? (renderFormattedDate(date, "MM-dd") ?? "") : "";
};

export const formatDayFull = (value: string | null | undefined) => {
  const date = getDate(value ?? undefined);
  return date ? (renderFormattedDate(date, "yyyy-MM-dd") ?? "") : "";
};

/** 已处理的时间：今天只给时分，更早的带月日 */
export const formatActedAt = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return sameDay ? time : `${renderFormattedDate(date, "MM-dd")} ${time}`;
};

export const overdueDays = (value: string | null | undefined) => {
  const date = getDate(value ?? undefined);
  if (!date) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(differenceInCalendarDays(today, date), 0);
};

/** 需要在标题后面补的灰色上下文：阶段·产品 / 所属评审 / 流转 / 申请人 / 计划 */
export function rowContext(t: TTranslate, row: TUserWorkRow): string | null {
  const meta = row.meta ?? {};
  switch (row.type) {
    case "review":
      return [meta.stage, meta.product].filter(Boolean).join(" · ") || null;
    case "review_activity": {
      const parts: string[] = [];
      if (meta.parent_title) parts.push(t("profile.work.meta.belongs_to", { title: meta.parent_title }));
      if (meta.stage) parts.push(meta.stage);
      if (!meta.parent_title && meta.product) parts.push(meta.product);
      return parts.join(" · ") || null;
    }
    case "issue_approval": {
      const parts: string[] = [];
      if (meta.from_state || meta.to_state) parts.push(`${meta.from_state?.name ?? "—"} → ${meta.to_state?.name ?? "—"}`);
      if (meta.requester)
        parts.push(t("profile.work.meta.requested_by", { name: meta.requester, date: formatDay(meta.requested_at) }));
      return parts.join(" · ") || null;
    }
    case "requirement_change":
      return meta.requester
        ? t("profile.work.meta.submitted_by", { name: meta.requester, date: formatDay(meta.requested_at) })
        : null;
    case "tailoring_approval": {
      const parts: string[] = [];
      if (meta.round) parts.push(t("profile.work.meta.round", { round: meta.round }));
      if (meta.requester)
        parts.push(t("profile.work.meta.submitted_by", { name: meta.requester, date: formatDay(meta.requested_at) }));
      return parts.join(" · ") || null;
    }
    case "case_execution":
    case "plan_review":
      return meta.plan_name ? t("profile.work.meta.in_plan", { name: meta.plan_name }) : null;
    case "case_review":
      return meta.review_name ? t("profile.work.meta.in_review", { name: meta.review_name }) : null;
    default:
      return null;
  }
}
