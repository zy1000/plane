"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Loader as LoaderIcon, MoveDiagonal, MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CopyLinkIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementItemStatus, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { canEditRequirementContent } from "@/components/requirements/requirement-status-cell";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
import { RequirementDetailContent } from "./requirement-detail-content";
import type { TRequirementRelationsConfig } from "./requirement-relations-area";
import { useRequirementDetail } from "./use-requirement-detail";

type TProps = {
  workspaceSlug: string;
  /** 产品需求详情；与 libraryId 二选一 */
  productId?: string;
  /** 标准库条目详情；「打开整页」落到 templates/libraries/:id/requirements/:rid */
  libraryId?: string;
  /** 打开哪一条；null = 关闭。上层会把它同步到 URL 的 ?peek=，刷新和分享都能还原 */
  requirementId: string | null;
  requirementTypes: TRequirementTypeSchema[];
  /** 网格当前页的行，命中就不必再请求一次 */
  rows: TRequirement[];
  /** 能不能改需求条目（页面级写权限）。内容还要看行自己的 is_locked / closed；状态格只看它 */
  canEdit: boolean;
  onClose: () => void;
  onOpenRequirement: (requirementId: string) => void;
  /** 抽屉里改完，上层网格要跟着更新，否则关掉抽屉看到的还是旧值 */
  onRequirementUpdated?: (requirement: TRequirement) => void;
  /**
   * 「复制链接」的目标。默认是产品的需求详情页；项目需求页把抽屉开在自己的路由上
   * （`?peek=`），复制出去的应该是他正在看的那个页面，所以由调用方传入。
   */
  shareHref?: (requirementId: string) => string;
  /**
   * 「打开整页」。传 false 则整个按钮不渲染 —— 项目侧就是这种情况：需求没有项目内的
   * 整页路由，而跳去产品的整页会把用户静默弹出项目上下文。
   *
   * 注意不能"指回本页 + ?peek="来糊弄：按钮会先 onClose()，随后页面的 peek↔URL 同步
   * 副作用把刚写上去的参数又删掉，点了等于没点。
   */
  showDetailAction?: boolean;
  /** 头部的所属产品标识。项目侧一页可能混着多个产品的需求，不标出来根本分不清 */
  productChip?: ReactNode;
  /**
   * 透传给正文的关联区配置（工作项 / 用例）。产品需求页给 canManage，项目需求页再给
   * projectId（拆分 / 关联要项目语境与 link 管理权限，都长在那一页上）；迭代 / 发布的
   * 范围抽屉、个人页不传则只剩子需求与附件。
   */
  relations?: TRequirementRelationsConfig;
  /**
   * 横幅上的审批动作，由产品需求页注入（弹窗与提交逻辑长在那一页上）：
   * 提交评审（变更中）、查看变更单 / 撤回评审（评审中）。其它调用方不传则横幅只出说明。
   */
  onSubmitReview?: (requirementId: string) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  onOpenChangeRequest?: (changeRequestId: string) => void;
  isApprovalMutating?: boolean;
  /**
   * 抽屉之外的动作（提交 / 撤回评审）改了这一行时，调用方把它 +1 —— 抽屉重新拉这一行并
   * 回灌给列表。详情以本地状态为准、不跟随列表行变化（见 use-requirement-detail），
   * 不这么做的话横幅会停在提交前的状态。
   */
  refreshToken?: number;
};

/**
 * 需求详情抽屉。
 *
 * 与工作项的 peek 一样 portal 到 #full-screen-portal，开合同样是内存态；URL 上的
 * ?peek= 由上层在副作用里跟着补 —— 需求经常要贴给别人看，链接要能直接打开这一条，
 * 但这件事不该挡在开合的关键路径上。
 */
export const RequirementPeekOverview = (props: TProps) => {
  const {
    workspaceSlug,
    productId,
    libraryId,
    requirementId,
    requirementTypes,
    rows,
    canEdit,
    onClose,
    onOpenRequirement,
    onRequirementUpdated,
    shareHref,
    showDetailAction = true,
    productChip,
    relations,
    onSubmitReview,
    onWithdrawReview,
    onOpenChangeRequest,
    isApprovalMutating,
    refreshToken,
  } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const issueDetail = useIssueDetail();
  const isOpen = Boolean(requirementId);

  /**
   * 关掉时上层立刻把 requirementId 置空，但抽屉还要滑 150ms 才消失。详情直接跟着空，
   * 滑出的这一段就会先把内容换成「未找到」、顺带清掉子需求与轨迹。这里握住最后一条，
   * 等滑完（afterLeave）再松手。
   */
  const [activeId, setActiveId] = useState(requirementId);
  useEffect(() => {
    if (requirementId) setActiveId(requirementId);
  }, [requirementId]);

  /**
   * 首帧要同时挂描述编辑器、子表单、变更轨迹这一堆东西，主线程被占住，「面板出现」
   * 本身就被推迟。改成滑入的过程中先出骨架、进场动画走完（afterEnter）再挂内容 ——
   * 与工作项 peek 先渲 loader、数据回来再填是同一个手感。
   *
   * 初值取 isOpen：带着 ?peek= 直接进页面时没有进场动画，afterEnter 不会来。
   */
  const [isBodyMounted, setIsBodyMounted] = useState(isOpen);

  const entityKind = libraryId && !productId ? "library" : "product";
  const entityId = (entityKind === "library" ? libraryId : productId) ?? "";

  const seed = useMemo(() => rows.find((row) => row.id === activeId) ?? null, [activeId, rows]);
  const detail = useRequirementDetail({
    workspaceSlug,
    productId: entityKind === "product" ? entityId : undefined,
    libraryId: entityKind === "library" ? entityId : undefined,
    requirementId: activeId,
    seed,
  });
  const { requirement } = detail;

  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind,
    entityId,
    knownRows: rows,
    parentIds: detail.parentIds,
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);

  const requirementType = useMemo(
    () => requirementTypes.find((item) => item.id === requirement?.requirement_type_id) ?? null,
    [requirement?.requirement_type_id, requirementTypes]
  );

  const handlePatch = useCallback(
    async (patch: Parameters<typeof detail.submitPatch>[0]) => {
      const response = await detail.submitPatch(patch);
      if (response) onRequirementUpdated?.(response);
      return response;
    },
    [detail, onRequirementUpdated]
  );

  /**
   * 回滚（版本历史里的「回滚到这一版」与提示条上的「放弃改动」）之后要把新行回灌给列表。
   *
   * 抽屉重开时用的是列表传下来的 seed —— fetched 会随 requirementId 清空，而有 seed 就不再
   * 去取（见 use-requirement-detail 的加载 effect）。不回灌的话列表里还是回滚前那一行，
   * 关掉再打开看到的就是「已回滚的内容又变回去了、状态还是已改动」，其实服务端早就回滚好了。
   */
  const handleRolledBack = useCallback(async () => {
    const row = await detail.refresh();
    if (row) onRequirementUpdated?.(row);
    // 历史区的时间线读的是轨迹，行变了要一起刷，否则「当前版本」与快照对不上
    void detail.refreshTrail();
  }, [detail, onRequirementUpdated]);

  // 抽屉之外的审批动作改了这一行：重拉并回灌。初值 0 不触发，避免打开抽屉时白拉一次
  const lastRefreshTokenRef = useRef(refreshToken ?? 0);
  useEffect(() => {
    if (!refreshToken || refreshToken === lastRefreshTokenRef.current) return;
    lastRefreshTokenRef.current = refreshToken;
    if (activeId) void handleRolledBack();
  }, [activeId, handleRolledBack, refreshToken]);

  /** 改状态走独立端点；返回的是只合并了 status / can_submit_review 的行，同样回灌给网格 */
  const handleStatusChange = useCallback(
    async (status: TRequirementItemStatus) => {
      const response = await detail.updateStatus(status);
      if (response) onRequirementUpdated?.(response);
    },
    [detail, onRequirementUpdated]
  );

  /** 改模块挂靠走 set-module 旁路端点；合并了 module_id / module_name 的行回灌给网格 */
  const handleModuleChange = useCallback(
    async (moduleId: string | null, moduleName: string | null) => {
      const response = await detail.updateModule(moduleId, moduleName);
      if (response) onRequirementUpdated?.(response);
    },
    [detail, onRequirementUpdated]
  );

  useKeypress("Escape", () => {
    // 工作项抽屉叠在需求抽屉上时，Esc 先关工作项，别把需求一起带走
    if (issueDetail.peekIssue) return;
    if (isOpen) onClose();
  });

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

  return createPortal(
    <Transition
      show={isOpen}
      as={Fragment}
      afterEnter={() => setIsBodyMounted(true)}
      afterLeave={() => {
        setActiveId(null);
        setIsBodyMounted(false);
      }}
    >
      <div className="absolute inset-0 z-[25]">
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => {
              if (issueDetail.peekIssue) return;
              onClose();
            }}
          />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="transition-transform duration-200 ease-out"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transition-transform duration-150 ease-in"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <div
            className={cn(
              "absolute top-0 right-0 bottom-0 flex w-full flex-col border-l border-subtle bg-surface-1",
              "md:w-[80%] 2xl:w-[55%]"
            )}
          >
            {/* 头部按钮的位置与形式对齐工作项 peek header：左侧 关闭(MoveRight) + 整页(MoveDiagonal)，右侧 复制链接(IconButton secondary) */}
            <div className="relative flex flex-shrink-0 items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <Tooltip tooltipContent={t("requirement_detail.close")}>
                  <button type="button" onClick={onClose} aria-label={t("requirement_detail.close")}>
                    <MoveRight className="h-4 w-4 text-tertiary hover:text-secondary" />
                  </button>
                </Tooltip>
                {showDetailAction && entityId && (
                  <Tooltip tooltipContent={t("requirement_detail.open_full_page")}>
                    <button
                      type="button"
                      aria-label={t("requirement_detail.open_full_page")}
                      onClick={() => {
                        if (!activeId) return;
                        onClose();
                        router.push(
                          entityKind === "library"
                            ? `/${workspaceSlug}/templates/libraries/${entityId}/requirements/${activeId}`
                            : `/${workspaceSlug}/products/${entityId}/requirements/${activeId}`
                        );
                      }}
                    >
                      <MoveDiagonal className="h-4 w-4 text-tertiary hover:text-secondary" />
                    </button>
                  </Tooltip>
                )}
                {productChip}
              </div>
              <div className="flex items-center gap-2">
                {detail.isLoading && <LoaderIcon className="size-3.5 animate-spin text-tertiary" />}
                <Tooltip tooltipContent={t("requirement_detail.copy_link")}>
                  <IconButton
                    variant="secondary"
                    size="lg"
                    icon={CopyLinkIcon}
                    aria-label={t("requirement_detail.copy_link")}
                    onClick={() => {
                      if (!activeId) return;
                      void copyUrlToClipboard(
                        shareHref?.(activeId) ??
                          (entityKind === "library"
                            ? `${workspaceSlug}/templates/libraries/${entityId}?peek=${activeId}`
                            : `${workspaceSlug}/products/${entityId}/requirements/${activeId}`)
                      ).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") }));
                    }}
                  />
                </Tooltip>
              </div>
            </div>

            <div className="requirement-drawer-body vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-6 pt-1 pb-12 text-body-sm-regular">
              {!isBodyMounted || (detail.isLoading && !requirement) ? (
                <Loader className="flex flex-col gap-3 py-2">
                  <Loader.Item height="28px" width="60%" />
                  <Loader.Item height="56px" />
                  <Loader.Item height="200px" />
                </Loader>
              ) : detail.error || !requirement ? (
                <p className="py-10 text-center text-body-sm-regular text-secondary">
                  {detail.error ?? t("requirement_detail.not_found")}
                </p>
              ) : (
                <RequirementDetailContent
                  workspaceSlug={workspaceSlug}
                  productId={entityKind === "product" ? entityId : undefined}
                  libraryId={entityKind === "library" ? entityId : undefined}
                  requirement={requirement}
                  requirementType={requirementType}
                  subRequirements={detail.children}
                  trail={detail.trail}
                  readOnly={!canEditRequirementContent(requirement, canEdit)}
                  layout="drawer"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={handlePatch}
                  // 状态格只看页面级写权限：closed 行内容只读但要能重开，评审中也能改状态
                  onStatusChange={
                    canEdit && entityKind === "product" ? (status) => void handleStatusChange(status) : undefined
                  }
                  // 模块同为旁路轴；库条目也有模块，不像状态那样限产品
                  onModuleChange={
                    canEdit ? (moduleId, moduleName) => void handleModuleChange(moduleId, moduleName) : undefined
                  }
                  onOpenRequirement={onOpenRequirement}
                  onRolledBack={() => void handleRolledBack()}
                  relations={relations}
                  onSubmitReview={onSubmitReview && activeId ? () => onSubmitReview(activeId) : undefined}
                  onWithdrawReview={onWithdrawReview}
                  onOpenChangeRequest={onOpenChangeRequest}
                  isApprovalMutating={isApprovalMutating}
                />
              )}
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
};
