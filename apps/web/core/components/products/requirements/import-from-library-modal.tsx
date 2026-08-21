"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pagination } from "antd";
import { Check, Library, Search, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementImportPayload } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { BuiltinCellValue, getBuiltinColumnsFor } from "@/components/requirements/requirement-builtin-fields";
import { getCurrentPageOffset, LeafValue } from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { useImportableLibraryItems } from "@/hooks/store/use-importable-library-items";
import { useLibraryItems } from "@/hooks/store/use-library-items";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";
import { getSelectionState, useLibraryImportSelection } from "./use-library-import-selection";

/**
 * 从标准库导入条目到产品需求。
 *
 * 左侧常驻标准库列表，右侧是所选库的条目；勾选按 `库 -> 条目 ID` 存在
 * useLibraryImportSelection 里，切库不清空，所以可以跨库攒一批再一次性导入。接口一次
 * 只收一个 library_id，跨库的部分由调用方按库分组后顺序调用（见
 * useProductRequirements.importFromLibraries）。
 *
 * 已经导进本产品的条目不进候选池：右侧列表由服务端剔除（条目是分页的，前端就地过滤
 * 会让某一页只剩几行、总数也偏大），左侧的可导条数与「勾整库」则来自
 * useImportableLibraryItems。
 *
 * 刻意不复用 RequirementGrid：它的勾选是接删除的，还自带编辑工具栏与 bulk-save
 * 契约。这里只复用它的展示部件（内置列 BuiltinCellValue + 自定义列 LeafValue），
 * 让列的呈现和标准库页保持一致。
 */

/**
 * 预览只出最能认人的两列内置字段，其余靠自定义字段补 —— 弹窗宽度有限。
 * 取值范围限定在库里真实存在的那几列（状态/负责人/起止日期在库里根本不展示）。
 */
const PREVIEW_BUILTIN_COLUMNS = getBuiltinColumnsFor("library").filter(
  (column) => column.key === "title" || column.key === "priority"
);

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  productId: string;
  isMutating: boolean;
  /**
   * 预热开关。本组件常驻挂载（不是 isOpen && 才渲染），所以标准库列表在进页面时就
   * 拉好了；这个开关再往前一步，在用户「有意打开」（hover / focus 按钮）时就把第一个
   * 库的条目也拉回来，点开时基本是瞬开的。
   */
  shouldPrefetch?: boolean;
  onClose: () => void;
  onImport: (payloads: TRequirementImportPayload[]) => Promise<unknown>;
};

export const RequirementImportFromLibraryModal = ({
  isOpen,
  workspaceSlug,
  productId,
  isMutating,
  shouldPrefetch = false,
  onClose,
  onImport,
}: TProps) => {
  const { t } = useTranslation();
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { libraries, isLoading: isLibrariesLoading } = useRequirementLibraries(workspaceSlug);
  // 可导条数与「勾整库」的 id 都来自这里；跟条目列表一样只在有意打开时才拉
  const { itemIdsByLibrary, isLoading: isImportableLoading, refetch: refetchImportable } =
    useImportableLibraryItems({
      workspaceSlug,
      productId,
      enabled: isOpen || shouldPrefetch,
    });
  const itemsStore = useLibraryItems({
    workspaceSlug,
    libraryId: libraryId ?? undefined,
    excludeImportedIntoProduct: productId,
  });
  const selection = useLibraryImportSelection(itemIdsByLibrary);

  useEffect(() => {
    if (isOpen) return;
    // 刻意不重置 libraryId：留着它，下次打开就不用重新拉一遍条目，也保留了上次看到哪个库
    setLibrarySearch("");
    selection.clear();
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /**
   * 每次打开都重算候选池。
   *
   * 本组件常驻挂载，两个 hook 的依赖都不会因为「又被打开了一次」而变化 ——
   * shouldPrefetch 更是 hover 过一次就永久为 true。不在这里主动失效的话，看到的
   * 一直是第一次预热时的快照：期间在需求页删掉的行不会重新变得可导，别人刚导进来的
   * 也不会消失。
   */
  useEffect(() => {
    if (!isOpen) return;
    void refetchImportable().catch(() => undefined);
    void itemsStore.fetchRequirements().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredLibraries = useMemo(() => {
    const keyword = librarySearch.trim().toLowerCase();
    if (!keyword) return libraries;
    return libraries.filter(
      (library) =>
        library.name.toLowerCase().includes(keyword) ||
        (library.requirement_type_detail?.name ?? "").toLowerCase().includes(keyword)
    );
  }, [libraries, librarySearch]);

  const importableCountOf = (id: string) => itemIdsByLibrary.get(id)?.length ?? 0;

  // 自动选中第一个还有东西可导的库，省掉一次点击；预热时就选，这样条目也能提前拉好
  useEffect(() => {
    if (!(isOpen || shouldPrefetch) || libraryId || !libraries.length) return;
    setLibraryId(
      (libraries.find((library) => (itemIdsByLibrary.get(library.id)?.length ?? 0) > 0) ?? libraries[0]).id
    );
  }, [isOpen, shouldPrefetch, libraries, libraryId, itemIdsByLibrary]);

  /**
   * 「还在自动选库的路上」：库还在加载，或者已经加载出来但自动选中的 effect 还没跑。
   * 这两种情况右侧都不该出现「请先选择标准库」—— 用户什么都还没来得及做。
   */
  const isBootstrapping = isLibrariesLoading || (!libraryId && libraries.length > 0);

  const activeLibrary = libraries.find((library) => library.id === libraryId);
  const fields = itemsStore.configuration?.fields ?? [];
  // 标题现在是行上的内置列，不在 data 里 —— 预览必须单独出这一列，否则认不出是哪条需求
  const visibleFields = useMemo(() => fields.filter((field) => field.is_active).slice(0, 2), [fields]);
  const items = itemsStore.requirementsPage.results;
  const totalCount = itemsStore.requirementsPage.total_count ?? 0;
  const currentPageOffset = getCurrentPageOffset(
    itemsStore.requirementsPage.prev_cursor,
    itemsStore.requirementsPage.next_cursor,
    itemsStore.requirementsPage.prev_page_results,
    itemsStore.requirementsPage.next_page_results
  );
  const pickedOnPage = libraryId ? items.filter((item) => selection.isPicked(libraryId, item.id)).length : 0;
  const pageState = getSelectionState(pickedOnPage, items.length);
  /** 该库有条目、但全都导进本产品了 —— 与「本来就是空库」是两回事，右侧文案要分开 */
  const isActiveLibraryDrained =
    !isImportableLoading && (activeLibrary?.item_count ?? 0) > 0 && importableCountOf(libraryId ?? "") === 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [itemsStore.cursor]);

  const switchLibrary = (nextId: string) => {
    if (nextId === libraryId) return;
    setLibraryId(nextId);
    // 搜索是按当前库的条目搜的，换库后留着会让人以为「这个库只有这几条」
    itemsStore.setSearch("");
    itemsStore.setCursor(undefined);
  };

  const handleImport = async () => {
    const payloads = selection.toPayloads();
    if (!payloads.length) return;
    setError(null);
    try {
      await onImport(payloads);
      // 候选池的失效统一交给「打开时重拉」那条路径，这里只管关掉
      onClose();
    } catch (requestError) {
      const payload = requestError as { error?: string; code?: string };
      setError(payload?.error ?? t("workspace_products.requirements.import_modal.error_title"));
      // 撞上「已经有人导过了」时，候选池就是过期的：立刻重算，把那几行从列表里拿掉，
      // 否则用户只能反复点确认、反复报同一个错
      if (payload?.code === "REQUIREMENT_ALREADY_IMPORTED") {
        selection.clear();
        void refetchImportable().catch(() => undefined);
        void itemsStore.fetchRequirements().catch(() => undefined);
      }
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <Library className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">
              {t("workspace_products.requirements.import_modal.title")}
            </h2>
          </div>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex h-[58vh] min-h-[360px]">
        {/* 左：标准库列表，常驻 */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-subtle">
          <div className="relative shrink-0 px-3 py-2.5">
            <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-placeholder" />
            <input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-7 text-12 text-primary outline-none placeholder:text-placeholder"
              placeholder={t("workspace_products.requirements.import_modal.search_libraries")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {isLibrariesLoading ? (
              /* 每条按真实条目的两行结构排（名称 + 类型/条数），避免加载完之后列表跳一下 */
              <ul className="space-y-0.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <li key={index} className="rounded-md px-2.5 py-2" style={{ animationDelay: `${index * 60}ms` }}>
                    <span className="block h-3 w-3/4 animate-pulse rounded bg-layer-2" />
                    <span className="mt-1.5 block h-2.5 w-1/2 animate-pulse rounded bg-layer-1" />
                  </li>
                ))}
              </ul>
            ) : !filteredLibraries.length ? (
              <p className="px-2 py-8 text-center text-12 text-secondary">
                {t("workspace_products.requirements.import_modal.empty_libraries")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredLibraries.map((library) => {
                  const isActive = library.id === libraryId;
                  const importableCount = importableCountOf(library.id);
                  const pickedCount = selection.pickedCountOf(library.id);
                  const libraryState = getSelectionState(pickedCount, importableCount);
                  // 「空库」和「都导完了」都是 0 条可导，但对用户是两回事
                  const metaKey =
                    library.item_count === 0
                      ? "library_meta_empty"
                      : importableCount === 0
                        ? "library_meta_drained"
                        : "library_meta_importable";
                  return (
                    /* 勾选框与切库按钮必须是兄弟节点：套进 <button> 里是 interactive
                       content 嵌套，点勾选会连带触发切库，各浏览器行为还不一致 */
                    <li
                      key={library.id}
                      className={cn(
                        "relative flex items-start gap-2 rounded-md px-2.5 py-2 transition-colors",
                        isActive ? "bg-layer-2" : "hover:bg-layer-1"
                      )}
                    >
                      {isActive && (
                        <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent-primary" />
                      )}
                      <Checkbox
                        containerClassName="mt-0.5"
                        checked={libraryState === "checked"}
                        indeterminate={libraryState === "indeterminate"}
                        disabled={importableCount === 0}
                        onChange={() => selection.toggleLibrary(library.id)}
                        aria-label={t("workspace_products.requirements.import_modal.select_all_library", {
                          library: library.name,
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => switchLibrary(library.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-12",
                              isActive ? "font-medium text-primary" : "text-secondary"
                            )}
                          >
                            {library.name}
                          </span>
                          {pickedCount > 0 && (
                            <span className="shrink-0 rounded-full bg-accent-primary px-1.5 text-10 font-medium text-on-color">
                              {pickedCount}
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block truncate text-10 text-tertiary">
                          {t(`workspace_products.requirements.import_modal.${metaKey}`, {
                            requirement_type: library.requirement_type_detail?.name ?? "",
                            count: importableCount,
                          })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* 右：所选库的条目 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {isBootstrapping ? (
            /* 打开瞬间会自动选中第一个库，这段空档给骨架而不是提示文案 ——
               否则用户会看到「请先选择标准库」一闪而过，像是操作失败了。
               骨架按最终布局排（顶栏 + 表头 + 若干行），切换到真数据时不会跳版。 */
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-4 py-2.5">
                <span className="h-4 w-28 animate-pulse rounded bg-layer-2" />
                <span className="ml-auto h-8 w-52 animate-pulse rounded-md bg-layer-2" />
              </div>
              <div className="min-h-0 flex-1 space-y-px px-4 pt-3">
                <span className="mb-2 block h-3 w-full animate-pulse rounded bg-layer-2/70" />
                {Array.from({ length: 7 }).map((_, index) => (
                  <span
                    key={index}
                    className="block h-9 animate-pulse rounded bg-layer-1"
                    style={{ animationDelay: `${index * 60}ms` }}
                  />
                ))}
              </div>
            </>
          ) : !libraryId ? (
            /* 走到这里只可能是一个库都没有 —— 此时说「请先选择」是没意义的 */
            <p className="grid flex-1 place-items-center text-12 text-secondary">
              {t("workspace_products.requirements.import_modal.empty_libraries")}
            </p>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-4 py-2.5">
                <span className="min-w-0 truncate text-12 font-medium text-primary">{activeLibrary?.name}</span>
                <div className="relative ml-auto w-52">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-placeholder" />
                  <input
                    value={itemsStore.search}
                    onChange={(event) => itemsStore.setSearch(event.target.value)}
                    className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-7 text-12 text-primary outline-none placeholder:text-placeholder"
                    placeholder={t("search")}
                  />
                </div>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
                {itemsStore.isRequirementsLoading && !items.length ? (
                  <div className="p-4">
                    <Loader>
                      <Loader.Item height="160px" />
                    </Loader>
                  </div>
                ) : !items.length ? (
                  <p className="grid h-full place-items-center text-12 text-secondary">
                    {/* 「本来就是空库」和「都已经导进本产品了」是两回事，别用同一句话打发 */}
                    {isActiveLibraryDrained && !itemsStore.search
                      ? t("workspace_products.requirements.import_modal.all_imported")
                      : t("workspace_products.requirements.import_modal.empty_items")}
                  </p>
                ) : (
                  <table className="w-full border-collapse text-13">
                    <thead className="sticky top-0 z-10 bg-surface-1">
                      <tr className="border-b border-subtle text-left text-11 font-medium text-secondary">
                        <th className="w-9 px-3 py-2">
                          {/* 表头只管当前这一页（且已被搜索过滤）；整库全选在左栏 */}
                          <Checkbox
                            checked={pageState === "checked"}
                            indeterminate={pageState === "indeterminate"}
                            onChange={() =>
                              selection.toggleItems(
                                libraryId,
                                items.map((item) => item.id)
                              )
                            }
                            aria-label={t("workspace_products.requirements.import_modal.select_all_page")}
                          />
                        </th>
                        {/* 编号排在标题之前：导入后它会作为来源编号跟着落到产品需求上，
                            用户在这里就该看到将要带过去的是哪几个号 */}
                        <th className="min-w-[88px] px-3 py-2">
                          <span className="truncate">{t("requirements.identifier.column")}</span>
                        </th>
                        {PREVIEW_BUILTIN_COLUMNS.map((column) => (
                          <th key={column.key} className="min-w-[130px] px-3 py-2">
                            <span className="truncate">{t(column.labelKey)}</span>
                          </th>
                        ))}
                        {visibleFields.map((field) => (
                          <th key={field.id} className="min-w-[130px] px-3 py-2">
                            <span className="truncate">{field.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isPicked = selection.isPicked(libraryId, item.id);
                        return (
                          <tr
                            key={item.id}
                            onClick={() => selection.toggleItem(libraryId, item.id)}
                            className={cn(
                              "cursor-pointer border-b border-subtle transition-colors",
                              isPicked ? "bg-accent-subtle/40" : "hover:bg-layer-1"
                            )}
                          >
                            <td className="px-3 py-2 align-top">
                              <Checkbox
                                checked={isPicked}
                                onChange={() => selection.toggleItem(libraryId, item.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <RequirementIdentifier displayId={item.display_id} />
                            </td>
                            {PREVIEW_BUILTIN_COLUMNS.map((column) => (
                              <td key={column.key} className="px-3 py-2 align-top">
                                <BuiltinCellValue columnKey={column.key} values={item} />
                              </td>
                            ))}
                            {visibleFields.map((field) => (
                              <td key={field.id} className="px-3 py-2 align-top">
                                <LeafValue field={field} value={item.data[field.id]} workspaceSlug={workspaceSlug} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {totalCount > 0 && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-4 py-2">
                  <span className="text-11 text-secondary">
                    {t("requirement_grid.data.range", {
                      start: currentPageOffset * itemsStore.perPage + 1,
                      end: Math.min(currentPageOffset * itemsStore.perPage + items.length, totalCount),
                      total: totalCount,
                    })}
                  </span>
                  <Pagination
                    simple
                    size="small"
                    current={currentPageOffset + 1}
                    pageSize={itemsStore.perPage}
                    total={totalCount}
                    showSizeChanger
                    pageSizeOptions={["20", "50", "100"]}
                    onChange={(page, pageSize) => {
                      if (pageSize !== itemsStore.perPage) {
                        itemsStore.setPerPage(pageSize);
                        return;
                      }
                      itemsStore.setCursor(page <= 1 ? undefined : `${pageSize}:${page - 1}:0`);
                    }}
                    onShowSizeChange={(_page, pageSize) => itemsStore.setPerPage(pageSize)}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
        <span className="min-w-0 truncate text-12 text-tertiary">
          {error ? (
            <span className="text-danger-primary">{error}</span>
          ) : selection.totalCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-secondary">
              <Check className="size-3.5 text-accent-primary" />
              {t("workspace_products.requirements.import_modal.selected_summary", {
                count: selection.totalCount,
                libraries: selection.libraryCount,
              })}
            </span>
          ) : (
            ""
          )}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isMutating}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleImport()}
            loading={isMutating}
            disabled={!selection.totalCount || isMutating}
          >
            {t("workspace_products.requirements.import_modal.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
