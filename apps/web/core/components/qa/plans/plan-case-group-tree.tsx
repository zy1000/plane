/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ReactNode } from "react";
import { Tag, Tree } from "antd";
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Flag, LayoutList, Tag as TagIcon } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TPlanGroupTree, TPlanGroupTreeNode } from "@/services/qa/plan.service";

type Props = {
  tree: TPlanGroupTree | null;
  loading?: boolean;
  /** "root" | "<kind>:<枚举值>" */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 执行结果 → 颜色名（green/red/gold/gray），用于结果节点的图标与 Tag */
  resultColors?: Record<string, string>;
};

/** 类型 / 优先级 Tag 配色，列表列与分组树共用 */
export const PLAN_CASE_TYPE_TAG_COLOR = "magenta";
export const PLAN_CASE_PRIORITY_TAG_COLOR = "warning";

/** 执行结果颜色名 → 节点图标：成功 / 失败 / 阻塞 / 未执行、无效 */
const RESULT_ICONS: Record<string, ReactNode> = {
  green: <CircleCheck size={14} />,
  red: <CircleX size={14} />,
  gold: <CircleAlert size={14} />,
  gray: <CircleDashed size={14} />,
};

const renderRow = (label: ReactNode, icon: ReactNode, count?: number) => (
  <div className="flex w-full items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">{icon}</span>
      {label}
    </div>
    {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
  </div>
);

const renderNodeIcon = (node: TPlanGroupTreeNode, resultColors?: Record<string, string>) => {
  if (node.kind === "type") return <TagIcon size={14} />;
  if (node.kind === "priority") return <Flag size={14} />;
  return RESULT_ICONS[resultColors?.[node.id] || ""] || RESULT_ICONS.gray;
};

/** 与列表里对应列的 Tag 配色一致；执行结果的 gray 不是 antd 预设色，退回 default */
const getNodeTagColor = (node: TPlanGroupTreeNode, resultColors?: Record<string, string>) => {
  if (node.kind === "type") return PLAN_CASE_TYPE_TAG_COLOR;
  if (node.kind === "priority") return PLAN_CASE_PRIORITY_TAG_COLOR;
  const color = resultColors?.[node.id] || "gray";
  return color === "gray" ? "default" : color;
};

/** 计划用例「按类型 / 优先级 / 执行结果分组」的左侧树：全部 / 各枚举值（含数量） */
export const PlanCaseGroupTree = ({ tree, loading = false, selectedKey, onSelect, resultColors }: Props) => {
  if (loading && !tree) return <div className="px-2 py-4 text-sm text-secondary">加载中...</div>;
  if (!tree) return null;

  const treeData = [
    {
      key: "root",
      title: renderRow(
        <span className="text-sm font-medium text-primary">{tree.name || "全部"}</span>,
        <LayoutList size={14} />,
        tree.count
      ),
      children: (tree.children || []).map((node) => ({
        key: `${node.kind}:${node.id}`,
        title: renderRow(
          <Tag color={getNodeTagColor(node, resultColors)} className="m-0">
            {node.name || "-"}
          </Tag>,
          renderNodeIcon(node, resultColors),
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
