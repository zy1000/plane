"use client";

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Header, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import {
  RequirementApprovalPanel,
  RequirementDetailContent,
  RequirementDetailProperties,
  RequirementIssuesByProject,
  useRequirementDetail,
} from "@/components/requirements/requirement-detail";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useProductRequirements } from "@/hooks/store/use-product-requirements";
import { useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";
import { useAppRouter } from "@/hooks/use-app-router";
import { SubmitReviewModal } from "./approval/submit-review-modal";
import { useRequirementApprovalActions } from "./approval/use-requirement-approval-actions";

/**
 * 需求详情整页。
 *
 * 与抽屉共用 RequirementDetailContent，差别只有两处：属性从横条挪进右栏，描述不折叠。
 * 深链进来时网格没加载过，行数据由 useRequirementDetail 自己按 id 取。
 */
export const ProductRequirementDetailPage = observer(function ProductRequirementDetailPage() {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { workspaceSlug, productId, requirementId } = useParams();
  const slug = workspaceSlug ?? "";
  const product = productId ?? "";

  const store = useProductRequirements({ workspaceSlug, productId });
  const detail = useRequirementDetail({
    workspaceSlug: slug,
    productId: product,
    requirementId: requirementId ?? null,
  });
  const { requirement } = detail;

  const requirementType = useMemo(
    () => store.requirementTypes.find((item) => item.id === requirement?.requirement_type_id) ?? null,
    [requirement?.requirement_type_id, store.requirementTypes]
  );
  /** 能不能改需求条目；具体这一行还要看它自己在不在评审中 */
  const canEdit = Boolean(store.policy?.can_edit);
  const isEditable = canEdit && !(requirement?.is_locked ?? false);

  const knownRows = useMemo(() => (requirement ? [requirement, ...detail.children] : []), [detail.children, requirement]);
  const parentTitles = useRequirementTitles({
    workspaceSlug: slug,
    entityKind: "product",
    entityId: product,
    knownRows,
    parentIds: detail.parentIds,
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);

  const openRequirement = useCallback(
    (nextId: string) => router.push(`/${slug}/products/${product}/requirements/${nextId}`),
    [product, router, slug]
  );

  /** 详情页也要能推动评审 —— 与网格行菜单是同一套动作的两个入口 */
  const changesStore = useRequirementChangeRequests({ workspaceSlug, productId });
  const approvalActions = useRequirementApprovalActions({
    changesStore,
    onSettled: () => void detail.refresh(),
  });
  const openChangeRequest = useCallback(
    (changeRequestId: string) =>
      router.push(`/${slug}/products/${product}/requirements?tab=changes&cr=${changeRequestId}`),
    [product, router, slug]
  );

  return (
    <>
      <PageHead title={requirement?.title || t("requirement_detail.untitled")} />
      <AppHeader
        header={
          <Header className="min-w-0">
            <Header.LeftItem className="max-w-none min-w-0 flex-nowrap gap-2">
              <Link
                to={`/${slug}/products/${product}/requirements`}
                className="shrink-0 text-13 text-secondary hover:text-primary"
              >
                {t("workspace_products.navigation.requirements")}
              </Link>
              <span className="shrink-0 text-13 text-tertiary">/</span>
              <RequirementIdentifier
                displayId={requirement?.display_id}
                sourceDisplayId={requirement?.source_display_id}
                size="sm"
                enableClickToCopy
              />
              <h1 className="min-w-0 truncate text-13 font-medium text-primary">
                {requirement?.title || t("requirement_detail.untitled")}
              </h1>
            </Header.LeftItem>
          </Header>
        }
      />

      <ContentWrapper className="overflow-hidden">
        {detail.isLoading && !requirement ? (
          <div className="p-6">
            <Loader className="flex flex-col gap-3">
              <Loader.Item height="32px" width="50%" />
              <Loader.Item height="400px" />
            </Loader>
          </div>
        ) : detail.error || !requirement ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <p className="text-13 text-secondary">{detail.error ?? t("requirement_detail.not_found")}</p>
          </div>
        ) : (
          <div className="flex h-full w-full overflow-hidden">
            {/* 正文限宽并居中：右栏之外还剩几百上千像素时，标签/值铺满整行会读不成一列 */}
            <div className="vertical-scrollbar scrollbar-sm h-full min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8">
              <div className="mx-auto w-full max-w-[52rem]">
                <RequirementDetailContent
                  workspaceSlug={slug}
                  productId={product}
                  requirement={requirement}
                  requirementType={requirementType}
                  subRequirements={detail.children}
                  trail={detail.trail}
                  readOnly={!isEditable}
                  layout="page"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={detail.submitPatch}
                  onOpenRequirement={openRequirement}
                  onRolledBack={() => void detail.refresh()}
                  /* 产品侧只读：按项目分组看已拆工作项；「拆」必须先选项目，入口在项目侧 */
                  issuesSection={<RequirementIssuesByProject workspaceSlug={slug} requirement={requirement} />}
                />
                {/* 窄屏没有右栏，属性回落到主列底部 —— 与工作项详情同款处理 */}
                <div className="mt-8 border-t border-subtle pt-6 lg:hidden">
                  <RequirementDetailProperties
                    requirement={requirement}
                    requirementTypeName={requirementType?.name ?? null}
                    readOnly={!isEditable}
                    workspaceSlug={slug}
                    productId={product}
                    resolveParentTitle={resolveParentTitle}
                    onPatch={detail.submitPatch}
                    onProjectsChanged={() => void detail.refresh()}
                  />
                </div>
              </div>
            </div>
            <div
              className={cn(
                "vertical-scrollbar scrollbar-sm hidden h-full w-[340px] flex-shrink-0 flex-col gap-5 overflow-y-auto",
                "border-l border-subtle px-5 py-8 lg:flex"
              )}
            >
              <RequirementApprovalPanel
                requirement={requirement}
                isMutating={changesStore.isMutating}
                onSubmitReview={(requirementId) => approvalActions.openSubmitModal([requirementId])}
                onWithdrawReview={(changeRequestId) => void approvalActions.withdraw(changeRequestId)}
                onOpenChangeRequest={openChangeRequest}
              />
              <RequirementDetailProperties
                requirement={requirement}
                requirementTypeName={requirementType?.name ?? null}
                readOnly={!isEditable}
                workspaceSlug={slug}
                productId={product}
                resolveParentTitle={resolveParentTitle}
                onPatch={detail.submitPatch}
                onProjectsChanged={() => void detail.refresh()}
              />
            </div>
          </div>
        )}
      </ContentWrapper>

      <SubmitReviewModal
        isOpen={approvalActions.isSubmitModalOpen}
        isSubmitting={changesStore.isMutating}
        requirements={[requirement ?? null]}
        onClose={approvalActions.closeSubmitModal}
        onSubmit={(reason) => void approvalActions.submit(reason)}
      />
    </>
  );
});
