/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ReactNode } from "react";
import { Tree } from "antd";
import { User, UserX, Users } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TPlanAssigneeTree } from "@/services/qa/plan.service";

type Props = {
  tree: TPlanAssigneeTree | null;
  loading?: boolean;
  /** "root" | "assignee:<userId>" | "unassigned" */
  selectedKey: string;
  onSelect: (key: string) => void;
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

/** 计划用例「按执行人分组」的左侧树：全部 / 各执行人 / 未分配 */
export const PlanCaseAssigneeTree = ({ tree, loading = false, selectedKey, onSelect }: Props) => {
  if (loading && !tree) return <div className="px-2 py-4 text-sm text-secondary">加载中...</div>;
  if (!tree) return null;

  const treeData = [
    {
      key: "root",
      title: renderRow(tree.name || "全部", <Users size={14} />, tree.count, true),
      children: (tree.children || []).map((node) => ({
        key: node.kind === "unassigned" ? "unassigned" : `assignee:${node.id}`,
        title: renderRow(
          node.name || "-",
          node.kind === "unassigned" ? <UserX size={14} /> : <User size={14} />,
          node.count
        ),
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
