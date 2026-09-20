/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@plane/utils";

export type TPlanCaseRailTreeNode = {
  key: string;
  label: ReactNode;
  count?: number;
  /** 行首的小图标 / 头像，可选 */
  icon?: ReactNode;
  children?: TPlanCaseRailTreeNode[];
};

type TPlanCaseRailTreeProps = {
  nodes: TPlanCaseRailTreeNode[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 展开的节点 key；不传则全部展开 */
  expandedKeys?: string[];
  onExpandedKeysChange?: (keys: string[]) => void;
  className?: string;
};

const INDENT = 20;

/**
 * 计划用例页左栏的树：无外框、每行带计数、选中项品牌色底。
 * 模块 / 执行人 / 枚举分组三种左栏共用，调用方只负责把数据映射成 nodes。
 */
export const PlanCaseRailTree = ({
  nodes,
  selectedKey,
  onSelect,
  expandedKeys,
  onExpandedKeysChange,
  className,
}: TPlanCaseRailTreeProps) => {
  const isExpanded = (key: string) => (expandedKeys ? expandedKeys.includes(key) : true);

  const toggleExpand = (key: string) => {
    if (!expandedKeys || !onExpandedKeysChange) return;
    onExpandedKeysChange(isExpanded(key) ? expandedKeys.filter((item) => item !== key) : [...expandedKeys, key]);
  };

  const renderNode = (node: TPlanCaseRailTreeNode, depth: number): ReactNode => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const expanded = hasChildren && isExpanded(node.key);
    const isSelected = node.key === selectedKey;

    return (
      <div key={node.key}>
        <div
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildren ? expanded : undefined}
          tabIndex={0}
          onClick={() => onSelect(node.key)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(node.key);
            }
          }}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-13 transition-colors outline-none",
            isSelected ? "bg-accent-subtle font-medium text-accent-primary" : "text-primary hover:bg-layer-1"
          )}
          style={{ paddingLeft: 6 + depth * INDENT }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={expanded ? "收起" : "展开"}
            onClick={(event) => {
              event.stopPropagation();
              toggleExpand(node.key);
            }}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded text-tertiary",
              hasChildren && expandedKeys ? "hover:bg-layer-2" : "pointer-events-none",
              !hasChildren && "invisible"
            )}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {node.icon && <span className="flex shrink-0 items-center">{node.icon}</span>}
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          {typeof node.count === "number" && (
            <span className={cn("shrink-0 text-12 tabular-nums", isSelected ? "text-accent-primary" : "text-tertiary")}>
              {node.count}
            </span>
          )}
        </div>
        {expanded && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div role="tree" className={cn("flex flex-col gap-px", className)}>
      {nodes.map((node) => renderNode(node, 0))}
    </div>
  );
};
