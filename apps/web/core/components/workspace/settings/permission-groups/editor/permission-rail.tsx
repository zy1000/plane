/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";

export type TRailSection = {
  /** 「项目权限」「工作区权限」 */
  label: string;
  checked: number;
  total: number;
  items: { id: string; label: string; checked: number; total: number }[];
};

/** 卡片 DOM 节点按分组 id 登记；滚动时取最靠上的那张作为当前项 */
export const useGroupScrollSpy = (ids: string[]) => {
  const nodes = useRef(new Map<string, HTMLElement>());
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const idsKey = ids.join("|");

  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.groupId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActiveId(first);
      },
      // 只看视口上半部分：卡片顶到这一带就算「正在看」
      { rootMargin: "0px 0px -55% 0px" }
    );
    nodes.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
    // ids 用拼接串比较，避免每次渲染新数组都重建观察器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const register = (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  const scrollTo = (id: string) => {
    setActiveId(id);
    nodes.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return { activeId, register, scrollTo };
};

/** 权限编辑器左侧的分组导航：两段（项目权限 / 工作区权限）各列分组和已勾数，点一下滚到对应卡片 */
export function PermissionRail(props: {
  sections: TRailSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { sections, activeId, onSelect } = props;
  return (
    <nav className="sticky top-4 flex flex-col gap-0.5 self-start" aria-label="权限分组">
      {sections.map((section, index) => (
        <div key={section.label} className={cn("flex flex-col gap-0.5", index > 0 && "mt-4")}>
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1 text-13 font-semibold text-primary">
            {section.label}
            <span className="font-medium text-tertiary tabular-nums">
              {section.checked}/{section.total}
            </span>
          </div>
          {section.items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex h-[34px] items-center justify-between rounded-md px-2.5 text-14 transition-colors",
                  isActive ? "bg-accent-subtle font-medium text-accent-primary" : "text-secondary hover:bg-layer-1-hover"
                )}
                onClick={() => onSelect(item.id)}
              >
                <span className="truncate">{item.label}</span>
                <span className={cn("text-12 tabular-nums", isActive ? "text-accent-primary" : "text-placeholder")}>
                  {item.checked}/{item.total}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
