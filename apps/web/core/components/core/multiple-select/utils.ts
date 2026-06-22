/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TEntityDetails } from "@/hooks/use-multiple-select";

/**
 * @description 把当前已选中、但不在 entities 中的实体（典型为子工作项）按其真实 groupID 追加进 entities 末尾。
 *
 * 用于解决：直接勾选子工作项后，useMultipleSelect 的清理 effect 因该 ID 不在 entitiesList 中而立即将其移除。
 * 追加在分组末尾，不会影响 shift 区间选择（不会误选折叠隐藏的子项），仅保证已选项进入 entityIdSet 不被清理。
 * 这是甘特图 main-content 中 `[...blockIds, ...selectedEntityIds]` 做法的多分组泛化版。
 *
 * @param baseEntities 原始的 { groupID: entityIds[] } 映射（通常仅含顶层项）
 * @param selectedEntityIds 当前选中的实体 ID 列表
 * @param getEntityDetailsFromEntityID 由 multipleSelect store 提供，用于取回实体真实所属分组
 */
export const getEntitiesWithSelected = (
  baseEntities: Record<string, string[]>,
  selectedEntityIds: string[],
  getEntityDetailsFromEntityID: (entityID: string) => TEntityDetails | null
): Record<string, string[]> => {
  if (!selectedEntityIds || selectedEntityIds.length === 0) return baseEntities;

  let mutated = false;
  const result: Record<string, string[]> = { ...baseEntities };

  for (const entityID of selectedEntityIds) {
    const details = getEntityDetailsFromEntityID(entityID);
    if (!details) continue;
    const { groupID } = details;
    const group = result[groupID];
    // 仅向已存在的分组追加，且避免重复
    if (!group || group.includes(entityID)) continue;
    result[groupID] = [...group, entityID];
    mutated = true;
  }

  return mutated ? result : baseEntities;
};
