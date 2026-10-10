"use client";

import { Library, UserX } from "lucide-react";
import { cn } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import type { TModuleTreeNode } from "@/components/qa/module-tree";
import type { TPlanAssigneeTree, TPlanGroupTree, TPlanGroupTreeNode } from "@/services/qa/plan.service";
import { PlanCasePriorityBadge } from "./plan-case-priority-badge";

/** 后端下发的颜色名 → 色点配色（与列表标签同色系） */
const DOT_COLOR_CLASS: Record<string, string> = {
  green: "bg-success-primary",
  red: "bg-danger-primary",
  gold: "bg-warning-primary",
  orange: "bg-warning-primary",
  blue: "bg-accent-primary",
  gray: "bg-layer-3 ring-1 ring-strong ring-inset",
  default: "bg-layer-3 ring-1 ring-strong ring-inset",
};

const RESULT_FALLBACK_COLOR: Record<string, string> = {
  成功: "green",
  通过: "green",
  失败: "red",
  不通过: "red",
  阻塞: "gold",
  复核中: "blue",
};

const Dot = ({ color }: { color?: string }) => (
  <span className={cn("size-2 rounded-full", DOT_COLOR_CLASS[color || "default"] ?? DOT_COLOR_CLASS.default)} />
);

/**
 * 按模块：计划 → 用例库 → 模块 → 子模块。根节点由树的固定首行承担，这里只返回用例库这一级起的节点；
 * 「全部模块」（repository_modules_all）这一层被拍平，子模块直接挂在用例库下。
 */
export const buildPlanCaseModuleNodes = (planTree: any, getKey: (node: any) => string): TModuleTreeNode[] => {
  if (!planTree) return [];
  const build = (node: any): TModuleTreeNode => {
    const kind = String(node?.kind || "");
    const children: any[] = Array.isArray(node?.children) ? node.children : [];
    const visibleChildren = children.flatMap((child) =>
      String(child?.kind || "") === "repository_modules_all"
        ? Array.isArray(child?.children)
          ? child.children
          : []
        : [child]
    );
    const isRepository = kind === "repository";
    return {
      key: getKey(node),
      label: String(node?.name ?? "-"),
      count: typeof node?.count === "number" ? node.count : undefined,
      icon: isRepository ? <Library className="size-3.5" strokeWidth={1.75} /> : undefined,
      emphasis: isRepository,
      children: visibleChildren.map(build),
    };
  };
  const topLevel: any[] = Array.isArray(planTree?.children) ? planTree.children : [];
  return topLevel.map(build);
};

/** 按执行人：各执行人（头像）+ 未分配 */
export const buildPlanCaseAssigneeNodes = (tree: TPlanAssigneeTree | null): TModuleTreeNode[] => {
  if (!tree) return [];
  return (tree.children || []).map((node) => ({
    key: node.kind === "unassigned" ? "unassigned" : `assignee:${node.id}`,
    label: node.name || "-",
    count: node.count,
    leading:
      node.kind === "unassigned" ? (
        <span className="flex size-[18px] items-center justify-center rounded-full bg-layer-3 text-tertiary">
          <UserX className="size-3" strokeWidth={2} />
        </span>
      ) : (
        <ButtonAvatars showTooltip={false} userIds={String(node.id)} size="md" />
      ),
  }));
};

/** 按类型 / 优先级 / 执行结果 / 复核状态：优先级用色块，结果与复核状态用色点，类型是纯文本 */
export const buildPlanCaseGroupNodes = (
  tree: TPlanGroupTree | null,
  resultColors?: Record<string, string>,
  reviewStatusColors?: Record<string, string>
): TModuleTreeNode[] => {
  if (!tree) return [];
  const leadingFor = (node: TPlanGroupTreeNode) => {
    const name = node.name || node.id;
    if (node.kind === "priority") return <PlanCasePriorityBadge value={node.id} className="size-4 text-10" />;
    if (node.kind === "result") return <Dot color={resultColors?.[name] ?? RESULT_FALLBACK_COLOR[name]} />;
    if (node.kind === "review_status") return <Dot color={reviewStatusColors?.[name] ?? RESULT_FALLBACK_COLOR[name]} />;
    return undefined;
  };
  return (tree.children || []).map((node) => ({
    key: `${node.kind}:${node.id}`,
    label: node.name || "-",
    count: node.count,
    leading: leadingFor(node),
  }));
};

/** 按 key 找节点文字，收起成窄条时竖排显示用 */
export const findPlanCaseTreeLabel = (nodes: TModuleTreeNode[], key: string): string | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node.label;
    const found = findPlanCaseTreeLabel(node.children ?? [], key);
    if (found) return found;
  }
  return undefined;
};
