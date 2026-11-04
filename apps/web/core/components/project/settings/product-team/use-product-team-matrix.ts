/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import type { TProductTeamCell, TProjectProductTeamMatrix } from "@plane/types";
import { ProjectProductTeamService } from "@/services/project/project-product-team.service";

const productTeamService = new ProjectProductTeamService();

export const cellKey = (productId: string, jobRoleId: string) => `${productId}:${jobRoleId}`;

/**
 * 项目设置「研发产品」的矩阵数据。
 * 列默认只放本项目用得上的角色（有成员挂着或矩阵里已填），「更多角色」加的列只在本页会话里保留。
 * 改格子整格替换，先乐观更新、失败回滚。
 */
export const useProductTeamMatrix = (workspaceSlug: string, projectId: string) => {
  const swrKey = workspaceSlug && projectId ? `PROJECT_PRODUCT_TEAM_${workspaceSlug}_${projectId}` : null;
  const { data, isLoading, mutate } = useSWR<TProjectProductTeamMatrix>(
    swrKey,
    () => productTeamService.fetchMatrix(workspaceSlug, projectId),
    { revalidateOnFocus: false }
  );
  const [extraColumnIds, setExtraColumnIds] = useState<string[]>([]);

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map((cell) => [cellKey(cell.product_id, cell.job_role_id), cell.member_ids])),
    [data?.cells]
  );

  const columns = useMemo(() => {
    if (!data) return [];
    const visible = new Set([...data.used_job_role_ids, ...extraColumnIds]);
    return data.job_roles.filter((role) => visible.has(role.id));
  }, [data, extraColumnIds]);

  const hiddenRoles = useMemo(() => {
    const shown = new Set(columns.map((role) => role.id));
    return (data?.job_roles ?? []).filter((role) => !shown.has(role.id));
  }, [columns, data?.job_roles]);

  const memberIdsInMatrix = useMemo(
    () => new Set((data?.cells ?? []).flatMap((cell) => cell.member_ids)),
    [data?.cells]
  );

  const updateCell = useCallback(
    async (cell: TProductTeamCell) => {
      if (!data) return;
      const others = data.cells.filter(
        (item) => !(item.product_id === cell.product_id && item.job_role_id === cell.job_role_id)
      );
      const optimistic = { ...data, cells: cell.member_ids.length ? [...others, cell] : others };
      await mutate(
        async () => {
          const saved = await productTeamService.updateCell(workspaceSlug, projectId, cell);
          return { ...data, cells: saved.member_ids.length ? [...others, saved] : others };
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
      );
    },
    [data, mutate, projectId, workspaceSlug]
  );

  return {
    data,
    isLoading,
    refresh: () => mutate(),
    columns,
    hiddenRoles,
    addColumn: (jobRoleId: string) => setExtraColumnIds((current) => [...current, jobRoleId]),
    getCell: (productId: string, jobRoleId: string) => cellMap.get(cellKey(productId, jobRoleId)) ?? [],
    memberCount: memberIdsInMatrix.size,
    updateCell,
  };
};
