/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDataDictionaryItem } from "@plane/types";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";

type Props = {
  jobRoleIds: string[] | undefined;
  jobRoleMap: Map<string, TDataDictionaryItem>;
  /** 角色字典开了彩色显示时按值的颜色渲染 */
  isColored: boolean;
  /** 最多显示几个，其余折成 +N */
  max?: number;
};

/** 角色（job_role）标签：成员表的「角色」列、权限组成员页共用；没设置时显示「未设置」 */
export function JobRoleTags({ jobRoleIds, jobRoleMap, isColored, max = 2 }: Props) {
  const items = (jobRoleIds ?? []).map((id) => jobRoleMap.get(id)).filter((item): item is TDataDictionaryItem => !!item);
  if (items.length === 0) return <span className="text-13 text-placeholder">未设置</span>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" title={items.map((item) => item.label).join("、")}>
      {shown.map((item) =>
        isColored ? (
          <DictionaryValueTag
            key={item.id}
            label={item.label}
            color={resolveDictionaryItemColor(item, { is_colored: isColored })}
          />
        ) : (
          <span
            key={item.id}
            className="inline-flex h-5 max-w-full items-center truncate rounded border border-subtle bg-layer-1 px-1.5 text-12 text-secondary"
          >
            {item.label}
          </span>
        )
      )}
      {rest > 0 && <span className="text-12 text-tertiary">+{rest}</span>}
    </span>
  );
}
