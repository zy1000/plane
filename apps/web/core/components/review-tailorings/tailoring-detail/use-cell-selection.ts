import { useCallback, useState } from "react";
import type { TReviewTailoringItem } from "@plane/types";

export type TSelectionState = "none" | "some" | "all";

/**
 * 矩阵的批量选中。选中的单位是格子 id：整表 / 整列 / 整段 / 整行的复选框都只是往里加减一批格子，
 * 所以勾了一行再勾一列，得到的是两者的并集。
 *
 * 复选框的状态按「这一批格子里选中了几个」算：全选中是勾、选了一部分是半选。
 * 选中不改数据，保留 / 裁剪由底部操作条一次应用。
 */
export const useCellSelection = () => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const stateOf = useCallback(
    (cells: TReviewTailoringItem[]): TSelectionState => {
      let picked = 0;
      for (const cell of cells) if (selectedIds.has(cell.id)) picked += 1;
      if (picked === 0) return "none";
      return picked === cells.length ? "all" : "some";
    },
    [selectedIds]
  );

  /** 这批格子全选中了就整批取消，否则整批选中 */
  const toggle = useCallback((cells: TReviewTailoringItem[]) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allPicked = cells.length > 0 && cells.every((cell) => current.has(cell.id));
      for (const cell of cells) {
        if (allPicked) next.delete(cell.id);
        else next.add(cell.id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds((current) => (current.size > 0 ? new Set() : current)), []);

  return { selectedIds, stateOf, toggle, clear };
};

export type TCellSelection = ReturnType<typeof useCellSelection>;
