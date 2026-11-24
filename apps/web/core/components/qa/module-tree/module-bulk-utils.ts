import type { TBulkModuleItem, TBulkModuleResult } from "@/services/qa/module-bulk.types";
import type { TModuleTreeNode } from "./types";

/** 与后端各模块表 name 的 max_length 一致 */
export const MODULE_NAME_MAX_LENGTH = 30;

export type { TBulkModuleItem, TBulkModuleResult };

export type TBulkPreviewRow = { key: string; label: string; depth: number; isNew: boolean; tooLong: boolean };
export type TBulkSkip = { name: string; reason: "exists" | "duplicate" };

export type TBulkPreview = {
  items: TBulkModuleItem[];
  /** 父级下的预览行（不含父级本身），depth 从 0 起 */
  rows: TBulkPreviewRow[];
  skipped: TBulkSkip[];
  createCount: number;
  tooLong: string[];
  maxDepth: number;
};

/** 一行的缩进级数：Tab 算一级，两个空格算一级 */
const indentOf = (line: string) => {
  let level = 0;
  let spaces = 0;
  for (const char of line) {
    if (char === "\t") {
      level += 1;
      spaces = 0;
    } else if (char === " " || char === "　") {
      spaces += char === "　" ? 2 : 1;
      if (spaces >= 2) {
        level += 1;
        spaces = 0;
      }
    } else break;
  }
  return level;
};

/** 多行文本 → 缩进树。缩进跳级（比上一行多缩两级以上）按多一级算；空行忽略 */
export const parseIndentedModules = (raw: string): TBulkModuleItem[] => {
  const roots: TBulkModuleItem[] = [];
  const stack: TBulkModuleItem[][] = [roots];
  for (const line of raw.split(/\r?\n/)) {
    const name = line.trim();
    if (!name) continue;
    const depth = Math.min(indentOf(line), stack.length - 1);
    stack.length = depth + 1;
    const item: TBulkModuleItem = { name, children: [] };
    stack[depth].push(item);
    stack.push(item.children);
  }
  return roots;
};

/**
 * 预览：把输入树并到上级模块已有的子树上，口径同后端 utils/module_bulk —— 同级已有同名的沿用（已存在），
 * 输入里同级写了两遍的合并（重复），新模块排在同级已有模块之后。
 */
export const buildBulkPreview = (raw: string, existingChildren: TModuleTreeNode[]): TBulkPreview => {
  const items = parseIndentedModules(raw);
  const rows: TBulkPreviewRow[] = [];
  const skipped: TBulkSkip[] = [];
  const tooLong: string[] = [];
  let createCount = 0;
  let maxDepth = 0;

  type TMergeNode = { label: string; isNew: boolean; existing: TModuleTreeNode[]; incoming: TBulkModuleItem[] };

  const walk = (existing: TModuleTreeNode[], incoming: TBulkModuleItem[], depth: number, keyPrefix: string) => {
    const merged: TMergeNode[] = existing.map((node) => ({
      label: node.label,
      isNew: false,
      existing: node.children ?? [],
      incoming: [],
    }));
    const byName = new Map(merged.map((node) => [node.label, node]));
    for (const item of incoming) {
      const hit = byName.get(item.name);
      if (hit) {
        skipped.push({ name: item.name, reason: hit.isNew ? "duplicate" : "exists" });
        hit.incoming.push(...item.children);
        continue;
      }
      const node: TMergeNode = { label: item.name, isNew: true, existing: [], incoming: [...item.children] };
      merged.push(node);
      byName.set(item.name, node);
    }
    merged.forEach((node, index) => {
      const key = `${keyPrefix}/${index}`;
      // 已有模块只在有新下级挂进来时才展开它的子树，否则只占一行
      if (!node.isNew && node.incoming.length === 0) {
        rows.push({ key, label: node.label, depth, isNew: false, tooLong: false });
        return;
      }
      const isTooLong = node.isNew && node.label.length > MODULE_NAME_MAX_LENGTH;
      if (node.isNew) {
        createCount += 1;
        maxDepth = Math.max(maxDepth, depth + 1);
        if (isTooLong) tooLong.push(node.label);
      }
      rows.push({ key, label: node.label, depth, isNew: node.isNew, tooLong: isTooLong });
      walk(node.isNew ? [] : node.existing, node.incoming, depth + 1, key);
    });
  };

  walk(existingChildren, items, 0, "r");
  return { items, rows, skipped, createCount, tooLong, maxDepth };
};

/** Tab / Shift+Tab：插入缩进 / 去掉当前行（或选中各行）的一级缩进。返回新文本与光标位置 */
export const applyIndentKey = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean
): { value: string; start: number; end: number } => {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const multiLine = value.slice(selectionStart, selectionEnd).includes("\n");
  if (!outdent && !multiLine) {
    return {
      value: `${value.slice(0, selectionStart)}\t${value.slice(selectionEnd)}`,
      start: selectionStart + 1,
      end: selectionStart + 1,
    };
  }
  const block = value.slice(lineStart, selectionEnd);
  const lines = block.split("\n");
  let firstDelta = 0;
  let totalDelta = 0;
  const next = lines.map((line, index) => {
    if (!outdent) {
      totalDelta += 1;
      if (index === 0) firstDelta = 1;
      return `\t${line}`;
    }
    const removed = line.startsWith("\t") ? 1 : line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
    totalDelta -= removed;
    if (index === 0) firstDelta = -removed;
    return line.slice(removed);
  });
  return {
    value: `${value.slice(0, lineStart)}${next.join("\n")}${value.slice(selectionEnd)}`,
    start: Math.max(lineStart, selectionStart + firstDelta),
    end: selectionEnd + totalDelta,
  };
};
