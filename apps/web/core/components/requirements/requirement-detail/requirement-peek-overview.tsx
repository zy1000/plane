"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Link2, Loader as LoaderIcon, Maximize2, MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementItemStatus, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { canEditRequirementContent } from "@/components/requirements/requirement-status-cell";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
import { RequirementDetailContent } from "./requirement-detail-content";
import { useRequirementDetail } from "./use-requirement-detail";

type TProps = {
  workspaceSlug: string;
  productId: string;
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
   * 透传给正文的「关联工作项」区块。项目需求页传入可操作的 Section（拆分/关联/解除
   * 要项目语境与 link 管理权限，都长在那一页上）；产品侧抽屉不传则不渲染。
   */
  issuesSection?: ReactNode;
  /**
   * 透传给正文的「关联测试用例」区块。产品侧与项目侧的需求列表都注入；迭代 / 发布的
   * 范围抽屉不传则不渲染。
   */
  testCasesSection?: ReactNode;
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
    issuesSection,
    testCasesSection,
  } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
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

  const seed = useMemo(() => rows.find((row) => row.id === activeId) ?? null, [activeId, rows]);
  const detail = useRequirementDetail({ workspaceSlug, productId, requirementId: activeId, seed });
  const { requirement } = detail;

  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "product",
    entityId: productId,
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

  /** 改状态走独立端点；返回的是只合并了 status / can_submit_review 的行，同样回灌给网格 */
  const handleStatusChange = useCallback(
    async (status: TRequirementItemStatus) => {
      const response = await detail.updateStatus(status);
      if (response) onRequirementUpdated?.(response);
    },
    [detail, onRequirementUpdated]
  );

  useKeypress("Escape", () => {
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
          <div className="absolute inset-0 bg-black/20" onClick={onClose} />
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
            <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2.5">
              <IconButton
                variant="ghost"
                size="base"
                icon={MoveRight}
                aria-label={t("requirement_detail.close")}
                onClick={onClose}
              />
              {showDetailAction && (
                <IconButton
                  variant="ghost"
                  size="base"
                  icon={Maximize2}
                  aria-label={t("requirement_detail.open_full_page")}
                  onClick={() => {
                    if (!activeId) return;
                    onClose();
                    router.push(`/${workspaceSlug}/products/${productId}/requirements/${activeId}`);
                  }}
                />
              )}
              {/* 抽屉里唯一能稳定引用这条需求的东西 —— 这里默认开点击复制 */}
              <RequirementIdentifier
                displayId={requirement?.display_id}
                sourceDisplayId={requirement?.source_display_id}
                size="sm"
                enableClickToCopy
              />
              {productChip}
              <span className="ml-auto flex items-center gap-1.5">
                {detail.isLoading && <LoaderIcon className="size-3.5 animate-spin text-tertiary" />}
                <IconButton
                  variant="ghost"
                  size="base"
                  icon={Link2}
                  aria-label={t("requirement_detail.copy_link")}
                  onClick={() => {
                    if (!activeId) return;
                    void copyUrlToClipboard(
                      shareHref?.(activeId) ?? `${workspaceSlug}/products/${productId}/requirements/${activeId}`
                    ).then(() =>
                      setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") })
                    );
                  }}
                />
              </span>
            </div>

            <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-6 pt-1 pb-12">
              {!isBodyMounted || (detail.isLoading && !requirement) ? (
                <Loader className="flex flex-col gap-3 py-2">
                  <Loader.Item height="28px" width="60%" />
                  <Loader.Item height="56px" />
                  <Loader.Item height="200px" />
                </Loader>
              ) : detail.error || !requirement ? (
                <p className="py-10 text-center text-13 text-secondary">
                  {detail.error ?? t("requirement_detail.not_found")}
                </p>
              ) : (
                <RequirementDetailContent
                  workspaceSlug={workspaceSlug}
                  productId={productId}
                  requirement={requirement}
                  requirementType={requirementType}
                  subRequirements={detail.children}
                  trail={detail.trail}
                  readOnly={!canEditRequirementContent(requirement, canEdit)}
                  layout="drawer"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={handlePatch}
                  // 状态格只看页面级写权限：closed 行内容只读但要能重开，评审中也能改状态
                  onStatusChange={canEdit ? (status) => void handleStatusChange(status) : undefined}
                  onOpenRequirement={onOpenRequirement}
                  onRolledBack={() => void detail.refresh()}
                  issuesSection={issuesSection}
                  testCasesSection={testCasesSection}
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
