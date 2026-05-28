/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TReleaseActivity } from "@plane/types";

/**
 * 字段中文标签（与后端 _RELEASE_FIELD_LABELS 保持一致）。
 */
export const RELEASE_FIELD_LABELS: Record<string, string> = {
  name: "名称",
  description: "描述",
  description_html: "描述",
  note: "发布日志",
  status: "状态",
  lead: "负责人",
  lead_id: "负责人",
  start_date: "开始时间",
  target_date: "结束时间",
  test_handoff_date: "转测日期",
  attachment: "附件",
  release_issue: "关联工作项",
  release_plan: "关联测试计划",
  release_cycle: "关联迭代",
  comment: "评论",
  overdue: "延期记录",
  release: "发布",
};

const renderText = (value: string | null | undefined, fallback = "空"): string => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return String(value);
};

/**
 * 把活动条目转成给用户看的一句话，例如：
 * - "更新了状态：未开始 → 进行中"
 * - "新增了评论"
 * - "新增了 3 个关联工作项：登录优化、密码校验、登出按钮"
 *
 * 没有命中模板时，回退到 backend 写入的 comment 字段。
 */
export const buildReleaseActivityMessage = (activity: TReleaseActivity): string => {
  const { verb, field, old_value, new_value, comment } = activity;
  const fieldLabel = field ? RELEASE_FIELD_LABELS[field] ?? field : "";

  if (field === "release" && verb === "created") return "创建了发布";
  if (field === "release" && verb === "deleted") {
    const name = renderText(old_value, "");
    return name ? `删除了发布「${name}」` : "删除了发布";
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

  if (field === "release_issue") {
    const value = verb === "created" ? new_value : old_value;
    const summary = renderText(value, "");
    return summary
      ? `${verb === "created" ? "新增" : "移除"}了关联工作项：${summary}`
      : `${verb === "created" ? "新增" : "移除"}了关联工作项`;
  }

  if (field === "release_plan") {
    const value = verb === "created" ? new_value : old_value;
    const summary = renderText(value, "");
    return summary
      ? `${verb === "created" ? "新增" : "移除"}了关联测试计划：${summary}`
      : `${verb === "created" ? "新增" : "移除"}了关联测试计划`;
  }

  if (field === "release_cycle") {
    const value = verb === "created" ? new_value : old_value;
    const summary = renderText(value, "");
    return summary
      ? `${verb === "created" ? "新增" : "移除"}了关联迭代：${summary}`
      : `${verb === "created" ? "新增" : "移除"}了关联迭代`;
  }

  if (field === "overdue") {
    const phase = renderText(verb === "closed" ? old_value : new_value, "");
    return `${verb === "closed" ? "关闭" : "开启"}了${phase || "延期记录"}`;
  }

  if (field && verb === "updated") {
    const oldText = renderText(old_value, "空");
    const newText = renderText(new_value, "空");
    return `更新了${fieldLabel}：${oldText} → ${newText}`;
  }

  return comment || `${verb} ${fieldLabel}`.trim();
};
