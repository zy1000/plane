/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface ICycleGroupIcon {
  className?: string;
  color?: string;
  cycleGroup: TCycleGroups;
  height?: string;
  width?: string;
}

export type TCycleGroups = "not_started" | "in_progress" | "testing" | "completed" | "cancelled";

export const CYCLE_GROUP_COLORS: {
  [key in TCycleGroups]: string;
} = {
  in_progress: "#F59E0B",
  testing: "#8B5CF6",
  not_started: "#3F76FF",
  completed: "#16A34A",
  cancelled: "#525252",
};

export const CYCLE_GROUP_I18N_LABELS: {
  [key in TCycleGroups]: string;
} = {
  not_started: "未开始",
  in_progress: "进行中",
  testing: "测试中",
  completed: "已完成",
  cancelled: "已取消",
};
