"use client";

import type { ReactNode } from "react";
import type { TreeProps } from "antd";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

/**
 * 还得用 antd Tree 的地方（弹窗里的级联勾选、脑图页的多选模块）套这层皮，样子与 ModuleTree 一致：
 * 整行 28 高、圆角整行底色、每层缩进 16、无连接线、箭头 + 图标 + 名称 + 计数，13 号常规字、选中加粗。
 * 用法：<Tree className={MODULE_TREE_SKIN_CLASS} switcherIcon={moduleTreeSwitcherIcon} … />，
 * 节点 title 用 ModuleTreeTitle，页面里渲染一次 <ModuleTreeSkinStyles />。
 */
export const MODULE_TREE_SKIN_CLASS = "module-tree-skin";

export const moduleTreeSwitcherIcon: TreeProps["switcherIcon"] = (nodeProps) =>
  nodeProps.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />;

type TModuleTreeTitleProps = {
  label: ReactNode;
  /** 不传默认文件夹；传 null 不占图标位 */
  icon?: ReactNode | null;
  count?: number;
  /** 灰字（空用例库、兜底分组） */
  muted?: boolean;
  /** 计数后面的附加内容（如选中勾） */
  suffix?: ReactNode;
  /** 悬停提示；label 是纯文本时默认用它 */
  title?: string;
};

export const ModuleTreeTitle = ({ label, icon, count, muted = false, suffix, title }: TModuleTreeTitleProps) => (
  <span
    className="flex h-7 min-w-0 items-center gap-[7px]"
    title={title ?? (typeof label === "string" ? label : undefined)}
  >
    {icon !== null && (
      <span className="module-tree-skin-icon grid size-3.5 shrink-0 place-items-center text-tertiary">
        {icon ?? <Folder className="size-3.5" />}
      </span>
    )}
    {/* 选中加粗、计数变深色在 SKIN_CSS 里按 ant-tree-treenode-selected 处理；不走 cn，免得字号与颜色类互吞 */}
    <span className={`module-tree-skin-name min-w-0 flex-1 truncate text-13 ${muted ? "text-tertiary" : ""}`}>
      {label}
    </span>
    {typeof count === "number" && (
      <span
        className={`module-tree-skin-count min-w-[24px] shrink-0 text-center text-xs tabular-nums ${
          muted ? "text-placeholder" : "text-tertiary"
        }`}
      >
        {count}
      </span>
    )}
    {suffix}
  </span>
);

const SKIN_CSS = `
.ant-tree.module-tree-skin { background: transparent; color: var(--txt-secondary); font-size: 14px; }
.module-tree-skin .ant-tree-list-holder-inner { align-items: stretch !important; }
.module-tree-skin .ant-tree-treenode {
  width: 100%; min-height: 28px; margin-bottom: 1px !important; padding: 0 6px !important;
  align-items: center !important; line-height: 28px; border-radius: 6px; transition: background-color 0.15s ease;
}
.module-tree-skin .ant-tree-treenode:not(.ant-tree-treenode-disabled):hover { background: var(--bg-layer-transparent-hover); color: var(--txt-primary); }
.module-tree-skin .ant-tree-treenode.ant-tree-treenode-selected { background: var(--bg-layer-transparent-active); color: var(--txt-primary); }
.module-tree-skin .ant-tree-treenode-selected .module-tree-skin-icon { color: var(--txt-primary); }
.module-tree-skin .ant-tree-treenode-selected .module-tree-skin-name { font-weight: 500; color: var(--txt-primary); }
.module-tree-skin .ant-tree-treenode-selected .module-tree-skin-count { font-weight: 500; color: var(--txt-primary); }
.module-tree-skin .ant-tree-treenode-disabled { color: var(--txt-placeholder); }
.module-tree-skin .ant-tree-indent { align-self: stretch; }
.module-tree-skin .ant-tree-indent-unit { width: 16px !important; }
.module-tree-skin .ant-tree-switcher {
  width: 14px !important; height: 28px; margin-inline-end: 4px !important; align-self: center;
  display: flex; align-items: center; justify-content: center; color: var(--txt-tertiary);
}
.module-tree-skin .ant-tree-switcher::before { display: none !important; }
.module-tree-skin .ant-tree-switcher:not(.ant-tree-switcher-noop):hover { color: var(--txt-primary); }
.module-tree-skin .ant-tree-checkbox { align-self: center; margin: 0 8px 0 0 !important; }
.module-tree-skin .ant-tree-node-content-wrapper {
  flex: 1 1 auto; min-width: 0; min-height: 28px !important; padding: 0 !important; line-height: 28px;
  display: flex; align-items: center; background: transparent !important; color: inherit !important;
}
.module-tree-skin .ant-tree-treenode-disabled .ant-tree-node-content-wrapper { color: var(--txt-placeholder) !important; }
.module-tree-skin .ant-tree-title { flex: 1 1 auto; min-width: 0; display: block; }
`;

export const ModuleTreeSkinStyles = () => <style dangerouslySetInnerHTML={{ __html: SKIN_CSS }} />;
