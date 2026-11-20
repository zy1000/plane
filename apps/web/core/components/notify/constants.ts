/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TMySubscriptionType, TNotifyMode } from "@/types/notify";

export const NOTIFY_MODE_LABELS: Record<TNotifyMode, string> = {
  instant: "即时邮件",
  digest: "每日摘要",
};

/** 接收方式的选项，默认项（每日摘要）排在前面 */
export const NOTIFY_MODE_OPTIONS: { value: TNotifyMode; label: string; description: string }[] = [
  { value: "digest", label: "每日摘要", description: "次日 08:30 汇总发送" },
  { value: "instant", label: "即时邮件", description: "事件发生后立即发送" },
];

export const MY_SUBSCRIPTION_TYPE_LABELS: Record<TMySubscriptionType, string> = {
  issue: "工作项",
  requirement: "需求",
  cycle: "迭代",
  release: "发布",
  project_stage: "项目阶段",
  test_plan: "测试计划",
};

export const MY_SUBSCRIPTION_TYPES = Object.keys(MY_SUBSCRIPTION_TYPE_LABELS) as TMySubscriptionType[];
