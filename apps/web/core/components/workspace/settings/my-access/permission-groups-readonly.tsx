/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TPermissionCatalogGroup, TPermissionScope } from "@plane/constants";
import type { TMyAccessGrant } from "@plane/types";
import { cn } from "@plane/utils";
import { getGroupKeys, getScopeGroups } from "../permission-groups/editor/catalog";
import { PermissionChip } from "./chips";
import { describeSources, getGrantTag } from "./helpers";

type Props = {
  scope: TPermissionScope;
  /** 实际生效的 key；没出现的按未授予画 */
  grants: TMyAccessGrant[];
  /** 选了具体项目后：只来自模板 / 本项目组的 chip 加「模板」「本项目」小标 */
  showGrantTags?: boolean;
};

const groupId = (group: TPermissionCatalogGroup) => `${group.scope}:${group.label}`;

/**
 * 只读版的目录分组卡片（视觉同权限组编辑器）：每个分组一张可折叠卡，模块一行，动作画成已授予 / 未授予 chip。
 * 默认有已授予 key 的分组展开、全 0 的收起；grants 换了一批（切项目）时由父组件换 key 重挂，重新按默认展开。
 */
export function PermissionGroupsReadonly({ scope, grants, showGrantTags = false }: Props) {
  const groups = useMemo(() => getScopeGroups(scope), [scope]);
  const grantMap = useMemo(() => new Map(grants.map((grant) => [grant.key, grant])), [grants]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const id = groupId(group);
        const keys = getGroupKeys(group);
        const granted = keys.filter((key) => grantMap.has(key)).length;
        const isOpen = expanded[id] ?? granted > 0;
        return (
          <section key={id} className="rounded-xl border border-subtle bg-surface-1">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setExpanded((prev) => ({ ...prev, [id]: !isOpen }))}
              className={cn(
                "flex h-[52px] w-full items-center gap-3 rounded-t-xl bg-layer-1 px-5 text-left transition-colors hover:bg-layer-1-hover",
                isOpen ? "border-b border-subtle" : "rounded-b-xl"
              )}
            >
              <span className="text-14 font-semibold text-primary">{group.label}</span>
              <span className="text-13 text-tertiary tabular-nums">
                {granted} / {keys.length}
              </span>
              <ChevronDown
                className={cn("ml-auto size-4 shrink-0 text-tertiary transition-transform duration-200", isOpen && "rotate-180")}
              />
            </button>
            {isOpen &&
              group.modules.map((module) => (
                <div
                  key={module.key}
                  className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-x-4 border-b border-subtle px-5 py-3 last:border-b-0"
                >
                  <span className="flex h-8 items-center truncate text-14 font-medium text-primary">{module.label}</span>
                  <div className="flex flex-wrap gap-2">
                    {module.actions.map((action) => {
                      const grant = grantMap.get(action.key);
                      return (
                        <PermissionChip
                          key={action.key}
                          label={action.label}
                          granted={Boolean(grant)}
                          tooltip={grant ? describeSources(grant.sources) : undefined}
                          tag={grant && showGrantTags ? getGrantTag(grant.sources) : null}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
