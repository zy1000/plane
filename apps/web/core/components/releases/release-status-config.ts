/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, SVGProps } from "react";
import { Ban, CircleAlert, CircleCheck, CircleDashed, PlayCircle, XCircle } from "lucide-react";
import type { IRelease, TReleaseOverduePhase, TReleaseStatus } from "@plane/types";

type TReleaseStatusDetails = {
  value: TReleaseStatus;
  label: string;
  color: string;
  textColor: string;
  bgColor: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const RELEASE_STATUS: TReleaseStatusDetails[] = [
  {
    value: "not-started",
    label: "未开始",
    color: "#94a3b8",
    textColor: "text-secondary",
    bgColor: "bg-layer-1",
    icon: CircleDashed,
  },
  {
    value: "in-progress",
    label: "进行中",
    color: "#f59e0b",
    textColor: "text-[#F59E0B]",
    bgColor: "bg-warning-subtle",
    icon: PlayCircle,
  },
  {
    value: "pending-test",
    label: "待测试",
    color: "#6366f1",
    textColor: "text-accent-primary",
    bgColor: "bg-accent-subtle",
    icon: CircleAlert,
  },
  {
    value: "testing",
    label: "测试中",
    color: "#0ea5e9",
    textColor: "text-accent-primary",
    bgColor: "bg-accent-subtle",
    icon: CircleAlert,
  },
  {
    value: "rejected",
    label: "已驳回",
    color: "#ef4444",
    textColor: "text-danger-primary",
    bgColor: "bg-danger-subtle",
    icon: XCircle,
  },
  {
    value: "completed",
    label: "已完成",
    color: "#16a34a",
    textColor: "text-success-primary",
    bgColor: "bg-success-subtle",
    icon: CircleCheck,
  },
  {
    value: "cancelled",
    label: "已取消",
    color: "#ef4444",
    textColor: "text-danger-primary",
    bgColor: "bg-danger-subtle",
    icon: Ban,
  },
];

export const RELEASE_STATUS_ORDER: TReleaseStatus[] = RELEASE_STATUS.map((status) => status.value);

const RELEASE_STATUS_MAP: Record<TReleaseStatus, TReleaseStatusDetails> = RELEASE_STATUS.reduce(
  (acc, status) => {
    acc[status.value] = status;
    return acc;
  },
  {} as Record<TReleaseStatus, TReleaseStatusDetails>
);

const RELEASE_STATUS_NORMALIZE_MAP: Record<string, TReleaseStatus> = {
  "not-started": "not-started",
  "in-progress": "in-progress",
  "pending-test": "pending-test",
  testing: "testing",
  rejected: "rejected",
  completed: "completed",
  cancelled: "cancelled",
  backlog: "not-started",
  planned: "not-started",
  paused: "in-progress",
  未开始: "not-started",
  进行中: "in-progress",
  待测试: "pending-test",
  测试中: "testing",
  已驳回: "rejected",
  已完成: "completed",
  已取消: "cancelled",
};

export function normalizeReleaseStatusValue(status?: string): TReleaseStatus {
  if (!status) return "not-started";
  return RELEASE_STATUS_NORMALIZE_MAP[status.toLowerCase()] ?? RELEASE_STATUS_NORMALIZE_MAP[status] ?? "not-started";
}

export function getReleaseStatusDetails(status?: string): TReleaseStatusDetails {
  const normalizedStatus = normalizeReleaseStatusValue(status);
  return RELEASE_STATUS_MAP[normalizedStatus];
}

export function getAllowedReleaseStatusOptions(currentStatus?: string): TReleaseStatusDetails[] {
  const normalizedStatus = normalizeReleaseStatusValue(currentStatus);
  const canSelectRejected =
    normalizedStatus === "pending-test"
    || normalizedStatus === "testing"
    || normalizedStatus === "rejected";

  if (canSelectRejected) {
    return RELEASE_STATUS;
  }
  return RELEASE_STATUS.filter((status) => status.value !== "rejected");
}

export type TReleaseOverdueTone = "danger" | "warning" | "default";

type TReleaseOverdueInput = Pick<IRelease, "has_active_overdue" | "has_overdue_history">;

/**
 * 根据逾期记录返回展示色调（详见 docs/release-requirements.md §11）：
 * - 存在未结束的逾期记录：红色（danger）
 * - 仅存在已结束记录：黄色（warning）
 * - 从未产生过：默认色
 */
export function getReleaseRowTone(release?: TReleaseOverdueInput | null): TReleaseOverdueTone {
  if (!release) return "default";
  if (release.has_active_overdue) return "danger";
  if (release.has_overdue_history) return "warning";
  return "default";
}

const RELEASE_OVERDUE_PHASE_LABEL: Record<TReleaseOverduePhase, string> = {
  dev: "研发逾期",
  test: "测试逾期",
};

export function getReleaseOverduePhaseLabel(phase?: TReleaseOverduePhase | null): string | null {
  if (!phase) return null;
  return RELEASE_OVERDUE_PHASE_LABEL[phase] ?? null;
}

const RELEASE_OVERDUE_TONE_TEXT_CLASS: Record<TReleaseOverdueTone, string> = {
  danger: "text-danger-primary",
  warning: "text-[#F59E0B]",
  default: "",
};

export function getReleaseOverdueToneTextClass(tone: TReleaseOverdueTone): string {
  return RELEASE_OVERDUE_TONE_TEXT_CLASS[tone];
}
