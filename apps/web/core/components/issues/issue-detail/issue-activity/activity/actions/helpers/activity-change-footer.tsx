/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { ACTIVITY_LINK_CLASS } from "./activity-link-styles";

type TActivityChangeItem = {
  icon?: ReactNode;
  label: string;
  /** 是否把 label 当作链接地址在新标签中打开 */
  href?: string;
  /** 变更前列等场景：用次要色，避免与「变更后」同样强调 */
  labelEmphasis?: "default" | "muted";
};

type TActivityChangeFooterProps = {
  from: TActivityChangeItem;
  to: TActivityChangeItem;
};

/**
 * 在 activity block 的主文字行下方，再显示一行 "旧值 → 新值"，用于 state / relation / link / attachment 等字段变更。
 * 保持无边框无背景的极简风格，只有图标 + 文字。
 */
export function ActivityChangeFooter(props: TActivityChangeFooterProps) {
  const { from, to } = props;

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-body-xs-regular">
      <ActivityChangeItem {...from} />
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-tertiary" aria-hidden="true" />
      <ActivityChangeItem {...to} />
    </div>
  );
}

const labelEmphasisClass = {
  default: "text-primary",
  muted: "text-secondary",
} as const;

function ActivityChangeItem(props: TActivityChangeItem) {
  const { icon, label, href, labelEmphasis = "default" } = props;
  const tone = labelEmphasisClass[labelEmphasis];

  const labelNode = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`max-w-[280px] truncate ${ACTIVITY_LINK_CLASS}`}
      title={label}
    >
      {label}
    </a>
  ) : (
    <span className={`max-w-[280px] truncate font-medium ${tone}`} title={label}>
      {label}
    </span>
  );

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {icon ? <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">{icon}</span> : null}
      {labelNode}
    </span>
  );
}
