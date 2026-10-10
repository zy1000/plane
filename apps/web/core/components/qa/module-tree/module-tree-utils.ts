import type { TModuleTreeNode } from "./types";

/** 按名称过滤：命中节点保留完整子树，未命中但子孙命中时只留命中链；query 为空原样返回 */
export const filterModuleTree = (nodes: TModuleTreeNode[], query: string): TModuleTreeNode[] => {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list: TModuleTreeNode[]): TModuleTreeNode[] =>
    list.flatMap((node) => {
      const selfMatch = node.label.toLowerCase().includes(q);
      const childMatches = walk(node.children ?? []);
      if (selfMatch) return [{ ...node, children: node.children ?? [] }];
      if (childMatches.length) return [{ ...node, children: childMatches }];
      return [];
    });
  return walk(nodes);
};

/** 节点索引：key → 节点 / 父 key，供拖拽校验与祖先展开 */
export const indexModuleTree = (nodes: TModuleTreeNode[]) => {
  const nodeByKey = new Map<string, TModuleTreeNode>();
  const parentByKey = new Map<string, string | null>();
  const visit = (list: TModuleTreeNode[], parentKey: string | null) => {
    list.forEach((node) => {
      nodeByKey.set(node.key, node);
      parentByKey.set(node.key, parentKey);
      visit(node.children ?? [], node.key);
    });
  };
  visit(nodes, null);
  return { nodeByKey, parentByKey };
};

/** targetKey 是否为 node 自身或其子孙 */
export const isInSubtree = (node: TModuleTreeNode | undefined, targetKey: string): boolean => {
  if (!node) return false;
  if (node.key === targetKey) return true;
  return (node.children ?? []).some((child) => isInSubtree(child, targetKey));
};

/** 自顶向下的祖先 key 列表（不含自身）；找不到返回 null */
export const collectAncestorKeys = (nodes: TModuleTreeNode[], targetKey: string): string[] | null => {
  const walk = (list: TModuleTreeNode[], trail: string[]): string[] | null => {
    for (const node of list) {
      if (node.key === targetKey) return trail;
      const found = walk(node.children ?? [], [...trail, node.key]);
      if (found) return found;
    }
    return null;
  };
  return walk(nodes, []);
};

/** 所有带子节点的 key，用于搜索时强制全展开 */
export const collectBranchKeys = (nodes: TModuleTreeNode[]): string[] => {
  const keys: string[] = [];
  const visit = (list: TModuleTreeNode[]) => {
    list.forEach((node) => {
      if (node.children?.length) {
        keys.push(node.key);
        visit(node.children);
      }
    });
  };
  visit(nodes);
  return keys;
};
