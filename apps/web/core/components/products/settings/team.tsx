/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useMember } from "@/hooks/store/use-member";
import { ProjectProductTeamService } from "@/services/project/project-product-team.service";
import { useProductsContext } from "../context";
import { ProductSettingsHeader } from "./header";

const productTeamService = new ProjectProductTeamService();

const MemberChips = observer(function MemberChips({ memberIds }: { memberIds: string[] }) {
  const { getUserDetails } = useMember();
  if (memberIds.length === 0) return <span className="text-placeholder">—</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {memberIds.map((memberId) => {
        const user = getUserDetails(memberId);
        return (
          <span key={memberId} className="flex items-center gap-1.5">
            <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="sm" />
            <span className="truncate text-13 text-primary">{user?.display_name ?? "未知成员"}</span>
          </span>
        );
      })}
    </div>
  );
});

/**
 * 产品设置「研发团队」（只读）：各关联项目的研发矩阵里，这个产品每个角色由谁负责。
 * 在项目设置「研发产品」里维护。
 */
export const ProductTeamSettings = observer(function ProductTeamSettings() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const { products } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  const { data, isLoading } = useSWR(
    workspaceSlug && productId ? `PRODUCT_TEAM_${workspaceSlug}_${productId}` : null,
    workspaceSlug && productId ? () => productTeamService.fetchProductTeam(workspaceSlug, productId) : null,
    { revalidateOnFocus: false }
  );

  // 只展示至少一个项目填了人的角色列，按字典顺序
  const columns = useMemo(() => {
    if (!data) return [];
    const used = new Set(data.projects.flatMap((project) => project.cells.map((cell) => cell.job_role_id)));
    return data.job_roles.filter((role) => used.has(role.id));
  }, [data]);

  const title = t("workspace_products.settings.navigation.teams");

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey="teams" />}>
      <PageHead title={product ? `${title} - ${product.name}` : title} />
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-semibold text-primary">{title}</h2>
          <p className="mt-1 text-13 text-tertiary">
            各关联项目里，这个产品的每个角色由谁负责。在项目设置「研发产品」里维护。
          </p>
        </div>
        {isLoading && !data ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-layer-1" />
            ))}
          </div>
        ) : !data || data.projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-subtle py-12 text-center text-13 text-tertiary">
            这个产品还没有关联项目
          </p>
        ) : columns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-subtle py-12 text-center text-13 text-tertiary">
            {data.projects.length} 个关联项目都还没填研发矩阵
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-subtle">
            <table className="min-w-full text-13">
              <thead className="bg-layer-1 text-left text-tertiary">
                <tr>
                  <th className="sticky left-0 min-w-48 bg-layer-1 px-4 py-2.5 font-medium">项目</th>
                  {columns.map((role) => (
                    <th key={role.id} className="min-w-36 px-4 py-2.5 font-medium whitespace-nowrap">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {data.projects.map((project) => {
                  const cellMap = new Map(project.cells.map((cell) => [cell.job_role_id, cell.member_ids]));
                  return (
                    <tr key={project.id} className="align-top">
                      <td className="sticky left-0 bg-surface-1 px-4 py-3">
                        <p className="font-medium text-primary">{project.name}</p>
                        <p className="text-12 text-tertiary">{project.identifier}</p>
                      </td>
                      {columns.map((role) => (
                        <td key={role.id} className="px-4 py-3">
                          <MemberChips memberIds={cellMap.get(role.id) ?? []} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
});
