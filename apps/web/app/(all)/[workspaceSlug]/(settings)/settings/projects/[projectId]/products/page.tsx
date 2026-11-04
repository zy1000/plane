/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProductTeamMatrix } from "@/components/project/settings/product-team/product-team-matrix";
import { useProductTeamMatrix } from "@/components/project/settings/product-team/use-product-team-matrix";
import { ProjectProductsModal } from "@/components/projects/products/project-products-modal";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProducts } from "@/hooks/store/use-products";
import { useProject } from "@/hooks/store/use-project";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { ProductsProjectSettingsHeader } from "./header";

/** 项目设置「产品」：关联产品 × 角色的研发矩阵（只用来找人：审批人按角色、评审候选人） */
function ProjectProductsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const { currentProjectDetails, getProjectById } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const {
    project: { fetchProjectMembers },
  } = useMember();

  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.products.permissionKeys ?? [], workspaceSlug, projectId);
  const canManage = allowProjectPermissionKeys(
    PROJECT_SETTINGS.products.editPermissionKeys ?? [],
    workspaceSlug,
    projectId
  );

  // 格子里选人要用项目成员与他们的角色
  useSWR(canView ? `PROJECT_SETTINGS_MEMBERS_${projectId}` : null, () => fetchProjectMembers(workspaceSlug, projectId), {
    revalidateOnFocus: false,
  });
  const matrix = useProductTeamMatrix(canView ? workspaceSlug : "", projectId);

  // 「关联产品」弹窗（与项目「产品」页同一个）
  const { links, isMutating, updateProducts } = useProjectProducts({
    workspaceSlug: canManage ? workspaceSlug : undefined,
    projectId,
  });
  const { products, isLoading: isProductsLoading } = useProducts(isLinkModalOpen ? workspaceSlug : undefined);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper
      header={<ProductsProjectSettingsHeader canLink={canManage} onLink={() => setIsLinkModalOpen(true)} />}
      hugging
    >
      <PageHead title={currentProjectDetails?.name ? `${currentProjectDetails.name} - 产品` : undefined} />
      <ProductTeamMatrix projectId={projectId} matrix={matrix} editable={canManage} />

      {canManage && (
        <ProjectProductsModal
          isOpen={isLinkModalOpen}
          products={products}
          isProductsLoading={isProductsLoading}
          links={links}
          projectCode={getProjectById(projectId)?.code?.trim() ?? ""}
          isSubmitting={isMutating}
          handleClose={() => setIsLinkModalOpen(false)}
          onSubmit={async (payload) => {
            await updateProducts(payload);
            await matrix.refresh();
            setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新关联产品" });
          }}
        />
      )}
    </SettingsContentWrapper>
  );
}

export default observer(ProjectProductsSettingsPage);
