"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirement } from "@plane/types";
import { RequirementGridPagination } from "@/components/requirements/requirement-grid-pagination";
import { RequirementListPriority } from "@/components/requirements/requirement-list-cells";
import { RequirementService } from "@/services/requirement.service";
import type { TSelectionSource } from "./import-library-tree";

const requirementService = new RequirementService();

type TProps = {
  workspaceSlug: string;
  sources: TSelectionSource[];
  totalCount: number;
  onRemove: (libraryId: string, itemIds: string[]) => void;
  onClear: () => void;
  onBack: () => void;
};

/**
 * 导入前核对：已选条目按「库 / 模块」分组列出，可逐条或整组移除。
 *
 * 勾选状态里只有 id，行内容按当前页需要的 id 去条目列表接口（?ids=）取，取过的缓存住，
 * 翻回来不再请求。分页在前端做 —— 已选集合本来就整份在内存里。
 */
export const RequirementImportSelectedPanel = ({
  workspaceSlug,
  sources,
  totalCount,
  onRemove,
  onClear,
  onBack,
}: TProps) => {
  const { t } = useTranslation();
  const [pageIndex, setPageIndex] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const [rowsById, setRowsById] = useState<Map<string, TRequirement>>(new Map());

  const entries = useMemo(
    () => sources.flatMap((source) => source.itemIds.map((itemId) => ({ source, itemId }))),
    [sources]
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / perPage));
  // 移除之后这一页可能空了，退回最后一页
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageEntries = entries.slice(safePageIndex * perPage, (safePageIndex + 1) * perPage);

  const missingKey = pageEntries
    .filter((entry) => !rowsById.has(entry.itemId))
    .map((entry) => `${entry.source.libraryId}:${entry.itemId}`)
    .join(",");

  useEffect(() => {
    if (!missingKey) return;
    const idsByLibrary = new Map<string, string[]>();
    missingKey.split(",").forEach((pair) => {
      const [libraryId, itemId] = pair.split(":");
      idsByLibrary.set(libraryId, [...(idsByLibrary.get(libraryId) ?? []), itemId]);
    });
    let isStale = false;
    void Promise.all(
      [...idsByLibrary].map(([libraryId, ids]) =>
        requirementService
          .listLibraryItems(workspaceSlug, libraryId, { ids, perPage: 100 })
          .then((response) => response.results)
          .catch(() => [] as TRequirement[])
      )
    ).then((batches) => {
      if (isStale) return;
      setRowsById((current) => {
        const next = new Map(current);
        batches.flat().forEach((row) => next.set(row.id, row));
        return next;
      });
    });
    return () => {
      isStale = true;
    };
  }, [missingKey, workspaceSlug]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-6 pt-4 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-13 text-accent-primary hover:underline"
        >
          <ChevronLeft className="size-3.5" />
          {t("workspace_products.requirements.import_modal.continue_picking")}
        </button>
        <span className="h-3.5 w-px bg-layer-3" />
        <span className="text-16 font-semibold text-primary">
          {t("workspace_products.requirements.import_modal.selected_count", { count: totalCount })}
        </span>
        <Button variant="secondary" size="lg" className="ml-auto" onClick={onClear}>
          {t("workspace_products.requirements.import_modal.clear")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6">
        {pageEntries.map((entry, index) => {
          const { source, itemId } = entry;
          const row = rowsById.get(itemId);
          const showHeader = index === 0 || pageEntries[index - 1].source.key !== source.key;
          return (
            <Fragment key={`${source.key}:${itemId}`}>
              {showHeader && (
                <div className="mt-1.5 flex h-10 items-center gap-2 rounded-md bg-layer-1 px-3">
                  {source.caption && <span className="truncate text-12 text-tertiary">{source.caption} /</span>}
                  <span className="shrink-0 text-13 font-semibold text-primary">{source.name}</span>
                  <span className="shrink-0 text-12 text-tertiary">
                    {t("workspace_products.requirements.import_modal.source_count", { count: source.itemIds.length })}
                  </span>
                  <button
                    type="button"
                    className="ml-auto shrink-0 text-12 text-secondary hover:text-primary"
                    onClick={() => onRemove(source.libraryId, source.itemIds)}
                  >
                    {t("workspace_products.requirements.import_modal.remove_group")}
                  </button>
                </div>
              )}
              <div className="grid h-[42px] grid-cols-[92px_minmax(0,1fr)_64px_28px] items-center gap-x-3 border-b border-subtle px-3">
                <span className="truncate font-mono text-13 text-tertiary tabular-nums">
                  {row ? row.display_id : <span className="block h-3 w-14 animate-pulse rounded bg-layer-1" />}
                </span>
                <span className="truncate text-14 text-primary" title={row?.title}>
                  {row ? row.title || "—" : <span className="block h-3 w-2/3 animate-pulse rounded bg-layer-1" />}
                </span>
                <span>{row && <RequirementListPriority priority={row.priority} />}</span>
                <button
                  type="button"
                  aria-label={t("workspace_products.requirements.import_modal.remove")}
                  className="grid size-7 place-items-center rounded-md text-placeholder hover:bg-layer-transparent-hover hover:text-primary"
                  onClick={() => onRemove(source.libraryId, [itemId])}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>

      <RequirementGridPagination
        totalCount={entries.length}
        perPage={perPage}
        pageIndex={safePageIndex}
        onPageChange={setPageIndex}
        onPerPageChange={(size) => {
          setPerPage(size);
          setPageIndex(0);
        }}
      />
    </section>
  );
};
