/**
 * 「取值规则 / 动态取值」两种控件共用的外壳：四种形态的底色配方 + 挂到 body 的浮层。
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { cn } from "@plane/utils";
import type { TExpandableCellVariant } from "../expandable-cell";

export type TRuleControlVariant = TExpandableCellVariant;

/**
 * 点开浮层的那个格子。与 requirement-grid-shared 的 MULTI_SELECT_CLASS 同一套量化：
 * grid 铺满整格（hover / 焦点归格子管），compact 是详情页子表单里的小方框，
 * detail 静息无底色，modal 与建行弹窗其它控件同皮。
 */
export const RULE_TRIGGER_CLASS: Record<TRuleControlVariant, string> = {
  grid: "flex h-11 w-full min-w-0 items-center gap-1.5 rounded-none border-0 bg-transparent px-page-x text-left",
  compact:
    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-left transition-colors duration-150 hover:border-subtle hover:bg-layer-1 motion-reduce:transition-none",
  detail:
    "-mx-2 flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-left transition-colors duration-150 hover:bg-layer-transparent-hover motion-reduce:transition-none",
  modal:
    "flex h-[38px] w-full min-w-0 items-center gap-1.5 rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 text-left transition-colors duration-150 hover:border-strong motion-reduce:transition-none",
};

/** 浮层开着时的格子：grid 的描边归 td，这里不画 */
export const RULE_TRIGGER_OPEN_CLASS: Record<TRuleControlVariant, string> = {
  grid: "",
  compact: "!border-accent-strong bg-surface-1",
  detail: "!border-accent-strong bg-surface-1",
  modal: "!border-accent-strong",
};

/** 直接在格子里敲字的输入框外壳，焦点落在内部 input 上，所以用 focus-within */
export const RULE_INPUT_SHELL_CLASS: Record<TRuleControlVariant, string> = {
  grid: "flex h-11 w-full min-w-0 items-center gap-1.5 px-page-x",
  compact:
    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 transition-colors duration-150 hover:border-subtle hover:bg-layer-1 focus-within:border-accent-strong focus-within:bg-surface-1 motion-reduce:transition-none",
  detail:
    "-mx-2 flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 transition-colors duration-150 hover:bg-layer-transparent-hover focus-within:border-accent-strong focus-within:bg-surface-1 motion-reduce:transition-none",
  modal:
    "flex h-[38px] w-full min-w-0 items-center gap-1.5 rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 focus-within:border-accent-strong motion-reduce:transition-none",
};

export const ruleValueTextClass = (variant: TRuleControlVariant) =>
  variant === "detail" ? "text-body-xs-medium" : "text-13";

/** 规则上的「多选 / 可自定义」小标签 */
export const RuleFlagTags = ({ multiple, allowCustom }: { multiple: boolean; allowCustom: boolean }) => {
  if (!multiple && !allowCustom) return null;
  const tagClass = "shrink-0 rounded bg-accent-subtle px-1.5 py-px text-11 font-medium text-accent-primary";
  return (
    <>
      {multiple && <span className={tagClass}>多选</span>}
      {allowCustom && <span className={tagClass}>可自定义</span>}
    </>
  );
};

/**
 * 浮层。挂到 document.body 并带 data-prevent-outside-click —— 与 @plane/ui 的下拉同一做法：
 * 子表单那张表自己横滚（overflow-x-auto 会连纵向一起裁），抽屉靠外部点击关闭，
 * 两样都要求浮层不在宿主 DOM 里、且点在浮层上不算「点了外面」。
 */
export const RuleFloatingPanel = ({
  anchor,
  className,
  children,
}: {
  anchor: HTMLElement | null;
  className?: string;
  children: ReactNode;
}) => {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(anchor, panel, {
    placement: "bottom-start",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 12 } },
    ],
  });
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-prevent-outside-click
      ref={setPanel}
      style={styles.popper}
      {...attributes.popper}
      className={cn(
        "z-50 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 shadow-raised-200 focus:outline-none",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
};
