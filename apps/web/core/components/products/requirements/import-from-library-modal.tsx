"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Library, Search, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementDetail, TRequirementDetailImportPayload } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { LeafValue } from "@/components/template-management/requirements/requirement-grid-shared";
import { useLibraryItems } from "@/hooks/store/use-library-items";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";

/**
 * 从标准库导入条目到产品需求。
 *
 * 左侧常驻标准库列表，右侧是所选库的条目；勾选按条目 ID 存在一个 Map 里，切库时不清空，
 * 所以可以跨库攒一批再一次性导入。接口一次只收一个 library_id，跨库的部分由调用方按库
 * 分组后顺序调用（见 useRequirementDetails.importFromLibraries）。
 *
 * 刻意不复用 RequirementDetailGrid：它的勾选是接删除的，还自带编辑工具栏与 bulk-save
 * 契约。这里只复用它的展示部件 LeafValue，让列的呈现和标准库页保持一致。
 */
type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  isMutating: boolean;
  /**
   * 预热开关。本组件常驻挂载（不是 isOpen && 才渲染），所以标准库列表在进页面时就
   * 拉好了；这个开关再往前一步，在用户「有意打开」（hover / focus 按钮）时就把第一个
   * 库的条目也拉回来，点开时基本是瞬开的。
   */
  shouldPrefetch?: boolean;
  onClose: () => void;
  onImport: (payloads: TRequirementDetailImportPayload[]) => Promise<unknown>;
};

export const RequirementImportFromLibraryModal = ({
  isOpen,
  workspaceSlug,
  isMutating,
  shouldPrefetch = false,
  onClose,
  onImport,
}: TProps) => {
  const { t } = useTranslation();
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  // 存整行而不只是 ID：跨库、跨分页之后还要按 library_id 分组提交
  const [selected, setSelected] = useState<Map<string, TRequirementDetail>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const { libraries, isLoading: isLibrariesLoading } = useRequirementLibraries(workspaceSlug);
  const itemsStore = useLibraryItems({ workspaceSlug, libraryId: libraryId ?? undefined });

  useEffect(() => {
    if (isOpen) return;
    // 刻意不重置 libraryId：留着它，下次打开就不用重新拉一遍条目，也保留了上次看到哪个库
    setLibrarySearch("");
    setSelected(new Map());
    setError(null);
  }, [isOpen]);

  const filteredLibraries = useMemo(() => {
    const keyword = librarySearch.trim().toLowerCase();
    if (!keyword) return libraries;
    return libraries.filter(
      (library) =>
        library.name.toLowerCase().includes(keyword) ||
        (library.template_detail?.title ?? "").toLowerCase().includes(keyword)
    );
  }, [libraries, librarySearch]);

  // 自动选中第一个非空的库，省掉一次点击；预热时就选，这样条目也能提前拉好
  useEffect(() => {
    if (!(isOpen || shouldPrefetch) || libraryId || !libraries.length) return;
    setLibraryId((libraries.find((library) => library.item_count > 0) ?? libraries[0]).id);
  }, [isOpen, shouldPrefetch, libraries, libraryId]);

  /** 每个库已勾选多少条 —— 左侧列表要显示这个，跨库勾选才看得见 */
  const selectedCountByLibrary = useMemo(() => {
    const counts = new Map<string, number>();
    selected.forEach((item) => {
      if (item.library_id) counts.set(item.library_id, (counts.get(item.library_id) ?? 0) + 1);
    });
    return counts;
  }, [selected]);

  /**
   * 「还在自动选库的路上」：库还在加载，或者已经加载出来但自动选中的 effect 还没跑。
   * 这两种情况右侧都不该出现「请先选择标准库」—— 用户什么都还没来得及做。
   */
  const isBootstrapping = isLibrariesLoading || (!libraryId && libraries.length > 0);

  const activeLibrary = libraries.find((library) => library.id === libraryId);
  const fields = itemsStore.configuration?.fields ?? [];
  const visibleFields = useMemo(() => fields.filter((field) => field.is_active).slice(0, 3), [fields]);
  const items = itemsStore.detailsPage.results;
  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  const toggleItem = (item: TRequirementDetail) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });

  const toggleAllOnPage = () =>
    setSelected((current) => {
      const next = new Map(current);
      if (allOnPageSelected) items.forEach((item) => next.delete(item.id));
      else items.forEach((item) => next.set(item.id, item));
      return next;
    });

  const switchLibrary = (nextId: string) => {
    if (nextId === libraryId) return;
    setLibraryId(nextId);
    // 搜索是按当前库的条目搜的，换库后留着会让人以为「这个库只有这几条」
    itemsStore.setSearch("");
    itemsStore.setCursor(undefined);
  };

  const handleImport = async () => {
    if (!selected.size) return;
    setError(null);
    // 按库分组：接口一次只收一个 library_id
    const byLibrary = new Map<string, string[]>();
    selected.forEach((item, itemId) => {
      if (!item.library_id) return;
      byLibrary.set(item.library_id, [...(byLibrary.get(item.library_id) ?? []), itemId]);
    });
    try {
      await onImport([...byLibrary].map(([library_id, item_ids]) => ({ library_id, item_ids })));
      onClose();
    } catch (requestError) {
      const payload = requestError as { error?: string };
      setError(payload?.error ?? t("workspace_products.requirements.import_modal.error_title"));
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
            <p className="text-11 text-secondary">{t("workspace_products.requirements.import_modal.description")}</p>
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
              /* 每条按真实条目的两行结构排（名称 + 模板/条数），避免加载完之后列表跳一下 */
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
                  const pickedCount = selectedCountByLibrary.get(library.id) ?? 0;
                  return (
                    <li key={library.id}>
                      <button
                        type="button"
                        onClick={() => switchLibrary(library.id)}
                        className={cn(
                          "relative w-full rounded-md px-2.5 py-2 text-left transition-colors",
                          isActive ? "bg-layer-2" : "hover:bg-layer-1"
                        )}
                      >
                        {isActive && (
                          <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent-primary" />
                        )}
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
                          {t("workspace_products.requirements.import_modal.library_meta", {
                            template: library.template_detail?.title ?? "",
                            count: library.item_count,
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

              <div className="min-h-0 flex-1 overflow-auto">
                {itemsStore.isDetailsLoading && !items.length ? (
                  <div className="p-4">
                    <Loader>
                      <Loader.Item height="160px" />
                    </Loader>
                  </div>
                ) : !items.length ? (
                  <p className="grid h-full place-items-center text-12 text-secondary">
                    {t("workspace_products.requirements.import_modal.empty_items")}
                  </p>
                ) : (
                  <table className="w-full border-collapse text-13">
                    <thead className="sticky top-0 z-10 bg-surface-1">
                      <tr className="border-b border-subtle text-left text-11 font-medium text-secondary">
                        <th className="w-9 px-3 py-2">
                          <input
                            type="checkbox"
                            className="size-3.5 cursor-pointer"
                            checked={allOnPageSelected}
                            onChange={toggleAllOnPage}
                            aria-label={t("workspace_products.requirements.import_modal.select_all_page")}
                          />
                        </th>
                        {visibleFields.map((field) => (
                          <th key={field.id} className="min-w-[130px] px-3 py-2">
                            <span className="truncate">{field.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isPicked = selected.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            onClick={() => toggleItem(item)}
                            className={cn(
                              "cursor-pointer border-b border-subtle transition-colors",
                              isPicked ? "bg-accent-subtle/40" : "hover:bg-layer-1"
                            )}
                          >
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                className="size-3.5 cursor-pointer"
                                checked={isPicked}
                                onChange={() => toggleItem(item)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
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
            </>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
        <span className="min-w-0 truncate text-12 text-tertiary">
          {error ? (
            <span className="text-danger-primary">{error}</span>
          ) : selected.size > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-secondary">
              <Check className="size-3.5 text-accent-primary" />
              {t("workspace_products.requirements.import_modal.selected_summary", {
                count: selected.size,
                libraries: selectedCountByLibrary.size,
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
            disabled={!selected.size || isMutating}
          >
            {t("workspace_products.requirements.import_modal.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
