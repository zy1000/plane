"use client";

import { Folder } from "lucide-react";
import type { TModuleTreeNode } from "./types";

/** 「未归类」节点的默认 key，同时也是列表 / 筛选接口里 module_id 的取值（后端 UNASSIGNED_MODULE_ID） */
export const UNASSIGNED_MODULE_KEY = "none";
export const UNASSIGNED_MODULE_LABEL = "未归类";

/** 虚线文件夹：和真实模块的实线文件夹区分开，树节点与筛选选项共用 */
export const UnassignedModuleIcon = ({ className = "size-3.5" }: { className?: string }) => (
  <Folder className={className} strokeDasharray="3.2 2.6" />
);

/**
 * 在模块列表末尾追加「未归类」虚拟节点（module 为空的条目）。
 * 计数为 0 时不出现；一个模块都没有时也不出现（条目全是未归类，与「全部」重复，保留「还没有模块」空态）。
 * keepWhenEmpty（通常传「当前正选中它」）时保留，免得选中项凭空消失。
 */
export const appendUnassignedNode = (
  nodes: TModuleTreeNode[],
  count: number | undefined,
  options: { key?: string; keepWhenEmpty?: boolean } = {}
): TModuleTreeNode[] => {
  const key = options.key ?? UNASSIGNED_MODULE_KEY;
  if (!options.keepWhenEmpty && (!count || nodes.length === 0)) return nodes;
  return [
    ...nodes,
    {
      key,
      label: UNASSIGNED_MODULE_LABEL,
      count: count ?? 0,
      icon: <UnassignedModuleIcon />,
      muted: true,
      virtual: true,
    },
  ];
};
