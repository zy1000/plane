/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@plane/utils";

type TColumn<T> = {
  key: string;
  content: string;
  /** 列宽（px）。表格按固定列宽排版，容器更宽时按比例放大，更窄时横向滚动 */
  width?: number;
  thRender?: () => ReactNode;
  tdRender: (rowData: T) => ReactNode;
};

type Props<T> = {
  data: T[];
  columns: TColumn<T>[];
  keyExtractor: (rowData: T) => string;
  tHeadClassName?: string;
  tHeadTrClassName?: string;
  thClassName?: string;
  tBodyClassName?: string;
  tBodyTrClassName?: string;
};

// 首次渲染用的估计行高，挂载后按真实高度量
const ESTIMATED_ROW_HEIGHT = 48;

/**
 * 成员表：只渲染滚动视口附近的行。
 *
 * 工作区八百多人时每行都挂着角色 / 团队下拉、⋯ 菜单等组件，全量铺开是四万多个节点，
 * 进页会冻住好几秒。样式与 @plane/ui 的 Table 一致；滚动仍由设置页外壳的 ScrollArea 负责，
 * 表体用上下两个占位行撑出整表高度。
 */
export function MembersVirtualTable<T>(props: Props<T>) {
  const {
    data,
    columns,
    keyExtractor,
    tHeadClassName = "",
    tHeadTrClassName = "",
    thClassName = "",
    tBodyClassName = "",
    tBodyTrClassName = "",
  } = props;
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const getScrollElement = () => tbodyRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

  // 表体在滚动内容里的起点（上面是页头和表头），虚拟列表据此换算哪些行在视口里
  useLayoutEffect(() => {
    const scrollElement = getScrollElement();
    const tbody = tbodyRef.current;
    if (!scrollElement || !tbody) return;
    setScrollMargin(
      tbody.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop
    );
  }, []);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
    getItemKey: (index) => keyExtractor(data[index]),
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin) : 0;

  return (
    <table className="w-full table-fixed overflow-hidden whitespace-nowrap">
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead className={cn("divide-y divide-subtle", tHeadClassName)}>
        <tr className={cn("divide-x divide-subtle text-13 text-primary", tHeadTrClassName)}>
          {columns.map((column) => (
            <th key={column.key} className={cn("px-2.5 py-2", thClassName)}>
              {(column.thRender && column.thRender()) || column.content}
            </th>
          ))}
        </tr>
      </thead>
      <tbody ref={tbodyRef} className={cn("divide-y divide-subtle", tBodyClassName)}>
        {paddingTop > 0 && <tr aria-hidden style={{ height: paddingTop }} />}
        {virtualRows.map((virtualRow) => {
          const item = data[virtualRow.index];
          const key = keyExtractor(item);
          return (
            <tr
              key={key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={cn("divide-x divide-subtle text-13 text-secondary", tBodyTrClassName)}
            >
              {columns.map((column) => (
                <td key={`${column.key}-${key}`} className="px-2.5 py-2">
                  {column.tdRender(item)}
                </td>
              ))}
            </tr>
          );
        })}
        {paddingBottom > 0 && <tr aria-hidden style={{ height: paddingBottom }} />}
      </tbody>
    </table>
  );
}
