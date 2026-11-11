/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DictionaryValueTag } from "@/components/data-dictionaries";
import { getJobRoleColor } from "./helpers";

/** 角色页里的角色标签：总是彩色（没指定颜色按灰），比成员表里的标签大一号 */
export function JobRoleTag({ role, className }: { role: { label: string; color: string }; className?: string }) {
  return (
    <DictionaryValueTag
      label={role.label}
      color={getJobRoleColor(role)}
      size="md"
      className={className ?? "h-[26px] rounded-md px-2.5 text-13"}
    />
  );
}
