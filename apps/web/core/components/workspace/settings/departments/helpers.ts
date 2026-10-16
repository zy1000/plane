import type { TDepartmentNode, TDepartmentTree } from "@plane/types";

export const DEPARTMENTS_I18N = "workspace_settings.settings.departments";
export const UNASSIGNED_DEPARTMENT = "none";

/** 当前选中项的上下文：决定右栏头部、是否显示「包含子部门」和「部门」列 */
export type TDepartmentSelection =
  | { kind: "all"; count: number }
  | { kind: "unassigned"; count: number }
  | { kind: "center"; node: TDepartmentNode }
  | { kind: "department"; node: TDepartmentNode; parent: TDepartmentNode };

export const resolveSelection = (tree: TDepartmentTree | null, selected: string | null): TDepartmentSelection => {
  if (!tree || selected === null) return { kind: "all", count: tree?.total ?? 0 };
  if (selected === UNASSIGNED_DEPARTMENT) return { kind: "unassigned", count: tree.unassigned };
  for (const center of tree.tree) {
    if (center.id === selected) return { kind: "center", node: center };
    const child = center.children.find((item) => item.id === selected);
    if (child) return { kind: "department", node: child, parent: center };
  }
  return { kind: "all", count: tree.total };
};
