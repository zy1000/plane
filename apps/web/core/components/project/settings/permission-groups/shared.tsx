/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectPermissionGroup, TProjectPermissionGroupSource } from "@plane/types";
import { cn } from "@plane/utils";

export const GROUP_SOURCE_LABEL: Record<TProjectPermissionGroupSource, string> = {
  template: "模板",
  project: "本项目",
};

const GROUP_SOURCE_CLASS: Record<TProjectPermissionGroupSource, string> = {
  template: "bg-accent-subtle text-accent-primary",
  project: "bg-success-subtle text-success-primary",
};

/** 组名后的来源标签（与工作区设置里的「模板」标签同款） */
export function PermissionGroupSourceBadge({ source }: { source: TProjectPermissionGroupSource }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-12 font-medium",
        GROUP_SOURCE_CLASS[source]
      )}
    >
      {GROUP_SOURCE_LABEL[source]}
    </span>
  );
}

/** 能在本项目里改内容的组：只有本项目自己的组（引用模板只读） */
export const isGroupEditable = (group: TProjectPermissionGroup) => group.source === "project";

/** 删除按钮文案：模板组是「删除引用」 */
export const deleteActionLabel = (group: TProjectPermissionGroup) => (group.source === "template" ? "删除引用" : "删除");

/** 删除确认框的标题 / 正文（模板组说明是不再引用，并提示去哪恢复） */
export const deleteConfirmCopy = (group: TProjectPermissionGroup) =>
  group.source === "template"
    ? {
        title: "删除引用",
        content: `本项目将不再引用「${group.name}」，本项目里绑到它的成员会解绑。可在工作区设置 › 权限组 › ${group.name} › 引用项目里恢复。`,
      }
    : {
        title: "删除权限组",
        content: `删除「${group.name}」后，组里的成员会失去这个组给的权限。确定删除？`,
      };

/** 后端错误体 { error } → 一句话 */
export const errorMessage = (error: unknown, fallback: string) => {
  const payload = error as { error?: string | string[]; detail?: string } | undefined;
  const raw = payload?.error ?? payload?.detail;
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  return raw || fallback;
};
