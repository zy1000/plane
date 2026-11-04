/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { CustomMenu } from "@plane/ui";
import { ProductTeamMatrixCell } from "./matrix-cell";
import type { useProductTeamMatrix } from "./use-product-team-matrix";

type Props = {
  projectId: string;
  matrix: ReturnType<typeof useProductTeamMatrix>;
  editable: boolean;
};

/** 产品研发矩阵：关联产品为行、角色为列，格子里是负责这个角色的项目成员 */
export const ProductTeamMatrix = observer(function ProductTeamMatrix({ projectId, matrix, editable }: Props) {
  const { data, isLoading, columns, hiddenRoles, addColumn, getCell, updateCell, memberCount } = matrix;
  const jobRoleMap = useMemo(() => new Map((data?.job_roles ?? []).map((role) => [role.id, role])), [data?.job_roles]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((index) => (
          <div key={index} className="h-14 animate-pulse rounded-md bg-layer-1" />
        ))}
      </div>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-subtle py-12 text-center text-13 text-tertiary">
        本项目还没有关联产品，先「关联产品」再填研发矩阵
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-14 font-semibold text-primary">产品研发矩阵</h2>
        <span className="text-13 text-tertiary">
          {data.products.length} 个产品 · {memberCount} 名成员
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="min-w-full border-collapse text-13">
          <thead className="bg-layer-1 text-left text-tertiary">
            <tr>
              <th className="sticky left-0 z-[1] min-w-48 border-r border-subtle bg-layer-1 px-4 py-2.5 font-medium">
                产品
              </th>
              {columns.map((role) => (
                <th key={role.id} className="min-w-36 px-4 py-2.5 font-medium whitespace-nowrap">
                  {role.label}
                </th>
              ))}
              <th className="w-28 px-3 py-2 font-medium">
                {editable && hiddenRoles.length > 0 && (
                  <CustomMenu
                    placement="bottom-end"
                    maxHeight="lg"
                    customButton={
                      <span className="inline-flex items-center gap-1 text-12 text-accent-primary hover:underline">
                        <Plus className="size-3" />
                        更多角色
                      </span>
                    }
                  >
                    {hiddenRoles.map((role) => (
                      <CustomMenu.MenuItem key={role.id} onClick={() => addColumn(role.id)}>
                        {role.label}
                      </CustomMenu.MenuItem>
                    ))}
                  </CustomMenu>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {data.products.map((product) => (
              <tr key={product.id} className="align-top">
                <td className="sticky left-0 z-[1] border-r border-subtle bg-surface-1 px-4 py-3">
                  <p className="font-medium text-primary">{product.name}</p>
                  <p className="text-12 text-tertiary">{product.identifier}</p>
                </td>
                {columns.map((role) => (
                  <td key={role.id} className="p-1">
                    <ProductTeamMatrixCell
                      projectId={projectId}
                      jobRole={role}
                      jobRoleMap={jobRoleMap}
                      memberIds={getCell(product.id, role.id)}
                      editable={editable}
                      onChange={(memberIds) =>
                        updateCell({ product_id: product.id, job_role_id: role.id, member_ids: memberIds })
                      }
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {columns.length === 0 && (
        <p className="text-13 text-tertiary">本项目成员还没有挂角色。点表头「更多角色」加列，或先在「成员」页给成员设置角色。</p>
      )}
    </div>
  );
});
