import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** 一列至少露出这么宽，才算「看得见」 */
const VISIBLE_EDGE = 48;

export type TMatrixScroll = {
  ref: RefObject<HTMLDivElement | null>;
  /** 已经往右滚了：首列要画投影 */
  isScrolled: boolean;
  /** 右边还有没露出来的列：右缘要画渐隐 */
  hasMore: boolean;
  /** 当前看得见的产品列序号（1-based），装得下时是 1..total */
  firstVisible: number;
  lastVisible: number;
  total: number;
  /** 整列翻页：把下一列（或上一列）顶到首列右边 */
  scrollByColumn: (direction: -1 | 1) => void;
};

type TState = Pick<TMatrixScroll, "isScrolled" | "hasMore" | "firstVisible" | "lastVisible" | "total">;

const INITIAL: TState = { isScrolled: false, hasMore: false, firstVisible: 0, lastVisible: 0, total: 0 };

/** 产品列在滚动内容里的左偏移（已扣掉 sticky 首列的宽度） */
const readColumnOffsets = (el: HTMLElement) => {
  const head = el.querySelector<HTMLElement>("[data-row-head]")?.offsetWidth ?? 0;
  // getBoundingClientRect 是视口坐标，减去这个原点才是滚动内容里的坐标
  const origin = el.getBoundingClientRect().left - el.scrollLeft;
  const columns = [...el.querySelectorAll<HTMLElement>("[data-product-col]")].map((column) => {
    const rect = column.getBoundingClientRect();
    return { left: rect.left - origin, right: rect.right - origin };
  });
  return { head, columns };
};

/**
 * 裁剪矩阵的横向滚动状态。首列投影、右缘渐隐、产品列翻页器读的是同一份测量。
 *
 * 列宽由表格自己分配（`min-w-[250px]` 起，剩余宽度均摊），所以一律实测列的位置，
 * 不按固定列宽推算 —— 产品少的时候列会被撑宽，算出来的序号会错位。
 *
 * `contentKey` 一变就重测：换 Tab、加减产品、折叠阶段都会改变表格宽度，
 * 而容器自身尺寸没变，ResizeObserver 不会响。
 */
export const useMatrixScroll = (contentKey: string): TMatrixScroll => {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TState>(INITIAL);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { head, columns } = readColumnOffsets(el);
    const viewLeft = el.scrollLeft + head;
    const viewRight = el.scrollLeft + el.clientWidth;
    let firstVisible = 0;
    let lastVisible = 0;
    columns.forEach((column, index) => {
      if (column.right - viewLeft < VISIBLE_EDGE || viewRight - column.left < VISIBLE_EDGE) return;
      if (!firstVisible) firstVisible = index + 1;
      lastVisible = index + 1;
    });
    const next: TState = {
      isScrolled: el.scrollLeft > 1,
      hasMore: el.scrollWidth - el.clientWidth - el.scrollLeft > 1,
      firstVisible,
      lastVisible,
      total: columns.length,
    };
    setState((current) =>
      current.isScrolled === next.isScrolled &&
      current.hasMore === next.hasMore &&
      current.firstVisible === next.firstVisible &&
      current.lastVisible === next.lastVisible &&
      current.total === next.total
        ? current
        : next
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setState(INITIAL);
      return;
    }
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync, contentKey]);

  const scrollByColumn = useCallback((direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const { head, columns } = readColumnOffsets(el);
    const targets = columns.map((column) => column.left - head);
    const target =
      direction === 1
        ? targets.find((left) => left > el.scrollLeft + 4)
        : [...targets].reverse().find((left) => left < el.scrollLeft - 4);
    if (target === undefined) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  return { ref, ...state, scrollByColumn };
};
