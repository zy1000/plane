"use client";

import { Library } from "lucide-react";
import type { TModuleTreeNode } from "./types";

/**
 * 把后端「root → 用例库 → 全部模块 → 模块 → 子模块」的树转成模块树节点（计划详情页 / 评审详情页共用）。
 * 根节点由树的固定首行承担，这里只返回用例库这一级起的节点；
 * 「全部模块」（repository_modules_all）这一层被拍平，子模块直接挂在用例库下。
 */
export const buildRepositoryModuleNodes = (tree: any, getKey: (node: any) => string): TModuleTreeNode[] => {
  if (!tree) return [];
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
      icon: isRepository ? <Library className="size-3.5" /> : undefined,
      children: visibleChildren.map(build),
    };
  };
  const topLevel: any[] = Array.isArray(tree?.children) ? tree.children : [];
  return topLevel.map(build);
};

/** 按 key 找节点文字，收起成窄条时竖排显示用 */
export const findModuleTreeLabel = (nodes: TModuleTreeNode[], key: string): string | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node.label;
    const found = findModuleTreeLabel(node.children ?? [], key);
    if (found) return found;
  }
  return undefined;
};
