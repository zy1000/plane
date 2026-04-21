/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TWorkItemTypeIconKey = "EPIC" | "FEATURE" | "STORY" | "TASK" | "BUG";

export type TWorkItemTypeIconConfig = {
  name: string;
  color: string;
  background_color: string;
};

const FIXED_WORK_ITEM_TYPE_ICON_CONFIG: Record<TWorkItemTypeIconKey, TWorkItemTypeIconConfig> = {
  EPIC: { name: "Mountain", color: "#ff877b", background_color: "#FFFFFF" },
  FEATURE: { name: "Cog", color: "#9191f9", background_color: "#FFFFFF" },
  STORY: { name: "NotebookPen", color: "#00A1EC", background_color: "#FFFFFF" },
  TASK: { name: "Layers", color: "#6796ff", background_color: "#FFFFFF" },
  BUG: { name: "Bug", color: "#8e0119", background_color: "#FFFFFF" },
};

const WORK_ITEM_TYPE_NAME_TO_KEY: Record<string, TWorkItemTypeIconKey> = {
  "史诗": "EPIC",
  epic: "EPIC",
  "特性": "FEATURE",
  feature: "FEATURE",
  "用户故事": "STORY",
  story: "STORY",
  "user story": "STORY",
  "user_story": "STORY",
  "任务": "TASK",
  task: "TASK",
  "缺陷": "BUG",
  bug: "BUG",
  defect: "BUG",
};

const normalizeTypeName = (typeName?: string | null) => (typeName ?? "").trim().toLowerCase();

export const resolveWorkItemTypeIconKey = (typeName?: string | null): TWorkItemTypeIconKey | undefined => {
  const normalizedTypeName = normalizeTypeName(typeName);
  if (!normalizedTypeName) return undefined;
  return WORK_ITEM_TYPE_NAME_TO_KEY[normalizedTypeName];
};

export const getWorkItemTypeIconConfig = (typeName?: string | null): TWorkItemTypeIconConfig | undefined => {
  const iconKey = resolveWorkItemTypeIconKey(typeName);
  if (!iconKey) return undefined;
  return FIXED_WORK_ITEM_TYPE_ICON_CONFIG[iconKey];
};
