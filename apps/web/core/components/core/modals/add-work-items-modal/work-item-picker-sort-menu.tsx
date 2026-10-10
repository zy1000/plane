/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemPickerOrderBy } from "@plane/types";
import { cn } from "@plane/utils";
import type { TPickerSort } from "./use-work-item-picker";

const I18N = "work_item_picker.sort";

const FIELDS: TWorkItemPickerOrderBy[] = ["priority", "sequence_id", "target_date", "created_at", "updated_at"];

/** 「从高到低」这类方向文案按字段换说法：优先级 / 编号 / 日期 */
export const sortDirectionLabelKey = (orderBy: TWorkItemPickerOrderBy, order: "asc" | "desc") => {
  const family = orderBy === "priority" || orderBy === "sequence_id" ? orderBy : "date";
  return `${I18N}.${order}.${family}`;
};

const MenuItem = (props: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={props.active}
    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-13 text-primary hover:bg-layer-transparent-hover"
    onClick={props.onClick}
  >
    <span className="min-w-0 flex-1 truncate">{props.label}</span>
    {props.active && <Check className="size-3.5 shrink-0 text-accent-primary" />}
  </button>
);

/**
 * 排序下拉：字段 + 方向两段单选。浮层就地定位、不走 portal（长在 ModalCore 里，
 * portal 出去会被当成点了弹窗外面）；Esc 只关下拉。
 */
export const WorkItemPickerSortMenu = (props: { sort: TPickerSort; onChange: (sort: TPickerSort) => void }) => {
  const { sort, onChange } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetector(ref, () => setIsOpen(false));

  const handleEscape = (event: React.KeyboardEvent) => {
    if (!isOpen || event.key !== "Escape") return;
    // ModalCore 的 Dialog 在 window 上听 Esc，并跳过 defaultPrevented 的事件
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(false);
  };

  return (
    // Esc 挂在外层：打开后焦点还在触发按钮上，挂在浮层上接不到
    <div ref={ref} className="relative shrink-0" onKeyDown={handleEscape}>
      <button
        type="button"
        aria-expanded={isOpen}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border bg-surface-1 px-2.5 text-13 whitespace-nowrap hover:bg-layer-1",
          isOpen ? "border-accent-strong" : "border-subtle"
        )}
        onClick={() => setIsOpen((current) => !current)}
      >
        <ArrowUpDown className="size-3.5 shrink-0 text-placeholder" />
        <span className="text-tertiary">{t(`${I18N}.label`)}</span>
        <span className="font-medium text-accent-primary">{t(`${I18N}.fields.${sort.orderBy}`)}</span>
        <ChevronDown className="size-3.5 shrink-0 text-placeholder" />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
        >
          <p className="px-3 pt-2.5 pb-1 text-12 font-medium text-placeholder">{t(`${I18N}.field`)}</p>
          <div className="px-1 pb-1">
            {FIELDS.map((field) => (
              <MenuItem
                key={field}
                label={t(`${I18N}.fields.${field}`)}
                active={sort.orderBy === field}
                onClick={() => onChange({ orderBy: field, order: sort.order })}
              />
            ))}
          </div>
          <p className="border-t border-subtle px-3 pt-2.5 pb-1 text-12 font-medium text-placeholder">
            {t(`${I18N}.direction`)}
          </p>
          <div className="px-1 pb-1">
            {(["desc", "asc"] as const).map((order) => (
              <MenuItem
                key={order}
                label={t(sortDirectionLabelKey(sort.orderBy, order))}
                active={sort.order === order}
                onClick={() => onChange({ orderBy: sort.orderBy, order })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
