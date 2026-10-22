import { useCallback, useEffect, useState } from "react";
import { getColumnStorageKey, readHiddenColumns } from "./project-requirements-columns";
import type { TProjectRequirementColumnKey } from "./project-requirements-columns";

/**
 * 项目需求网格的列显隐。按项目存 localStorage；视图页签切视图时整份替换。
 */
export const useProjectRequirementColumns = (projectId: string | undefined) => {
  const [hiddenColumns, setHiddenColumns] = useState<TProjectRequirementColumnKey[]>(() =>
    projectId ? readHiddenColumns(projectId) : []
  );

  // 切项目时要换成那个项目的偏好，否则会把上一个项目的勾选带过去
  useEffect(() => {
    if (projectId) setHiddenColumns(readHiddenColumns(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    window.localStorage.setItem(getColumnStorageKey(projectId), JSON.stringify(hiddenColumns));
  }, [hiddenColumns, projectId]);

  const toggleColumn = useCallback(
    (key: TProjectRequirementColumnKey) =>
      setHiddenColumns((current) =>
        current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
      ),
    []
  );

  return { hiddenColumns, setHiddenColumns, toggleColumn };
};
