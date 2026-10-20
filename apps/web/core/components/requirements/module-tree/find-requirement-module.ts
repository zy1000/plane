import type { TRequirementModule } from "@plane/types";
import { UNASSIGNED_MODULE_KEY } from "@/components/qa/module-tree";

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

/** 选中「未归类」时没有真实模块：新建需求等写路径一律当作不挂模块，绝不能把 "none" 当模块 id 提交 */
export const toAssignableModuleId = (moduleId: string | null | undefined): string | null =>
  !moduleId || moduleId === UNASSIGNED_MODULE_KEY ? null : moduleId;
