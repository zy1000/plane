/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo } from "react";
import { UserX, Users } from "lucide-react";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import type { TPlanAssigneeTree } from "@/services/qa/plan.service";
import { PlanCaseRailTree, type TPlanCaseRailTreeNode } from "./plan-case-rail-tree";

type Props = {
  tree: TPlanAssigneeTree | null;
  loading?: boolean;
  /** "root" | "assignee:<userId>" | "unassigned" */
  selectedKey: string;
  onSelect: (key: string) => void;
};

/** 计划用例「按执行人分组」的左侧树：全部 / 各执行人 / 未分配 */
export const PlanCaseAssigneeTree = ({ tree, loading = false, selectedKey, onSelect }: Props) => {
  const nodes = useMemo<TPlanCaseRailTreeNode[]>(() => {
    if (!tree) return [];
    return [
      {
        key: "root",
        label: tree.name || "全部",
        count: tree.count,
        icon: <Users className="size-3.5 text-tertiary" />,
        children: (tree.children || []).map((node) => ({
          key: node.kind === "unassigned" ? "unassigned" : `assignee:${node.id}`,
          label: node.name || "-",
          count: node.count,
          icon:
            node.kind === "unassigned" ? (
              <span className="flex size-[18px] items-center justify-center rounded-full bg-layer-3 text-tertiary">
                <UserX className="size-3" />
              </span>
            ) : (
              <ButtonAvatars showTooltip={false} userIds={String(node.id)} size="md" />
            ),
        })),
      },
    ];
  }, [tree]);

  if (loading && !tree) return <div className="px-2 py-4 text-13 text-secondary">加载中...</div>;
  if (!tree) return null;

  return <PlanCaseRailTree nodes={nodes} selectedKey={selectedKey} onSelect={onSelect} />;
};
