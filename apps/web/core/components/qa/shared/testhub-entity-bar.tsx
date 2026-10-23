"use client";

import type { ReactNode } from "react";
import { Breadcrumbs } from "@plane/ui";
import { cn } from "@plane/utils";

type TEntityBarProps = {
  /** 实体类型图标，放在路径最前面 */
  icon?: ReactNode;
  /** 路径项：`Breadcrumbs.Item` 列表，末项是当前对象（名字或切换下拉） */
  children: ReactNode;
  /** 右侧：当前对象的状态与关键信息 */
  meta?: ReactNode;
  className?: string;
};

/**
 * 测试管理二级页的实体栏，紧贴页签行下方：
 * 左边是所属页签以下的路径（页签名不再重复），末项是当前对象；右边是对象的状态和关键信息。
 * 本页操作不放这里，用 `TestHubHeaderActions` portal 到页签行右侧。
 */
export function TestHubEntityBar({ icon, children, meta, className }: TEntityBarProps) {
  return (
    <div
      className={cn(
        "flex h-12 flex-shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-4",
        className
      )}
    >
      {icon && <span className="flex size-4 shrink-0 items-center justify-center text-tertiary">{icon}</span>}
      <Breadcrumbs className="min-w-0 grow-0">{children}</Breadcrumbs>
      {meta && <div className="ml-auto flex shrink-0 items-center gap-4 pl-4">{meta}</div>}
    </div>
  );
}

/** 路径末项：当前对象名（不可切换时用） */
function Current({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("max-w-[360px] truncate px-1.5 text-14 font-semibold text-primary", className)}>
      {children}
    </span>
  );
}

/** 右侧信息项：灰色标签 + 深色值 */
function Meta({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-12 text-tertiary">
      {label}
      <span className="inline-flex items-center gap-1.5 text-13 font-medium text-primary">{children}</span>
    </span>
  );
}

function Divider() {
  return <span className="h-3.5 w-px bg-layer-3" />;
}

TestHubEntityBar.Current = Current;
TestHubEntityBar.Meta = Meta;
TestHubEntityBar.Divider = Divider;
