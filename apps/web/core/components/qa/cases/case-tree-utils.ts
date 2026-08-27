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
