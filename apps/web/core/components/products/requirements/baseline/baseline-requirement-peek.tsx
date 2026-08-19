"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Link2, MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementBaselineEntry, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { RequirementDetailContent } from "@/components/requirements/requirement-detail/requirement-detail-content";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import useKeypress from "@/hooks/use-keypress";
import { baselineEntryToRequirement, baselineEntryToRequirementType } from "./baseline-entry-adapter";

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirementId: string | null;
  entries: TRequirementBaselineEntry[];
  requirementTypes: TRequirementTypeSchema[];
  onClose: () => void;
  onOpenRequirement: (requirementId: string) => void;
  shareHref?: (requirementId: string) => string;
};

/**
 * 基线里的需求详情抽屉。壳子跟活 Peek 一样，数据只用当前条目的 snapshot，
 * 不拉活需求 / 轨迹 / 版本，也不能改。
 */
export function BaselineRequirementPeek(props: TProps) {
  const {
    workspaceSlug,
    productId,
    requirementId,
    entries,
    requirementTypes,
    onClose,
    onOpenRequirement,
    shareHref,
  } = props;
  const { t } = useTranslation();
  const isOpen = Boolean(requirementId);

  const [activeId, setActiveId] = useState(requirementId);
  useEffect(() => {
    if (requirementId) setActiveId(requirementId);
  }, [requirementId]);

  const [isBodyMounted, setIsBodyMounted] = useState(isOpen);

  const entryOnPage = useMemo(
    () => entries.find((entry) => entry.requirement_id === activeId) ?? null,
    [activeId, entries]
  );
  /**
   * 翻页后当前页可能没有这一条，抽屉还开着。握住最后一次命中的条目，关掉再松手。
   */
  const [heldEntry, setHeldEntry] = useState(entryOnPage);
  useEffect(() => {
    if (entryOnPage) setHeldEntry(entryOnPage);
  }, [entryOnPage]);

  const entry = entryOnPage ?? heldEntry;
  const requirement = useMemo(
    () => (entry ? baselineEntryToRequirement(entry, productId) : null),
    [entry, productId]
  );
  const requirementType = useMemo(
    () => (entry ? baselineEntryToRequirementType(entry, requirementTypes) : null),
    [entry, requirementTypes]
  );

  const snapshotRows = useMemo(
    () => entries.map((item) => baselineEntryToRequirement(item, productId)),
    [entries, productId]
  );
  const parentIds = useMemo(() => snapshotRows.map((row) => row.parent_id), [snapshotRows]);
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "product",
    entityId: productId,
    knownRows: snapshotRows,
    parentIds: requirement?.parent_id ? [requirement.parent_id, ...parentIds] : parentIds,
    skipRemote: true,
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);

  const entryIds = useMemo(() => new Set(entries.map((item) => item.requirement_id)), [entries]);
  const openIfInBaseline = useCallback(
    (id: string) => {
      if (entryIds.has(id) || heldEntry?.requirement_id === id) onOpenRequirement(id);
    },
    [entryIds, heldEntry, onOpenRequirement]
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
        setHeldEntry(null);
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
              <RequirementIdentifier
                displayId={requirement?.display_id}
                sourceDisplayId={requirement?.source_display_id}
                size="sm"
                enableClickToCopy
              />
              <span className="ml-auto flex items-center gap-1.5">
                <IconButton
                  variant="ghost"
                  size="base"
                  icon={Link2}
                  aria-label={t("requirement_detail.copy_link")}
                  onClick={() => {
                    if (!activeId) return;
                    void copyUrlToClipboard(
                      shareHref?.(activeId) ?? `${workspaceSlug}/products/${productId}/requirements?peek=${activeId}`
                    ).then(() =>
                      setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") })
                    );
                  }}
                />
              </span>
            </div>

            <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-6 pt-1 pb-12">
              {!isBodyMounted ? (
                <Loader className="flex flex-col gap-3 py-2">
                  <Loader.Item height="28px" width="60%" />
                  <Loader.Item height="56px" />
                  <Loader.Item height="200px" />
                </Loader>
              ) : !requirement ? (
                <p className="py-10 text-center text-13 text-secondary">{t("requirement_detail.not_found")}</p>
              ) : (
                <RequirementDetailContent
                  workspaceSlug={workspaceSlug}
                  productId={productId}
                  requirement={requirement}
                  requirementType={requirementType}
                  subRequirements={[]}
                  trail={[]}
                  readOnly
                  showHistory={false}
                  layout="drawer"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={async () => undefined}
                  onOpenRequirement={openIfInBaseline}
                />
              )}
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
}
