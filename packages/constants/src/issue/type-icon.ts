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
const sanitizeTypeName = (typeName: string) =>
  typeName
    .replace(/[()（）[\]{}]/g, " ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const WORK_ITEM_TYPE_FALLBACK_KEYWORDS: Array<[string, TWorkItemTypeIconKey]> = [
  ["史诗", "EPIC"],
  ["特性", "FEATURE"],
  ["用户故事", "STORY"],
  ["故事", "STORY"],
  ["任务", "TASK"],
  ["缺陷", "BUG"],
  ["故障", "BUG"],
];

export const resolveWorkItemTypeIconKey = (typeName?: string | null): TWorkItemTypeIconKey | undefined => {
  const normalizedTypeName = normalizeTypeName(typeName);
  if (!normalizedTypeName) return undefined;

  const exactMatch = WORK_ITEM_TYPE_NAME_TO_KEY[normalizedTypeName];
  if (exactMatch) return exactMatch;

  const sanitizedTypeName = sanitizeTypeName(normalizedTypeName);
  if (sanitizedTypeName && sanitizedTypeName !== normalizedTypeName) {
    const sanitizedMatch = WORK_ITEM_TYPE_NAME_TO_KEY[sanitizedTypeName];
    if (sanitizedMatch) return sanitizedMatch;
  }

  const tokenMatch = sanitizedTypeName
    .split(" ")
    .find((token) => WORK_ITEM_TYPE_NAME_TO_KEY[token] !== undefined);
  if (tokenMatch) return WORK_ITEM_TYPE_NAME_TO_KEY[tokenMatch];

  const keywordMatch = WORK_ITEM_TYPE_FALLBACK_KEYWORDS.find(([keyword]) => sanitizedTypeName.includes(keyword));
  return keywordMatch?.[1];
};

export const getWorkItemTypeIconConfig = (typeName?: string | null): TWorkItemTypeIconConfig | undefined => {
  const iconKey = resolveWorkItemTypeIconKey(typeName);
  if (!iconKey) return undefined;
  return FIXED_WORK_ITEM_TYPE_ICON_CONFIG[iconKey];
};
