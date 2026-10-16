"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementImportPayload } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { getCurrentPageOffset } from "@/components/requirements/requirement-grid-shared";
import { useImportableLibraryItems } from "@/hooks/store/use-importable-library-items";
import { useLibraryItems } from "@/hooks/store/use-library-items";
import { useLibraryModuleTrees } from "@/hooks/store/use-library-module-trees";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";
import { RequirementGridPagination } from "@/components/requirements/requirement-grid-pagination";
import { useProductsContext } from "../context";
import {
  collectModuleIds,
  collectSelectionSourceNames,
  findModuleNamePath,
  RequirementImportLibraryTree,
  UNASSIGNED_MODULE_ID,
  type TImportTreeNode,
} from "./import-library-tree";
import { getSelectionState, useLibraryImportSelection } from "./use-library-import-selection";

/**
 * 从标准库导入条目到产品需求。
 *
 * 左侧是一棵「需求类型 → 标准库 → 模块」的可勾选树，右侧是当前节点（及其子模块）下的
 * 条目；勾选按 `库 -> 条目 ID` 存在 useLibraryImportSelection 里，切节点不清空，所以
 * 可以跨模块、跨库攒一批再一次性导入。接口一次只收一个 library_id，跨库的部分由调用方
 * 按库分组后顺序调用（见 useProductRequirements.importFromLibraries）。
 *
 * 已经导进本产品的条目不进候选池，但右侧列表照样列出来（置灰、打「已导入」标签、不可勾）
 * —— 用户要能看到「这几条我已经有了」。判定依据是 useImportableLibraryItems 的可导 id
 * 集合：不在里面的就是已导入。树上每个节点的可导条数与「勾节点」的那批 id 也来自它
 * （它带回每条的 module_id，模块级的数字只能这么算 —— 模块树接口自带的 count 是库内
 * 全量、不排除已导入的）。
 *
 * 刻意不复用 RequirementGrid：它的勾选是接删除的，还自带编辑工具栏与 bulk-save
 * 契约。预览只出 编号 / 标题 / 状态 三列，够认人即可。
 */


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
  const { products } = useProductsContext();
  const product = products.find((entry) => entry.id === productId);
  const [activeNode, setActiveNode] = useState<TImportTreeNode | null>(null);
  const [treeSearch, setTreeSearch] = useState("");
  /** 每次打开自增，用来让左树丢掉上一次的模块树缓存与展开状态 */
  const [treeRevision, setTreeRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const libraryId = activeNode?.libraryId ?? null;

  const { libraries, isLoading: isLibrariesLoading } = useRequirementLibraries(workspaceSlug);
  // 树上每个节点的可导条数与「勾节点」的 id 都来自这里；跟条目列表一样只在有意打开时才拉
  const {
    itemsByLibrary,
    itemIdsByLibrary,
    isLoading: isImportableLoading,
    refetch: refetchImportable,
  } = useImportableLibraryItems({
    workspaceSlug,
    productId,
    enabled: isOpen || shouldPrefetch,
  });
  const moduleTrees = useLibraryModuleTrees(workspaceSlug);
  const itemsStore = useLibraryItems({
    workspaceSlug,
    libraryId: libraryId ?? undefined,
  });
  const selection = useLibraryImportSelection(itemIdsByLibrary);

  useEffect(() => {
    if (isOpen) return;
    // 刻意不重置 activeNode：留着它，下次打开就不用重新拉一遍条目，也保留了上次看到哪个节点
    setTreeSearch("");
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
    // 模块树同理：上次打开之后库里的模块可能已经增删改过
    moduleTrees.reset();
    setTreeRevision((current) => current + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const importableCountOf = (id: string) => itemIdsByLibrary.get(id)?.length ?? 0;

  // 自动选中第一个还有东西可导的库，省掉一次点击；预热时就选，这样条目也能提前拉好
  useEffect(() => {
    if (!(isOpen || shouldPrefetch) || libraryId || !libraries.length) return;
    setActiveNode({
      libraryId: (libraries.find((library) => (itemIdsByLibrary.get(library.id)?.length ?? 0) > 0) ?? libraries[0])
        .id,
      moduleId: null,
    });
  }, [isOpen, shouldPrefetch, libraries, libraryId, itemIdsByLibrary]);

  /**
   * 「还在自动选库的路上」：库还在加载，或者已经加载出来但自动选中的 effect 还没跑。
   * 这两种情况右侧都不该出现「请先选择标准库」—— 用户什么都还没来得及做。
   */
  const isBootstrapping = isLibrariesLoading || (!libraryId && libraries.length > 0);

  const activeLibrary = libraries.find((library) => library.id === libraryId);
  const items = itemsStore.requirementsPage.results;
  const totalCount = itemsStore.requirementsPage.total_count ?? 0;
  const currentPageOffset = getCurrentPageOffset(
    itemsStore.requirementsPage.prev_cursor,
    itemsStore.requirementsPage.next_cursor,
    itemsStore.requirementsPage.prev_page_results,
    itemsStore.requirementsPage.next_page_results
  );
  /** 当前库的可导 id；不在里面的行就是已导入。可导集合还在拉时一律当可导，免得整页闪成灰的 */
  const importableIds = useMemo(
    () => new Set(libraryId ? (itemIdsByLibrary.get(libraryId) ?? []) : []),
    [itemIdsByLibrary, libraryId]
  );
  const isImported = (itemId: string) => !isImportableLoading && !importableIds.has(itemId);
  /** 可导集合没回来前不让勾：此时分不清哪些已导入，勾上的已导入条目会让整批导入被拒 */
  const selectableIdsOnPage = isImportableLoading
    ? []
    : items.filter((item) => !isImported(item.id)).map((item) => item.id);
  const pickedOnPage = libraryId ? selectableIdsOnPage.filter((itemId) => selection.isPicked(libraryId, itemId)).length : 0;
  const pageState = getSelectionState(pickedOnPage, selectableIdsOnPage.length);
  /** 该库有条目、但全都导进本产品了 —— 与「本来就是空库」是两回事，右侧文案要分开 */
  const isActiveLibraryDrained =
    !isImportableLoading && (activeLibrary?.item_count ?? 0) > 0 && importableCountOf(libraryId ?? "") === 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [itemsStore.cursor]);

  /**
   * 当前节点（含子模块）下还能导几条 —— 右侧标题「N 条，已导入 M 条」的 M = 列表总数 − 它。
   * 列表总数来自分页接口（含已导入），可导数来自可导集合，两边口径一致才能相减。
   */
  const importableInNode = useMemo(() => {
    if (!libraryId) return 0;
    const libraryItems = itemsByLibrary.get(libraryId) ?? [];
    const moduleId = activeNode?.moduleId;
    if (!moduleId) return libraryItems.length;
    if (moduleId === UNASSIGNED_MODULE_ID) return libraryItems.filter((item) => !item.module_id).length;
    const moduleIds = collectModuleIds(moduleTrees.treesByLibrary.get(libraryId) ?? [], moduleId);
    return libraryItems.filter((item) => item.module_id && moduleIds.has(item.module_id)).length;
  }, [activeNode?.moduleId, itemsByLibrary, libraryId, moduleTrees.treesByLibrary]);

  const selectionSourceNames = useMemo(
    () =>
      collectSelectionSourceNames({
        selected: selection.selected,
        itemsByLibrary,
        treesByLibrary: moduleTrees.treesByLibrary,
        libraries,
        unassignedLabel: t("requirement_modules.unassigned"),
      }),
    [itemsByLibrary, libraries, moduleTrees.treesByLibrary, selection.selected, t]
  );

  /** 右侧面包屑：库名 + 从根到当前模块的名称路径 */
  const activeModulePath = useMemo(() => {
    if (!libraryId || !activeNode?.moduleId) return [];
    if (activeNode.moduleId === UNASSIGNED_MODULE_ID) return [t("requirement_modules.unassigned")];
    return findModuleNamePath(moduleTrees.treesByLibrary.get(libraryId) ?? [], activeNode.moduleId);
  }, [activeNode?.moduleId, libraryId, moduleTrees.treesByLibrary, t]);

  const selectNode = (node: TImportTreeNode) => {
    if (node.libraryId === libraryId && node.moduleId === activeNode?.moduleId) return;
    setActiveNode(node);
    itemsStore.setModuleId(node.moduleId);
    // 搜索是按当前节点下的条目搜的，换了节点还留着会让人以为「这里只有这几条」
    if (itemsStore.search) itemsStore.setSearch("");
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


  const nodeTitle = activeModulePath.length ? activeModulePath[activeModulePath.length - 1] : (activeLibrary?.name ?? "");
  /** 标题上方的小字：选的是模块时是「库 / 上级模块」，选的是整库时是它所属的需求类型 */
  const nodeCaption = activeModulePath.length
    ? [activeLibrary?.name ?? "", ...activeModulePath.slice(0, -1)].join(" / ")
    : (activeLibrary?.requirement_type_detail?.name ?? "");
  const showNodeSummary = !itemsStore.search && !isImportableLoading && !itemsStore.isRequirementsLoading;
  const shownSourceNames = selectionSourceNames.slice(0, 2).join("、");
  const productLabel = product?.identifier || product?.name || "";

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIIXL}
      className="sm:max-w-[1120px]"
    >
      <div className="flex h-[700px] max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-16 font-semibold text-primary">
              {t("workspace_products.requirements.import_modal.title")}
            </h2>
            {productLabel && (
              <p className="mt-0.5 truncate text-13 text-tertiary">
                {t("workspace_products.requirements.import_modal.subtitle", { product: productLabel })}
              </p>
            )}
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左：需求类型（分组小标题）→ 标准库 → 模块 的可勾选树，常驻 */}
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-subtle bg-surface-2">
            <div className="shrink-0 px-3.5 pt-4">
              <label className="flex h-[34px] items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
                <Search className="size-[15px] shrink-0 text-placeholder" />
                <input
                  value={treeSearch}
                  onChange={(event) => setTreeSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
                  placeholder={t("workspace_products.requirements.import_modal.search_tree")}
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">
              {isLibrariesLoading ? (
                /* 每条按真实节点的高度排，避免加载完之后列表跳一下 */
                <ul className="mt-3.5 space-y-0.5">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <li
                      key={index}
                      className="flex h-[34px] items-center px-2"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <span className="block h-3 w-3/4 animate-pulse rounded bg-layer-1" />
                    </li>
                  ))}
                </ul>
              ) : (
                <RequirementImportLibraryTree
                  libraries={libraries}
                  itemsByLibrary={itemsByLibrary}
                  treesByLibrary={moduleTrees.treesByLibrary}
                  ensureModules={(id) => void moduleTrees.ensureModules(id)}
                  search={treeSearch}
                  selection={selection}
                  activeNode={activeNode}
                  onSelectNode={selectNode}
                  revision={treeRevision}
                />
              )}
            </div>
          </aside>

          {/* 右：所选节点（含其子模块）下的条目 */}
          <section className="flex min-w-0 flex-1 flex-col">
            {isBootstrapping ? (
              /* 打开瞬间会自动选中第一个库，这段空档给骨架而不是提示文案 ——
                 否则用户会看到「请先选择标准库」一闪而过，像是操作失败了。
                 骨架按最终布局排（顶栏 + 表头 + 若干行），切换到真数据时不会跳版。 */
              <>
                <div className="flex h-[62px] shrink-0 items-center gap-3 px-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="h-3 w-24 animate-pulse rounded bg-layer-1" />
                    <span className="h-4 w-40 animate-pulse rounded bg-layer-1" />
                  </div>
                  <span className="ml-auto h-[34px] w-[220px] animate-pulse rounded-md bg-layer-1" />
                </div>
                <div className="min-h-0 flex-1 border-t border-subtle">
                  <span className="block h-[38px] animate-pulse bg-surface-2" />
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="flex h-[46px] items-center border-b border-subtle px-5">
                      <span
                        className="block h-3 w-full animate-pulse rounded bg-layer-1"
                        style={{ animationDelay: `${index * 60}ms` }}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : !libraryId ? (
              /* 走到这里只可能是一个库都没有 —— 此时说「请先选择」是没意义的 */
              <p className="grid flex-1 place-items-center text-14 text-tertiary">
                {t("workspace_products.requirements.import_modal.empty_libraries")}
              </p>
            ) : (
              <>
                <div className="flex h-[62px] shrink-0 items-center gap-3 px-5">
                  <div className="min-w-0 flex-1">
                    {nodeCaption && <div className="truncate text-12 text-tertiary">{nodeCaption}</div>}
                    <div className="mt-px flex min-w-0 items-baseline gap-1.5">
                      <span className="min-w-0 truncate text-[15px] font-semibold text-primary">{nodeTitle}</span>
                      {showNodeSummary && (
                        <span className="shrink-0 text-13 whitespace-nowrap text-tertiary">
                          {t("workspace_products.requirements.import_modal.node_summary", {
                            total: totalCount,
                            imported: Math.max(totalCount - importableInNode, 0),
                          })}
                        </span>
                      )}
                      {activeNode?.moduleId && activeNode.moduleId !== UNASSIGNED_MODULE_ID && (
                        /* 点父模块看到的是整棵子树，不说清楚会以为列表串了别的模块的条目 */
                        <span className="shrink-0 rounded bg-layer-1 px-1.5 text-12 whitespace-nowrap text-tertiary">
                          {t("workspace_products.requirements.import_modal.includes_submodules")}
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="flex h-[34px] w-[220px] shrink-0 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
                    <Search className="size-[15px] shrink-0 text-placeholder" />
                    <input
                      value={itemsStore.search}
                      onChange={(event) => itemsStore.setSearch(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
                      placeholder={t("workspace_products.requirements.import_modal.search_items")}
                    />
                  </label>
                </div>

                <div ref={listRef} className="min-h-0 flex-1 overflow-auto border-t border-subtle">
                  {itemsStore.isRequirementsLoading && !items.length ? (
                    <div className="p-5">
                      <Loader>
                        <Loader.Item height="160px" />
                      </Loader>
                    </div>
                  ) : isActiveLibraryDrained && !itemsStore.search ? (
                    /* 「本来就是空库」和「都已经导进本产品了」是两回事，别用同一句话打发 */
                    <p className="grid h-full place-items-center text-14 text-tertiary">
                      {t("workspace_products.requirements.import_modal.all_imported")}
                    </p>
                  ) : !items.length ? (
                    <p className="grid h-full place-items-center text-14 text-tertiary">
                      {t("workspace_products.requirements.import_modal.empty_items")}
                    </p>
                  ) : (
                    <div role="table" className="min-w-full">
                      <div
                        role="row"
                        className="sticky top-0 z-10 grid h-[38px] grid-cols-[16px_92px_minmax(0,1fr)_120px] items-center gap-x-3 border-b border-subtle bg-surface-2 px-5 text-12 font-medium text-tertiary"
                      >
                        {/* 表头只管当前这一页（且已被搜索过滤）的可导行；整库全选在左栏 */}
                        <Checkbox
                          checked={pageState === "checked"}
                          indeterminate={pageState === "indeterminate"}
                          disabled={!selectableIdsOnPage.length}
                          onChange={() => selection.toggleItems(libraryId, selectableIdsOnPage)}
                          aria-label={t("workspace_products.requirements.import_modal.select_all_page")}
                        />
                        {/* 编号排在标题之前：导入后它会作为来源编号跟着落到产品需求上 */}
                        <span role="columnheader" className="truncate">
                          {t("requirements.identifier.column")}
                        </span>
                        <span role="columnheader" className="truncate">
                          {t("workspace_products.requirements.import_modal.column_title")}
                        </span>
                        <span role="columnheader" className="truncate">
                          {t("workspace_products.requirements.import_modal.column_status")}
                        </span>
                      </div>
                      {items.map((item) => {
                        const imported = isImported(item.id);
                        const isPicked = !imported && selection.isPicked(libraryId, item.id);
                        const isSelectable = !imported && !isImportableLoading;
                        return (
                          <div
                            key={item.id}
                            role="row"
                            onClick={isSelectable ? () => selection.toggleItem(libraryId, item.id) : undefined}
                            className={cn(
                              "grid h-[46px] grid-cols-[16px_92px_minmax(0,1fr)_120px] items-center gap-x-3 border-b border-subtle px-5 transition-colors",
                              !isSelectable
                                ? "cursor-default"
                                : isPicked
                                  ? "cursor-pointer bg-accent-subtle/50"
                                  : "cursor-pointer hover:bg-layer-transparent-hover"
                            )}
                          >
                            <Checkbox
                              checked={isPicked}
                              disabled={!isSelectable}
                              onChange={() => selection.toggleItem(libraryId, item.id)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span
                              className={`truncate font-mono text-13 tabular-nums ${imported ? "text-placeholder" : "text-tertiary"}`}
                            >
                              {item.display_id}
                            </span>
                            <span
                              className={`truncate text-14 ${imported ? "text-placeholder" : "font-medium text-primary"}`}
                              title={item.title}
                            >
                              {item.title || "—"}
                            </span>
                            <span>
                              {imported && (
                                <span className="inline-flex h-5 items-center rounded bg-layer-1 px-1.5 text-12 text-tertiary">
                                  {t("workspace_products.requirements.import_modal.tag_imported")}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {totalCount > 0 && (
                  <RequirementGridPagination
                    totalCount={totalCount}
                    perPage={itemsStore.perPage}
                    pageIndex={currentPageOffset}
                    onPageChange={(pageIndex) =>
                      itemsStore.setCursor(pageIndex <= 0 ? undefined : `${itemsStore.perPage}:${pageIndex}:0`)
                    }
                    onPerPageChange={(pageSize) => itemsStore.setPerPage(pageSize)}
                  />
                )}
              </>
            )}
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-subtle px-6 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {error ? (
              <span className="min-w-0 truncate text-13 text-danger-primary">{error}</span>
            ) : selection.totalCount > 0 ? (
              <>
                <span className="min-w-0 truncate text-13 text-primary">
                  {t("workspace_products.requirements.import_modal.selected_count", { count: selection.totalCount })}
                  {selectionSourceNames.length > 0 && (
                    <span className="text-tertiary">
                      {selectionSourceNames.length > 2
                        ? t("workspace_products.requirements.import_modal.sources_many", {
                            names: shownSourceNames,
                            count: selectionSourceNames.length,
                          })
                        : t("workspace_products.requirements.import_modal.sources_few", { names: shownSourceNames })}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-13 text-accent-primary hover:underline"
                  onClick={selection.clear}
                  disabled={isMutating}
                >
                  {t("workspace_products.requirements.import_modal.clear")}
                </button>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="xl" onClick={onClose} disabled={isMutating}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="xl"
              onClick={() => void handleImport()}
              loading={isMutating}
              disabled={!selection.totalCount || isMutating}
            >
              {selection.totalCount
                ? t("workspace_products.requirements.import_modal.confirm_count", { count: selection.totalCount })
                : t("workspace_products.requirements.import_modal.confirm")}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};
