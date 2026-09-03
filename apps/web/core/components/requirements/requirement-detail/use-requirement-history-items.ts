import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTrailEntry, TRequirementTypeSchema, TRequirementVersion } from "@plane/types";
import {
  applyHistoryFilter,
  buildHistoryItems,
  countHistory,
  sortVersionsDesc,
  type THistoryFilter,
} from "./requirement-history-model";
import { diffSnapshotFields, type TSnapshotDiff } from "./requirement-snapshot-diff";

/**
 * 历史区的派生数据：统一条目、过滤结果、计数、每条改动的字段 diff。
 * 全部 useMemo，一次算好给整条时间线用；diff 尤其不能在每行的渲染里重算。
 */
export const useRequirementHistoryItems = ({
  trail,
  versions,
  requirementType,
  approvedVersion,
  filter,
}: {
  trail: TRequirementTrailEntry[];
  versions: TRequirementVersion[];
  requirementType: TRequirementTypeSchema | null;
  approvedVersion: number | null;
  filter: THistoryFilter;
}) => {
  const { t } = useTranslation();
  // useTranslation 每次返回新的函数标识；用 ref 取最新的 t，memo 依赖才稳定
  const tRef = useRef(t);
  tRef.current = t;
  const labelOf = useCallback((key: string) => tRef.current(key), []);

  const items = useMemo(
    () => buildHistoryItems({ trail, versions, requirementType, approvedVersion }),
    [approvedVersion, requirementType, trail, versions]
  );
  const counts = useMemo(() => countHistory(items), [items]);
  const visibleItems = useMemo(() => applyHistoryFilter(items, filter), [filter, items]);
  const sortedVersions = useMemo(() => sortVersionsDesc(versions), [versions]);

  const builtinLayout = requirementType?.builtin_fields ?? null;
  const diffByItemId = useMemo(() => {
    const map = new Map<string, TSnapshotDiff>();
    for (const item of items) {
      if (item.kind !== "change") continue;
      map.set(item.id, diffSnapshotFields(item.before, item.after, { fields: item.fields, builtinLayout }, labelOf));
    }
    return map;
  }, [builtinLayout, items, labelOf]);

  return { items, visibleItems, counts, sortedVersions, diffByItemId };
};
