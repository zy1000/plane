import type { TRequirementModule } from "@plane/types";

/** 从模块树里按 id 取名字；建行弹窗回显用，不另拉接口 */
export const findRequirementModuleName = (
  modules: TRequirementModule[],
  moduleId: string | null | undefined
): string | null => {
  if (!moduleId) return null;
  for (const node of modules) {
    if (node.id === moduleId) return node.name;
    const nested = findRequirementModuleName(node.children ?? [], moduleId);
    if (nested) return nested;
  }
  return null;
};
