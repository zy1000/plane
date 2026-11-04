/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Button } from "@plane/propel/button";

type Props = {
  count: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

/**
 * 权限有改动时从内容区底部浮出的保存条：「N 处修改未保存 · 放弃 / 保存」。
 * 样式同项目设置常规页的保存条（project/settings/general/save-bar.tsx）。
 */
export function PermissionGroupSaveBar({ count, isSaving, onDiscard, onSave }: Props) {
  return (
    <div className="pointer-events-none sticky bottom-5 z-10 mt-6 flex justify-center">
      <div className="pointer-events-auto flex h-15 w-full max-w-150 animate-fade-in items-center gap-2.5 rounded-[14px] border border-subtle bg-surface-1 pr-3 pl-5.5 shadow-[0_20px_48px_-12px_rgba(20,30,45,0.28),0_2px_8px_rgba(20,30,45,0.08)]">
        <span className="size-2 shrink-0 rounded-full bg-accent-primary ring-[3px] ring-accent-subtle" aria-hidden="true" />
        <span className="text-14 font-medium text-primary">{count} 处权限修改未保存</span>
        <span className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xl"
            className="h-9.5 px-4 text-14"
            onClick={onDiscard}
            disabled={isSaving}
          >
            放弃
          </Button>
          <Button
            type="button"
            variant="primary"
            size="xl"
            className="h-9.5 px-4.5 text-14 font-semibold"
            loading={isSaving}
            onClick={onSave}
          >
            保存
          </Button>
        </span>
      </div>
    </div>
  );
}
