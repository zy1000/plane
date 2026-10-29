import { useCallback, useEffect, useState } from "react";

/** 描述是富文本，挤在格子里看不全，默认收起（与「全部」视图一致），要看再从「显示」勾回 */
const DEFAULT_HIDDEN_IDS = ["description_html"];

const getStorageKey = (projectId: string, requirementTypeId: string) =>
  `project-requirements-type-columns__${projectId}__${requirementTypeId}`;

const readHiddenIds = (storageKey: string | null): string[] => {
  if (!storageKey || typeof window === "undefined") return DEFAULT_HIDDEN_IDS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return DEFAULT_HIDDEN_IDS;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : DEFAULT_HIDDEN_IDS;
  } catch {
    return DEFAULT_HIDDEN_IDS;
  }
};

/**
 * 类型视图的列显隐，按「项目 × 需求类型」各存一份 —— 不同类型字段不同，混存会互相覆盖。
 * id 口径同产品类型视图：内置列用 key（status / module …），自定义字段与子表字段用 UUID，
 * 项目侧特有的列用 product / issues / approval。
 */
export const useProjectRequirementTypeColumns = (projectId: string, requirementTypeId: string | null) => {
  const storageKey = requirementTypeId ? getStorageKey(projectId, requirementTypeId) : null;
  const [state, setState] = useState(() => ({ storageKey, hiddenIds: readHiddenIds(storageKey) }));

  // 换类型时同步换成那一类记住的列，渲染期就换，不等 effect 多画一帧旧列
  const current = state.storageKey === storageKey ? state : { storageKey, hiddenIds: readHiddenIds(storageKey) };
  if (current !== state) setState(current);

  useEffect(() => {
    if (!state.storageKey) return;
    try {
      window.localStorage.setItem(state.storageKey, JSON.stringify(state.hiddenIds));
    } catch {
      // 隐私模式等写不进去：本次会话照常生效即可
    }
  }, [state]);

  const toggleColumn = useCallback(
    (id: string) =>
      setState((previous) => ({
        ...previous,
        hiddenIds: previous.hiddenIds.includes(id)
          ? previous.hiddenIds.filter((item) => item !== id)
          : [...previous.hiddenIds, id],
      })),
    []
  );

  return { hiddenIds: current.hiddenIds, toggleColumn };
};
