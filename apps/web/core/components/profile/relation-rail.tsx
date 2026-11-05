/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";

export type TRelationRailItem = {
  id: string;
  name: string;
  icon: ReactNode;
  count: number;
};

type Props = {
  heading: string;
  items: TRelationRailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/**
 * 个人主页左侧分组栏（与本人关系：已分配 / 已创建 / 已延期）。
 * 三组常驻：没有数据的组也显示，条数为 0 时变灰但照样能点。工作项、缺陷、需求三页共用。
 */
export function ProfileRelationRail({ heading, items, selectedId, onSelect }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      aria-label={heading}
      className={cn(
        "flex h-full flex-shrink-0 flex-col gap-1 border-r border-subtle bg-surface-1 transition-[width] duration-200 ease-in-out",
        isCollapsed ? "w-12 px-1.5 py-3" : "w-[232px] px-3 py-3.5"
      )}
    >
      <div className={cn("flex h-8 items-center", isCollapsed ? "justify-center" : "justify-between pl-3 pr-1")}>
        {!isCollapsed && <span className="truncate text-12 font-medium text-tertiary">{heading}</span>}
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "展开分组栏" : "收起分组栏"}
          onClick={() => setIsCollapsed((value) => !value)}
        >
          {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      {items.map((item) => {
        const isActive = item.id === selectedId;
        const isZero = item.count <= 0;
        const button = (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "true" : undefined}
            aria-label={`${item.name}，${item.count} 项`}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex h-10 w-full items-center rounded-lg text-left text-14 transition-colors",
              isCollapsed ? "justify-center" : "gap-2.5 px-3",
              isActive
                ? "bg-accent-subtle font-semibold text-accent-primary"
                : isZero
                  ? "text-placeholder hover:bg-layer-transparent-hover"
                  : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            )}
          >
            <span className={cn("grid shrink-0 place-items-center", isZero && !isActive && "opacity-50")}>
              {item.icon}
            </span>
            {!isCollapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span
                  className={`shrink-0 text-13 tabular-nums ${
                    isActive ? "text-accent-primary" : isZero ? "text-placeholder" : "text-tertiary"
                  }`}
                >
                  {item.count}
                </span>
              </>
            )}
          </button>
        );
        return isCollapsed ? (
          <Tooltip key={item.id} tooltipContent={`${item.name} · ${item.count}`} position="right">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </aside>
  );
}
