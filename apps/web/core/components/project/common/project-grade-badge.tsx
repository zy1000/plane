/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectGrade } from "@plane/types";
import { cn } from "@plane/utils";

type TGradeStyle = {
  /** 徽章背景色 */
  bg: string;
  /** 徽章文字/边框颜色 */
  fg: string;
  /** 徽章边框 */
  border: string;
};

/**
 * 项目等级视觉规范：P+ 最难（深红），C 最易（蓝灰）。
 * 使用 Tailwind 任意值以避免受主题 token 影响，并保证在浅色/深色背景上对比足够。
 */
/** 等级对应的简短说明，用于下拉选项右侧辅助文本 */
export const PROJECT_GRADE_LABELS: Record<TProjectGrade, string> = {
  "P+": "最高（最难）",
  P: "高",
  A: "较高",
  B: "中等",
  C: "较低（最容易）",
};

export const PROJECT_GRADE_STYLES: Record<TProjectGrade, TGradeStyle> = {
  "P+": {
    bg: "bg-[#fde2e4]",
    fg: "text-[#b91c1c]",
    border: "border-[#f5a3a8]",
  },
  P: {
    bg: "bg-[#ffe8d1]",
    fg: "text-[#c2410c]",
    border: "border-[#fbbf84]",
  },
  A: {
    bg: "bg-[#fff4c2]",
    fg: "text-[#a16207]",
    border: "border-[#facc4f]",
  },
  B: {
    bg: "bg-[#dcfce7]",
    fg: "text-[#15803d]",
    border: "border-[#86efac]",
  },
  C: {
    bg: "bg-[#dbeafe]",
    fg: "text-[#1d4ed8]",
    border: "border-[#93c5fd]",
  },
};

type TSize = "sm" | "md";

type Props = {
  grade: TProjectGrade;
  size?: TSize;
  className?: string;
};

/**
 * 等级徽章：圆角方块，承载 P+/P/A/B/C 的彩色标识。
 * P+ 为最高级别（深红），C 为最低级别（蓝灰）。
 */
export function ProjectGradeBadge(props: Props) {
  /** 默认与「创建项目」等级选择器一致；`sm` 仅用于极窄布局 */
  const { grade, size = "md", className } = props;
  const style = PROJECT_GRADE_STYLES[grade];
  if (!style) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[5px] border font-semibold leading-none tracking-tight",
        style.bg,
        style.fg,
        style.border,
        {
          /** 固定宽高，避免「B」比「P+」短导致标签长度不一致（按最长档 P+ 对齐） */
          "h-4 w-7 text-[10px]": size === "sm",
          /** 列表/创建项目表单共用：宽度以 P+ 为准，单字等级居中 */
          "h-6 w-9 text-12": size === "md",
        },
        className
      )}
      aria-label={`Project grade ${grade}`}
    >
      {grade}
    </span>
  );
}
