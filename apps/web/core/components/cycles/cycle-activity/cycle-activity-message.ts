/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCycleActivity } from "@plane/types";

export const CYCLE_FIELD_LABELS: Record<string, string> = {
  name: "名称",
  description: "描述",
  status: "状态",
  start_date: "开始时间",
  end_date: "结束时间",
  suggested_test_scope: "建议测试范围",
  owned_by: "负责人",
  owned_by_id: "负责人",
  attachment: "附件",
  cycle_issue: "关联工作项",
  comment: "评论",
  overdue: "延期记录",
  cycle: "迭代",
};

const renderText = (value: string | null | undefined, fallback = "空"): string => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return String(value);
};

export const buildCycleActivityMessage = (activity: TCycleActivity): string => {
  const { verb, field, old_value, new_value, comment } = activity;
  const fieldLabel = field ? CYCLE_FIELD_LABELS[field] ?? field : "";

  if (field === "cycle" && verb === "created") return "创建了迭代";
  if (field === "cycle" && verb === "deleted") {
    const name = renderText(old_value, "");
    return name ? `删除了迭代「${name}」` : "删除了迭代";
  }

  if (field === "comment" && verb === "created") return "新增了评论";
  if (field === "comment" && verb === "deleted") return "删除了评论";

  if (field === "attachment" && verb === "created") {
    const name = renderText(new_value, "");
    return name ? `新增了附件「${name}」` : "新增了附件";
  }
  if (field === "attachment" && verb === "deleted") {
    const name = renderText(old_value, "");
    return name ? `删除了附件「${name}」` : "删除了附件";
  }

  if (field === "cycle_issue") {
    const value = verb === "created" ? new_value : old_value;
    const summary = renderText(value, "");
    return summary
      ? `${verb === "created" ? "新增" : "移除"}了关联工作项：${summary}`
      : `${verb === "created" ? "新增" : "移除"}了关联工作项`;
  }

  if (field === "overdue") {
    const label = renderText(verb === "closed" ? old_value : new_value, "延期记录");
    return `${verb === "closed" ? "关闭" : "开启"}了${label}`;
  }

  if (field && verb === "updated") {
    const oldText = renderText(old_value, "空");
    const newText = renderText(new_value, "空");
    return `更新了${fieldLabel}：${oldText} → ${newText}`;
  }

  return comment || `${verb} ${fieldLabel}`.trim();
};
