"use client";

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CopyLinkIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Header, Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import {
  RequirementApprovalPanel,
  RequirementDetailContent,
  RequirementDetailProperties,
  useRequirementDetail,
} from "@/components/requirements/requirement-detail";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { canEditRequirementContent } from "@/components/requirements/requirement-status-cell";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useProductRequirements } from "@/hooks/store/use-product-requirements";
import { useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";
import { useAppRouter } from "@/hooks/use-app-router";
import { SubmitReviewModal } from "./approval/submit-review-modal";
import { useRequirementApprovalActions } from "./approval/use-requirement-approval-actions";

/**
 * 需求详情整页。
 *
 * 与抽屉共用 RequirementDetailContent，差别在版式：主列铺满、属性从横条挪进右栏、
 * 审批动作提到标题行右侧、关联区与工作项详情同一套（操作条 + 有内容才出折叠块）、历史区左右分栏。
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
  /** 能不能改需求条目（页面级写权限）；内容还要看这一行在不在评审中 / 有没有关闭 */
  const canEdit = store.canEdit;
  const isEditable = canEditRequirementContent(requirement, canEdit);
  /** 状态格只看页面级写权限：closed 行内容只读但要能重开，评审中也能改状态 */
  const onStatusChange = canEdit ? detail.updateStatus : undefined;
  /** 模块同为旁路轴（set-module），只看页面级写权限 */
  const onModuleChange = canEdit
    ? (moduleId: string | null, moduleName: string | null) => void detail.updateModule(moduleId, moduleName)
    : undefined;

  const knownRows = useMemo(
    () => (requirement ? [requirement, ...detail.children] : []),
    [detail.children, requirement]
  );
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
  /** 与抽屉的复制链接同一条路径：整页地址本身就是分享链接 */
  const copyLink = useCallback(
    () =>
      void copyUrlToClipboard(`${slug}/products/${product}/requirements/${requirementId ?? ""}`).then(() =>
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") })
      ),
    [product, requirementId, slug, t]
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
            {/* 主列从左铺到右栏为止，只封顶不居中：1440px 之外才留白，而且留在右侧一处 */}
            <div className="vertical-scrollbar scrollbar-sm h-full min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-7">
              <div className="w-full max-w-[90rem]">
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
                  onStatusChange={onStatusChange}
                  onOpenRequirement={openRequirement}
                  onRolledBack={() => void detail.refresh()}
                  headerActions={
                    <>
                      {/* 推动评审的入口放在标题右侧 —— 页面级动作不该藏在右栏里 */}
                      <RequirementApprovalPanel
                        variant="actions"
                        requirement={requirement}
                        isMutating={changesStore.isMutating}
                        onSubmitReview={(id) => approvalActions.openSubmitModal([id])}
                        onWithdrawReview={(changeRequestId) => void approvalActions.withdraw(changeRequestId)}
                        onOpenChangeRequest={openChangeRequest}
                      />
                      <Tooltip tooltipContent={t("requirement_detail.copy_link")}>
                        <IconButton
                          variant="secondary"
                          size="lg"
                          icon={CopyLinkIcon}
                          aria-label={t("requirement_detail.copy_link")}
                          onClick={copyLink}
                        />
                      </Tooltip>
                    </>
                  }
                  /* 关联不是内容、不走评审：拆分 / 关联 / 解除只看页面级写权限 */
                  relations={{ canManage: canEdit, onChanged: () => void detail.refresh() }}
                />
                {/* 窄屏没有右栏，属性回落到主列底部 —— 与工作项详情同款处理 */}
                <div className="mt-8 border-t border-subtle pt-6 lg:hidden">
                  <RequirementDetailProperties
                    requirement={requirement}
                    requirementTypeName={requirementType?.name ?? null}
                    builtinLayout={requirementType?.builtin_fields ?? null}
                    readOnly={!isEditable}
                    canEdit={canEdit}
                    workspaceSlug={slug}
                    productId={product}
                    resolveParentTitle={resolveParentTitle}
                    onPatch={detail.submitPatch}
                    onStatusChange={onStatusChange}
                    onModuleChange={onModuleChange}
                    onProjectsChanged={() => void detail.refresh()}
                  />
                </div>
              </div>
            </div>
            <div
              className={cn(
                "vertical-scrollbar hidden scrollbar-sm h-full w-[380px] flex-shrink-0 flex-col overflow-y-auto",
                "border-l border-subtle px-6 py-6 lg:flex"
              )}
            >
              <RequirementDetailProperties
                requirement={requirement}
                requirementTypeName={requirementType?.name ?? null}
                builtinLayout={requirementType?.builtin_fields ?? null}
                readOnly={!isEditable}
                canEdit={canEdit}
                workspaceSlug={slug}
                productId={product}
                resolveParentTitle={resolveParentTitle}
                onPatch={detail.submitPatch}
                onStatusChange={onStatusChange}
                onModuleChange={onModuleChange}
                onProjectsChanged={() => void detail.refresh()}
              />
            </div>
          </div>
        )}
      </ContentWrapper>

      <SubmitReviewModal
        isOpen={approvalActions.isSubmitModalOpen}
        isSubmitting={changesStore.isMutating}
        workspaceSlug={workspaceSlug}
        productId={productId}
        onClose={approvalActions.closeSubmitModal}
        onSubmit={(payload) => void approvalActions.submit(payload)}
      />
    </>
  );
});
