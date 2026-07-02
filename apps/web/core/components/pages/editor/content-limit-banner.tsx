/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TriangleAlert } from "lucide-react";
import { cn } from "@plane/utils";

type Props = {
  className?: string;
  onDismiss?: () => void;
};

export function ContentLimitBanner({ className, onDismiss }: Props) {
  return (
    <div className={cn("text-sm flex items-center gap-2 border-b border-subtle-1 bg-layer-2 px-4 py-2.5", className)}>
      <div className="mx-auto flex items-center gap-2 text-secondary">
        <span className="text-amber-500">
          <TriangleAlert />
        </span>
        <span className="font-medium">内容已达到上限，实时同步已关闭。请新建笔记或使用子笔记继续同步。</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-placeholder hover:text-secondary"
          aria-label="关闭内容上限提示"
        >
          ✕
        </button>
      )}
    </div>
  );
}
