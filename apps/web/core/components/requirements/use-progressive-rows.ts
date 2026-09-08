import { startTransition, useEffect, useReducer, useRef } from "react";

/**
 * 首屏「先上前菜」：rows 从空变成有的那一次渲染只画前面一截，其余放进 transition 补齐。
 *
 * 需求网格一页 120 行 / 855 格，一次性 commit 要 ~400ms，画完之前屏幕上什么都没有。
 * 拆成两步：第一步同步画约一屏（budget 个 tr）立刻上屏；第二步在 startTransition 里画
 * 剩下的 —— transition 渲染按时间分片让出主线程，补齐期间页面照常能滚能点。
 *
 * 只在「从空到有」时分批。翻页 / 搜索 / 单元格保存回填时旧行还在、整批换新，本来就不会
 * 空白；那时候分批反而会闪一下（120 → 24 → 120）。
 *
 * 按 weigh 累加到 budget 截取，不数条数：带子表单的需求一条展开好几行，4 条就是一屏；
 * 没有子表单的网格 20 条才一屏，那时首批就是全部，天然不分批。
 */
export const useProgressiveRows = <T>(
  rows: T[],
  { budget, weigh }: { budget: number; weigh: (row: T) => number }
): T[] => {
  /** 上一次 commit 时的 rows 引用。渲染期只读，effect 里写 */
  const lastCommittedRef = useRef(rows);
  /** 只为触发补齐那一次渲染 */
  const [, reveal] = useReducer((tick: number) => tick + 1, 0);

  const isFirstFill = rows !== lastCommittedRef.current && lastCommittedRef.current.length === 0;
  const visibleRows = isFirstFill ? takeUpToBudget(rows, budget, weigh) : rows;

  useEffect(() => {
    lastCommittedRef.current = rows;
    if (visibleRows !== rows) startTransition(() => reveal());
  }, [rows, visibleRows]);

  return visibleRows;
};

/** 累加权重到 budget 为止截断；至少留 1 条；全部加起来都不到 budget 就原样返回 */
const takeUpToBudget = <T>(rows: T[], budget: number, weigh: (row: T) => number): T[] => {
  let total = 0;
  for (let index = 0; index < rows.length - 1; index += 1) {
    total += weigh(rows[index]);
    if (total >= budget) return rows.slice(0, index + 1);
  }
  return rows;
};
