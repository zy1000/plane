import type { NodeObj } from "mind-elixir";

export const ALL_EXTENDED_MENU_IDS = [
  "新增用例",
  "新增步骤",
  "在上方插入步骤",
  "在下方插入步骤",
  "新增前置条件",
  "新增文本描述",
  "新增备注",
  "切换为步骤模式",
  "切换为文本模式",
  "重命名模块",
  "删除",
] as const;

export const findNodeById = (nodeId: string, root?: NodeObj): NodeObj | null => {
  if (!root || !nodeId) return null;
  if (root.id === nodeId) return root;
  const children = Array.isArray(root.children) ? root.children : [];
  for (const child of children) {
    const found = findNodeById(nodeId, child);
    if (found) return found;
  }
  return null;
};

export const resolveCaseMode = (input: { current?: unknown; latest?: unknown }): number => {
  const latest = typeof input.latest === "number" ? input.latest : undefined;
  const current = typeof input.current === "number" ? input.current : undefined;
  return latest ?? current ?? 0;
};

export const getContextMenuVisibility = (input: {
  nodeId: string;
  mode: number;
}): { allowed: string[]; deleteLabel: string } => {
  const { nodeId, mode } = input;
  if (nodeId === "me-root") {
    return { allowed: ["新增用例"], deleteLabel: "删除" };
  }

  if (nodeId.startsWith("module:")) {
    return { allowed: ["新增用例", "重命名模块"], deleteLabel: "删除" };
  }

  if (nodeId.startsWith("case:")) {
    if (mode === 1) {
      return { allowed: ["新增文本描述", "切换为步骤模式", "删除"], deleteLabel: "删除" };
    }
    return {
      allowed: ["新增用例", "新增步骤", "新增前置条件", "新增备注", "切换为文本模式", "删除"],
      deleteLabel: "删除",
    };
  }

  if (
    (nodeId.startsWith("caseprop:") && nodeId.endsWith(":precondition")) ||
    (nodeId.startsWith("caseprop:") && nodeId.endsWith(":remark"))
  ) {
    return { allowed: ["删除"], deleteLabel: "清空文本" };
  }

  if (nodeId.startsWith("stepdesc:")) {
    return { allowed: ["在上方插入步骤", "在下方插入步骤", "删除"], deleteLabel: "清空文本" };
  }

  return { allowed: [], deleteLabel: "删除" };
};
