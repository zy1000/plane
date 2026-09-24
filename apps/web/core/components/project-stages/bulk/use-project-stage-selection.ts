import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 列表勾选状态。`selectableIds` 是表格里**看得见**的行；折叠、搜索之后勾着的只留仍然看得见的，
 * 批量条上的「已选 N 项」永远和打勾的行对得上。口径同阶段评审。
 */
export const useProjectStageSelection = (selectableIds: string[]) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => selectableSet.has(id));
      return next.length === current.length ? current : next;
    });
  }, [selectableSet]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));
  const someSelected = !allSelected && selectableIds.some((id) => selectedSet.has(id));

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : selectableIds);
  }, [allSelected, selectableIds]);

  const clear = useCallback(() => setSelectedIds([]), []);

  return { selectedIds, selectedSet, allSelected, someSelected, toggle, toggleAll, clear, replace: setSelectedIds };
};
