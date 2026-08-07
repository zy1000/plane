"use client";

import { Fragment, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Link2, Loader as LoaderIcon, Maximize2, MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
import { RequirementDetailContent } from "./requirement-detail-content";
import { useRequirementDetail } from "./use-requirement-detail";

type TProps = {
  workspaceSlug: string;
  productId: string;
  /** 打开哪一条；null = 关闭。由 URL 上的 ?peek= 驱动，刷新和分享都能还原 */
  requirementId: string | null;
  requirementTypes: TRequirementTypeSchema[];
  /** 网格当前页的行，命中就不必再请求一次 */
  rows: TRequirement[];
  /** 能不能改需求条目。具体某一行还要看它自己的 is_locked */
  canEdit: boolean;
  onClose: () => void;
  onOpenRequirement: (requirementId: string) => void;
  /** 抽屉里改完，上层网格要跟着更新，否则关掉抽屉看到的还是旧值 */
  onRequirementUpdated?: (requirement: TRequirement) => void;
};

/**
 * 需求详情抽屉。
 *
 * 与工作项的 peek 一样 portal 到 #full-screen-portal，但开合由 URL 参数驱动而不是
 * 内存态 —— 需求经常要贴给别人看，一个能直接打开这条需求的链接比少一次跳转更值。
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
  } = props;
  const { t } = useTranslation();
  const router = useAppRouter();

  const seed = useMemo(
    () => rows.find((row) => row.id === requirementId) ?? null,
    [requirementId, rows]
  );
  const detail = useRequirementDetail({ workspaceSlug, productId, requirementId, seed });
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

  const isOpen = Boolean(requirementId);
  useKeypress("Escape", () => {
    if (isOpen) onClose();
  });

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

  return createPortal(
    <Transition show={isOpen} as={Fragment}>
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
              <IconButton
                variant="ghost"
                size="base"
                icon={Maximize2}
                aria-label={t("requirement_detail.open_full_page")}
                onClick={() => {
                  if (!requirementId) return;
                  onClose();
                  router.push(`/${workspaceSlug}/products/${productId}/requirements/${requirementId}`);
                }}
              />
              <span className="ml-auto flex items-center gap-1.5">
                {detail.isLoading && <LoaderIcon className="size-3.5 animate-spin text-tertiary" />}
                <IconButton
                  variant="ghost"
                  size="base"
                  icon={Link2}
                  aria-label={t("requirement_detail.copy_link")}
                  onClick={() => {
                    if (!requirementId) return;
                    void copyUrlToClipboard(
                      `${workspaceSlug}/products/${productId}/requirements/${requirementId}`
                    ).then(() =>
                      setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") })
                    );
                  }}
                />
              </span>
            </div>

            <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-6 pt-1 pb-12">
              {detail.isLoading && !requirement ? (
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
                  readOnly={!canEdit || requirement.is_locked}
                  layout="drawer"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={handlePatch}
                  onOpenRequirement={onOpenRequirement}
                  onRolledBack={() => void detail.refresh()}
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
