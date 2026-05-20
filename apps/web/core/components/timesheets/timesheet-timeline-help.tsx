/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Popover } from "antd";
import {
  ArrowLeftRight,
  ChevronsUpDown,
  Copy,
  HelpCircle,
  MousePointerClick,
  Move,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@plane/utils";

type THelpItem = {
  icon: LucideIcon;
  label: string;
  description: string;
};

const TIMELINE_HELP_ITEMS: THelpItem[] = [
  {
    icon: MousePointerClick,
    label: "单击空白时段",
    description: "新建工时（弹出选择工作项/项目的弹窗）",
  },
  {
    icon: Move,
    label: "拖动工时块",
    description: "改变开始/结束时间，按 30 分钟对齐",
  },
  {
    icon: ArrowLeftRight,
    label: "横向拖到其他日期列",
    description: "把工时移到那一天",
  },
  {
    icon: ChevronsUpDown,
    label: "拖动块的上下边缘",
    description: "调整时长（至少 30 分钟）",
  },
  {
    icon: Copy,
    label: "按住 Ctrl / ⌘ 再拖动",
    description: "复制一条工时到目标位置",
  },
  {
    icon: Pencil,
    label: "双击工时块",
    description: "编辑备注",
  },
  {
    icon: Trash2,
    label: "悬停工时块右上角",
    description: "出现删除按钮",
  },
];

type TTimesheetTimelineHelpProps = {
  className?: string;
};

function TimelineHelpContent() {
  return (
    <div className="w-[320px] py-1">
      <p className="px-1 pb-2 text-sm font-semibold text-primary">时间线操作</p>
      <ul className="space-y-2.5">
        {TIMELINE_HELP_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-layer-1 text-secondary">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-primary">{item.label}</p>
                <p className="text-xs leading-snug text-tertiary">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-subtle pt-2.5 text-xs leading-snug text-tertiary">
        工时按 30 分钟自动对齐；超出可填报范围的日期不可拖入。
      </p>
    </div>
  );
}

export function TimesheetTimelineHelp({ className }: TTimesheetTimelineHelpProps) {
  return (
    <Popover
      trigger={["hover", "click"]}
      placement="bottomRight"
      arrow={false}
      content={<TimelineHelpContent />}
    >
      <button
        type="button"
        className={cn(className, "gap-1.5")}
        title="时间线操作技巧"
        aria-label="时间线操作技巧"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-sm">操作技巧</span>
      </button>
    </Popover>
  );
}
