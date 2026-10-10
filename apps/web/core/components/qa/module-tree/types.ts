import type { ReactNode } from "react";

/** 「全部」固定首行的默认 key，与三个列表页原有的 "all" 语义一致 */
export const MODULE_TREE_ROOT_KEY = "all";

export type TModuleTreeNode = {
  key: string;
  /** 纯文本名称：用于单行省略、title 提示和搜索高亮 */
  label: string;
  count?: number;
  /** 展开符后面的小图标（如计划详情页的用例库） */
  icon?: ReactNode;
  /** 没有子节点时顶替展开符位置的元素（头像 / 色点 / 优先级块） */
  leading?: ReactNode;
  /** 名称加粗（用例库这类上一级实体） */
  emphasis?: boolean;
  /** 显式禁止拖动；默认跟随面板的 dragMode */
  draggable?: boolean;
  children?: TModuleTreeNode[];
};

export type TModuleTreeMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

/** 行内编辑态：新建挂在 parentKey 的子级末尾（parentKey 为根 key 表示一级），重命名替换该行 */
export type TModuleTreeEditing =
  | { kind: "create"; parentKey: string }
  | { kind: "rename"; key: string; initialValue: string }
  | null;

/** none：不可拖；reparent：只能拖到节点上换父级；sort：还能拖到前后间隙排序 */
export type TModuleTreeDragMode = "none" | "reparent" | "sort";

export type TModuleTreeDropPosition = "into" | "before" | "after";

export type TModuleTreeDropEvent = {
  dragKey: string;
  /** 落点节点；position 为 into 且 targetKey 为根 key 表示移到一级 */
  targetKey: string;
  position: TModuleTreeDropPosition;
};
