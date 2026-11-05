/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { CalendarClock, PenLine, UserCheck } from "lucide-react";

export type TProfileUserRelation = "assigned" | "created" | "overdue";

/**
 * 个人主页「与本人关系」分组，工作项 / 缺陷 / 需求三页共用。
 * 组间可重叠：既分配给他又是他创建的，两组都出现；已延期的同时也在已分配里。
 * 判定口径以后端 plane/utils/profile_metrics.py 为准。
 */
export const PROFILE_USER_RELATION_GROUPS: {
  key: TProfileUserRelation;
  name: string;
  icon: LucideIcon;
  iconClassName: string;
}[] = [
  { key: "assigned", name: "已分配", icon: UserCheck, iconClassName: "text-accent-primary" },
  { key: "created", name: "已创建", icon: PenLine, iconClassName: "text-secondary" },
  { key: "overdue", name: "已延期", icon: CalendarClock, iconClassName: "text-danger-primary" },
];

/** 工作项 / 缺陷页的取数范围：分配给他 ∪ 他创建的（已延期是已分配的子集） */
export const PROFILE_USER_RELATION_SCOPE = "assigned,created";
