/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { type ComponentType, type ReactNode, useState } from "react";
// utils
import { cn } from "@plane/utils";

/** 分组折叠标题：二级标题加粗 + 可折叠箭头，风格对齐设计稿（属性 > 详情 / 项目结构 …） */
export function PropertyGroupSection(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const { title, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 text-body-sm-semibold text-primary outline-none hover:text-primary focus-visible:outline-none"
      >
        <span>{title}</span>
        <span
          className={cn(
            "h-0 w-0 border-t-[5px] border-r-[4px] border-l-[4px] border-t-black border-r-transparent border-l-transparent transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
          aria-hidden
        />
      </button>
      {open && <div className="mt-2 w-full space-y-2">{children}</div>}
    </section>
  );
}

// 「结构」三行共用 grid：否则迭代行含 TransferHopInfo 会单独撑宽该行标签列，三行控件左缘无法对齐。
export function StructureFieldLabel(props: {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  append?: ReactNode;
}) {
  const { icon: Icon, label, append } = props;

  return (
    <div className="flex h-7.5 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
      <Icon className="size-4 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {append != null ? <span className="inline-flex shrink-0">{append}</span> : null}
    </div>
  );
}

export function StructureFieldValue(props: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1">{props.children}</div>;
}
