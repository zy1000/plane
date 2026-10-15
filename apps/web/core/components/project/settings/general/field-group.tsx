/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type Props = {
  title: string;
  className?: string;
  children: ReactNode;
};

/**
 * 项目设置常规页的字段分组：组名靠左一列，字段靠右；组与组之间一条分隔线。
 * 表单的五组、危险操作区、成员只读视图共用。
 */
export function ProjectSettingsGroup(props: Props) {
  const { title, className, children } = props;
  return (
    <section
      className={cn(
        "grid grid-cols-1 gap-y-3 border-t border-subtle py-7 md:grid-cols-[128px_minmax(0,1fr)] md:gap-x-8",
        className
      )}
    >
      <h3 className="text-14 leading-5 font-semibold text-primary">{title}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
