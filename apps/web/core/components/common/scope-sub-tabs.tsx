/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ComponentType } from "react";
import { cn } from "@plane/utils";

/**
 * 页面**内部**的二级切换条（迭代范围 / 发布内容页里的「工作项 | 需求」）。
 *
 * 刻意做成分段控件（track + 白色滑块）而不是下划线页签：一级导航已经是下划线样式，
 * 再套一条同款会分不清层级。视觉语言取自 issues/defects/defect-quick-filter-bar.tsx，
 * 与仓库里其余「一行内切换」的控件同款。
 *
 * 高度契约：本组件 flex-shrink-0，把剩余高度整块留给下方内容 —— 工作项布局
 * （CycleLayoutRoot / ReleaseLayoutRoot）要求父容器高度是确定的，看板更是垂直不滚，
 * 容器一旦被压成 auto 高度整个塌掉。所以调用方必须用
 * `flex h-full flex-col` + 内容区 `min-h-0 flex-1` 的写法。
 */

export type TScopeSubTab<K extends string> = {
  key: K;
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  count?: number;
};

type TProps<K extends string> = {
  tabs: TScopeSubTab<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
};

export const ScopeSubTabs = <K extends string>({ tabs, value, onChange, className }: TProps<K>) => (
  <div
    className={cn(
      "flex flex-shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-4 py-1.5",
      className
    )}
  >
    <div className="flex items-center gap-1 rounded-lg bg-surface-2/50 p-0.5">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-3 text-body-xs-medium transition-colors",
              isActive ? "bg-surface-1 text-primary shadow-sm" : "text-secondary hover:text-primary"
            )}
          >
            {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
            <span className="whitespace-nowrap">{tab.label}</span>
            {typeof tab.count === "number" && (
              // 计数为 0 也照常显示：「需求 0」本身就是要传达的信息
              <span className={cn("tabular-nums", isActive ? "text-accent-primary" : "text-placeholder")}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
