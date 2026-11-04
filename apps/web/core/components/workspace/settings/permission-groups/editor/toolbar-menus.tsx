/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TCheckState } from "./use-permission-editor";

const TRIGGER =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-4 text-14 font-medium text-primary transition-colors hover:bg-layer-1-hover disabled:cursor-not-allowed disabled:opacity-50";
const PANEL = "rounded-lg border border-subtle bg-surface-1 py-1.5 shadow-overlay-200";

export type TBulkActionItem = {
  action: string;
  label: string;
  /** 可见模块里有这个动作的有几个、勾了几个 */
  total: number;
  checked: number;
};

const MENU_ITEM = "flex w-full items-center px-3 py-2 text-left text-14 text-primary hover:bg-layer-1-hover";

/** 「批量勾选 ▾」：全部勾选 / 全部清空，以及按动作一次勾 / 取消所有可见模块的同一个动作（例如全部「查看」） */
export function BulkActionMenu(props: {
  items: TBulkActionItem[];
  onToggle: (action: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const { items, onToggle, onSelectAll, onClearAll } = props;
  const [isOpen, setIsOpen] = useState(false);
  const stateOf = (item: TBulkActionItem): TCheckState =>
    item.checked === 0 ? "none" : item.checked === item.total ? "all" : "some";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button type="button" className={TRIGGER} disabled={items.length === 0}>
        批量勾选
        <ChevronDown className="size-3.5 text-tertiary" />
      </Popover.Button>
      <Popover.Panel placement="bottom-end" sideOffset={6} positionerClassName="z-30" className={cn(PANEL, "w-60")}>
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            setIsOpen(false);
            onSelectAll();
          }}
        >
          全部勾选
        </button>
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            setIsOpen(false);
            onClearAll();
          }}
        >
          全部清空
        </button>
        <div className="mx-1 my-1.5 h-px bg-subtle" />
        <p className="px-3 pt-0.5 pb-1 text-12 font-medium text-tertiary">按动作</p>
        {items.map((item) => {
          const state = stateOf(item);
          return (
            <label
              key={item.action}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-14 text-primary hover:bg-layer-1-hover"
            >
              <Checkbox
                checked={state === "all"}
                indeterminate={state === "some"}
                onChange={() => onToggle(item.action)}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 text-12 text-tertiary tabular-nums">
                {item.checked}/{item.total}
              </span>
            </label>
          );
        })}
      </Popover.Panel>
    </Popover>
  );
}

export type TCopySource = {
  id: string;
  name: string;
  /** 「系统」「模板」之类的小标 */
  badge?: string;
};

/** 「复制自…」：把另一个权限组当前这一段的勾选照搬过来（只改草稿，保存后才生效） */
export function CopyFromMenu(props: {
  sources: TCopySource[];
  isLoading?: boolean;
  onSelect: (source: TCopySource) => void;
}) {
  const { sources, isLoading = false, onSelect } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLowerCase();
  const visible = keyword ? sources.filter((source) => source.name.toLowerCase().includes(keyword)) : sources;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button type="button" className={TRIGGER} disabled={sources.length === 0 || isLoading}>
        {isLoading ? "复制中…" : "复制自…"}
      </Popover.Button>
      <Popover.Panel placement="bottom-end" sideOffset={6} positionerClassName="z-30" className={cn(PANEL, "w-64")}>
        <div className="px-2 pb-1.5">
          <input
            className="h-8 w-full rounded-md border border-subtle-1 bg-layer-2 px-2.5 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
            placeholder="搜索权限组"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-12 text-placeholder">没有可复制的权限组</p>
          ) : (
            visible.map((source) => (
              <button
                key={source.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-13 text-primary hover:bg-layer-1-hover"
                onClick={() => {
                  setIsOpen(false);
                  setQuery("");
                  onSelect(source);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{source.name}</span>
                {source.badge && (
                  <span className="shrink-0 rounded border border-subtle bg-layer-1 px-1.5 text-11 text-tertiary">
                    {source.badge}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
}
