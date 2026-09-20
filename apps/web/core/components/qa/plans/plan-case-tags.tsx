/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Tag } from "antd";

/** enums 接口未就绪时的兜底色；value 即中文，颜色与后端 TextChoices 的 label 位一致 */
const PLAN_CASE_RESULT_COLOR_MAP: Record<string, string> = {
  成功: "green",
  通过: "green",
  失败: "red",
  阻塞: "gold",
  未执行: "gray",
  无效: "gray",
};

const PLAN_CASE_REVIEW_STATUS_COLOR_MAP: Record<string, string> = {
  未复核: "gray",
  复核中: "blue",
  通过: "green",
  不通过: "red",
};

type TPlanCaseTagProps = {
  value?: string | null;
  /** enums 接口下发的 值 -> 颜色 映射 */
  colors?: Record<string | number, string>;
};

const PlanCaseTag = ({ value, colors, fallback }: TPlanCaseTagProps & { fallback: Record<string, string> }) => {
  const label = value || "-";
  if (label === "-") return <span className="text-placeholder">-</span>;
  const rawColor = colors?.[label] || fallback[label] || "default";
  // antd 没有 gray，用 default
  const color = rawColor === "gray" ? "default" : rawColor;
  return (
    <Tag color={color} className="!inline-flex w-[55px] justify-center">
      {label}
    </Tag>
  );
};

/** 执行结果标签 */
export const PlanCaseResultTag = ({ value, colors }: TPlanCaseTagProps) => (
  <PlanCaseTag value={value} colors={colors} fallback={PLAN_CASE_RESULT_COLOR_MAP} />
);

/** 复核状态标签 */
export const PlanCaseReviewStatusTag = ({ value, colors }: TPlanCaseTagProps) => (
  <PlanCaseTag value={value} colors={colors} fallback={PLAN_CASE_REVIEW_STATUS_COLOR_MAP} />
);
