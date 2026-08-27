/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ScrollArea } from "@plane/propel/scrollarea";
import { cn } from "@plane/utils";
// components
import { AppHeader } from "@/components/core/app-header";

type Props = {
  children: React.ReactNode;
  header?: React.ReactNode;
  hugging?: boolean;
};

/**
 * 不加 max-width、不套 ScrollArea 的设置页外壳。
 *
 * 给自带滚动容器、需要占满可用宽高的设置页用（如需求类型的字段构建器：它是
 * 左中右三栏、内部各自滚动的布局，塞进 SettingsContentWrapper 的 900px 列会
 * 被压扁并出现双重滚动条）。**不要**把它合回 SettingsContentWrapper —— 那边的
 * 几何被十几个现有设置页依赖着。
 */
export function SettingsFullBleedContentWrapper(props: Pick<Props, "children" | "header">) {
  const { children, header } = props;

  return (
    <div className="@container flex size-full grow flex-col overflow-hidden">
      {header && (
        <div className="w-full shrink-0">
          <AppHeader header={header} />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

export function SettingsContentWrapper(props: Props) {
  const { children, header, hugging = false } = props;

  return (
    <div className="@container flex size-full grow flex-col overflow-hidden">
      {header && (
        <div className="w-full shrink-0">
          <AppHeader header={header} />
        </div>
      )}
      <ScrollArea scrollType="hover" orientation="vertical" size="sm" className="size-full grow overflow-y-scroll">
        <div
          className={cn("py-9", {
            "w-full px-page-x lg:px-12": hugging,
            "mx-auto w-full max-w-225 px-page-x @min-[58.95rem]:px-0": !hugging, // 58.95rem = max-width(56.25rem) + padding-x(1.35rem * 2)
          })}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
