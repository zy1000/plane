/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ReactNode } from "react";
import { Tree } from "antd";
import { Flag, LayoutList, Tag } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TPlanGroupTree, TPlanGroupTreeNode } from "@/services/qa/plan.service";

type Props = {
  tree: TPlanGroupTree | null;
  loading?: boolean;
  /** "root" | "<kind>:<枚举值>" */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 执行结果 → 颜色名（green/red/gold/gray），用于结果节点的圆点 */
  resultColors?: Record<string, string>;
};

const RESULT_DOT_CLASS: Record<string, string> = {
  green: "bg-green-500",
  red: "bg-red-500",
  gold: "bg-yellow-500",
  gray: "bg-gray-400",
};

const renderRow = (title: string, icon: ReactNode, count?: number, fontMedium?: boolean) => (
  <div className="flex w-full items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">{icon}</span>
      <span className={`text-sm text-primary ${fontMedium ? "font-medium" : ""}`}>{title}</span>
    </div>
    {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
  </div>
);

const renderNodeIcon = (node: TPlanGroupTreeNode, resultColors?: Record<string, string>) => {
  if (node.kind === "type") return <Tag size={14} />;
  if (node.kind === "priority") return <Flag size={14} />;
  const dotClass = RESULT_DOT_CLASS[resultColors?.[node.id] || ""] || RESULT_DOT_CLASS.gray;
  return <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />;
};

/** 计划用例「按类型 / 优先级 / 执行结果分组」的左侧树：全部 / 各枚举值（含数量） */
export const PlanCaseGroupTree = ({ tree, loading = false, selectedKey, onSelect, resultColors }: Props) => {
  if (loading && !tree) return <div className="px-2 py-4 text-sm text-secondary">加载中...</div>;
  if (!tree) return null;

  const treeData = [
    {
      key: "root",
      title: renderRow(tree.name || "全部", <LayoutList size={14} />, tree.count, true),
      children: (tree.children || []).map((node) => ({
        key: `${node.kind}:${node.id}`,
        title: renderRow(node.name || "-", renderNodeIcon(node, resultColors), node.count),
      })),
    },
  ];

  return (
    <Tree
      defaultExpandAll
      showLine={false}
      switcherIcon={() => (
        <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
          <ChevronDownIcon className="size-4 rotate-0 transition-transform" strokeWidth={2.5} />
        </span>
      )}
      treeData={treeData}
      selectedKeys={[selectedKey]}
      onSelect={(keys) => {
        // 反选（再次点击已选节点）时回到「全部」
        const key = Array.isArray(keys) && keys.length > 0 ? String(keys[0]) : "root";
        onSelect(key);
      }}
      className="custom-tree-indent pr-2 pb-2"
    />
  );
};
