/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
import type { TNotifyMode } from "@/types/notify";
import { NOTIFY_MODE_LABELS } from "./constants";

/** 接收方式标签：即时邮件强调色，每日摘要中性色 */
export function NotifyModeTag({ mode }: { mode: TNotifyMode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-12 whitespace-nowrap",
        mode === "instant" ? "bg-accent-subtle font-medium text-accent-primary" : "bg-layer-1 text-secondary"
      )}
    >
      {NOTIFY_MODE_LABELS[mode]}
    </span>
  );
}
