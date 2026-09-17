/**
 * 按节点 `name` 递归过滤 antd Tree 节点（不区分大小写 contains）：
 * 命中节点保留完整子树；未命中但有子孙命中时只保留命中的子链；q 为空原样返回。
 * 供「复制模块」「复制用例」等目标选择树的前端搜索共用。
 */
export const filterTree = (nodes: any[], q: string): any[] => {
  if (!q) return nodes;
  const query = q.trim().toLowerCase();
  const walk = (list: any[]): any[] =>
    (list || [])
      .map((n) => {
        const childMatches = walk(n?.children || []);
        const selfMatch = String(n?.name || "").toLowerCase().includes(query);
        if (selfMatch || childMatches.length) {
          return { ...n, children: selfMatch ? n?.children || [] : childMatches };
        }
        return null;
      })
      .filter(Boolean) as any[];
  return walk(nodes);
};

/** 在模块树（`{ id, children }` 嵌套）里按 id 找节点 */
export const findModuleById = (nodes: any[], id: string): any | undefined => {
  for (const node of nodes || []) {
    if (String(node?.id) === id) return node;
    const found = findModuleById(node?.children || [], id);
    if (found) return found;
  }
  return undefined;
};

/** 模块的父级 id：根级返回 null，找不到返回 undefined */
export const findModuleParentId = (nodes: any[], id: string, parentId: string | null = null): string | null | undefined => {
  for (const node of nodes || []) {
    if (String(node?.id) === id) return parentId;
    const found = findModuleParentId(node?.children || [], id, String(node?.id));
    if (found !== undefined) return found;
  }
  return undefined;
};

/** targetId 是否为 module 自身或其子孙 */
export const isModuleInSubtree = (module: any, targetId: string): boolean => {
  if (!module) return false;
  if (String(module.id) === targetId) return true;
  return (module.children || []).some((child: any) => isModuleInSubtree(child, targetId));
};
