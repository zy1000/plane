/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { TMyAccessVisibleSource } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { PermissionGroupSearch } from "../permission-groups/ui";
import { VisibleSourceChip } from "./chips";

/** 项目 / 产品共用的一行：名称、代号、来源 */
export type TVisibleItem = { id: string; name: string; identifier: string; sources: TMyAccessVisibleSource[] };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** 全部可见项目 / 全部可见产品 */
  title: string;
  /** 项目 / 产品：表头和搜索占位 */
  nameLabel: string;
  items: TVisibleItem[];
};

const matches = (item: TVisibleItem, keyword: string) =>
  item.name.toLowerCase().includes(keyword) ||
  item.identifier.toLowerCase().includes(keyword) ||
  item.sources.some((source) => source.group?.name.toLowerCase().includes(keyword));

/** 「查看全部」弹窗：全部可见项目 / 产品，带搜索 */
export function VisibilityModal({ isOpen, onClose, title, nameLabel, items }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? items.filter((item) => matches(item, keyword)) : items;
  }, [items, query]);

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-6 py-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-16 font-semibold text-primary">{title}</h3>
          <span className="text-13 text-tertiary tabular-nums">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGroupSearch
            value={query}
            onChange={setQuery}
            placeholder={`搜索${nameLabel}名或代号`}
            className="w-56"
          />
          <button
            type="button"
            aria-label="关闭"
            onClick={handleClose}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm max-h-[60vh] overflow-y-auto px-6 pb-4">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-14 text-placeholder">没有匹配的{nameLabel}</p>
        ) : (
          <table className="w-full table-fixed text-13">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="text-left text-12 text-tertiary">
                <th className="py-2.5 pr-3 font-medium">{nameLabel}</th>
                <th className="w-36 py-2.5 pr-3 font-medium">代号</th>
                <th className="w-[40%] py-2.5 font-medium">来源</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="truncate py-2 pr-3 text-primary" title={item.name}>
                    {item.name}
                  </td>
                  <td className="truncate py-2 pr-3 text-secondary">{item.identifier}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.sources.map((source, index) => (
                        <VisibleSourceChip key={`${source.type}-${source.group?.id ?? index}`} source={source} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ModalCore>
  );
}
