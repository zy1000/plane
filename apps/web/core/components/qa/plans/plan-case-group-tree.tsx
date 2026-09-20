/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo } from "react";
import { LayoutList } from "lucide-react";
import type { TPlanGroupTree, TPlanGroupTreeNode } from "@/services/qa/plan.service";
import { PlanCasePriorityBadge } from "./plan-case-priority-badge";
import { PlanCaseRailTree, type TPlanCaseRailTreeNode } from "./plan-case-rail-tree";
import { PlanCaseResultTag, PlanCaseReviewStatusTag } from "./plan-case-tags";

type Props = {
  tree: TPlanGroupTree | null;
  loading?: boolean;
  /** "root" | "<kind>:<枚举值>" */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 执行结果 → 颜色名（green/red/gold/gray） */
  resultColors?: Record<string, string>;
  /** 复核状态 → 颜色名 */
  reviewStatusColors?: Record<string, string>;
};

/** 节点标签：执行结果 / 复核状态用与列表同款的 tag，优先级用色块 + 文案，类型是纯文本 */
const renderNodeLabel = (
  node: TPlanGroupTreeNode,
  resultColors?: Record<string, string>,
  reviewStatusColors?: Record<string, string>
) => {
  if (node.kind === "priority") {
    return (
      <span className="flex items-center gap-2">
        <PlanCasePriorityBadge value={node.id} />
        <span>{node.name || "-"}</span>
      </span>
    );
  }
  if (node.kind === "result") return <PlanCaseResultTag value={node.name || node.id} colors={resultColors} />;
  if (node.kind === "review_status")
    return <PlanCaseReviewStatusTag value={node.name || node.id} colors={reviewStatusColors} />;
  return node.name || "-";
};

/** 计划用例「按类型 / 优先级 / 执行结果 / 复核状态分组」的左侧树：全部 / 各枚举值（含数量） */
export const PlanCaseGroupTree = ({
  tree,
  loading = false,
  selectedKey,
  onSelect,
  resultColors,
  reviewStatusColors,
}: Props) => {
  const nodes = useMemo<TPlanCaseRailTreeNode[]>(() => {
    if (!tree) return [];
    return [
      {
        key: "root",
        label: tree.name || "全部",
        count: tree.count,
        icon: <LayoutList className="size-3.5 text-tertiary" />,
        children: (tree.children || []).map((node) => ({
          key: `${node.kind}:${node.id}`,
          label: renderNodeLabel(node, resultColors, reviewStatusColors),
          count: node.count,
        })),
      },
    ];
  }, [tree, resultColors, reviewStatusColors]);

  if (loading && !tree) return <div className="px-2 py-4 text-13 text-secondary">加载中...</div>;
  if (!tree) return null;

  return <PlanCaseRailTree nodes={nodes} selectedKey={selectedKey} onSelect={onSelect} />;
};
