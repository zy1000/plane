import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useSearchParams } from "react-router";
import { AlertCircle, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementLibrary } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { MoreMenu } from "@/components/project-issue-types/root";
import { useTemplatePermissions } from "../permissions";
import { ProductCategoryTag } from "../product-categories/product-category-tag";
import { useRequirementLibrariesContext } from "./context";

/** 按需求类型给卡片图标上色：同一类型同一色，类型多了循环用 */
const TYPE_TONES = [
  "bg-[#E6EFFA] text-[#1E63A6]",
  "bg-[#FDF1DC] text-[#93590B]",
  "bg-[#EFEBFB] text-[#5B3DB0]",
  "bg-[#E1F3F1] text-[#13786E]",
  "bg-[#FCEEE2] text-[#C25A12]",
];

/**
 * 标准需求库列表（方案 A）：卡片网格 + 按需求类型筛选。
 *
 * 一个工作区通常只有几个到十几个库，卡片能把类型、说明、条目数、字段数一眼看全；
 * 不再分页、不再批量勾选。`?requirement_type=` 仍然生效（需求类型页「N 个标准库在用」会带着它跳过来）。
 */
export const RequirementLibraryList = observer(function RequirementLibraryList() {
  const { t } = useTranslation();
  const {
    workspaceSlug,
    libraries,
    isLoading,
    isMutating,
    error,
    fetchLibraries,
    deleteLibraries,
    setIsCreateModalOpen,
    setLibraryToEdit,
  } = useRequirementLibrariesContext();
  const { canManageLibraries } = useTemplatePermissions(workspaceSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryToDelete, setLibraryToDelete] = useState<TRequirementLibrary | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const requirementTypeFilter = searchParams.get("requirement_type");

  /** 筛选药丸：出现过的需求类型，按库数多到少 */
  const typeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const library of libraries) {
      const current = map.get(library.requirement_type_id);
      if (current) current.count += 1;
      else
        map.set(library.requirement_type_id, {
          id: library.requirement_type_id,
          name: library.requirement_type_detail?.name ?? "",
          count: 1,
        });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [libraries]);
  const toneByType = useMemo(
    () => new Map(typeOptions.map((option, index) => [option.id, TYPE_TONES[index % TYPE_TONES.length]])),
    [typeOptions]
  );

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredLibraries = useMemo(
    () =>
      libraries.filter((library) => {
        if (requirementTypeFilter && library.requirement_type_id !== requirementTypeFilter) return false;
        if (!normalizedSearch) return true;
        return [library.name, library.description, library.requirement_type_detail?.name ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        );
      }),
    [libraries, normalizedSearch, requirementTypeFilter]
  );

  const setTypeFilter = (typeId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (typeId) next.set("requirement_type", typeId);
    else next.delete("requirement_type");
    setSearchParams(next, { replace: true });
  };

  const handleDelete = async () => {
    if (!libraryToDelete) return;
    try {
      await deleteLibraries([libraryToDelete.id]);
      setLibraryToDelete(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t("requirement_libraries.toast.deleted") });
    } catch (requestError) {
      const payload = requestError as { error?: string; detail?: string };
      setLibraryToDelete(null);
      void fetchLibraries().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? payload?.detail ?? t("requirement_libraries.toast.failed"),
      });
    }
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <Loader className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Loader.Item key={index} height="196px" />
          ))}
        </Loader>
      );
    }
    if (error) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t("requirement_libraries.list.error_title")}</h2>
            <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void fetchLibraries().catch(() => undefined)}>
              {t("retry")}
            </Button>
          </div>
        </div>
      );
    }
    if (filteredLibraries.length === 0 && !canManageLibraries) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Library className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">
              {t(
                normalizedSearch || requirementTypeFilter
                  ? "requirement_libraries.list.empty_filtered_title"
                  : "requirement_libraries.empty.title"
              )}
            </h2>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredLibraries.map((library) => (
          <div
            key={library.id}
            className="group relative flex flex-col gap-3 rounded-[14px] border border-subtle bg-surface-1 px-[18px] pb-4 pt-[18px] shadow-raised-100 transition-[border-color,box-shadow] hover:border-strong hover:shadow-raised-200"
          >
            <Link
              to={`/${workspaceSlug}/templates/libraries/${library.id}`}
              className="absolute inset-0 rounded-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong"
              aria-label={library.name}
            />
            <div className="pointer-events-none flex items-start gap-3">
              <span
                className={cn(
                  "grid size-[38px] shrink-0 place-items-center rounded-[10px]",
                  toneByType.get(library.requirement_type_id) ?? TYPE_TONES[0]
                )}
              >
                <Library className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-14 font-semibold leading-[22px] text-primary">{library.name}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <span
                    className={cn(
                      "inline-flex h-[22px] max-w-full items-center truncate rounded-md px-2 text-12 font-medium",
                      toneByType.get(library.requirement_type_id) ?? TYPE_TONES[0]
                    )}
                  >
                    {library.requirement_type_detail?.name}
                  </span>
                  {library.product_category_detail && <ProductCategoryTag name={library.product_category_detail.name} />}
                </span>
              </span>
            </div>
            {canManageLibraries && (
              <span className="absolute right-3 top-3 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <MoreMenu
                  title="标准库操作"
                  items={[
                    { label: t("edit"), icon: <Pencil className="size-3.5" />, onClick: () => setLibraryToEdit(library) },
                    {
                      label: t("delete"),
                      icon: <Trash2 className="size-3.5" />,
                      tone: "danger",
                      onClick: () => setLibraryToDelete(library),
                    },
                  ]}
                />
              </span>
            )}
            <p className="pointer-events-none line-clamp-2 min-h-10 text-13 leading-5 text-tertiary">
              {library.description || t("requirement_libraries.list.no_description")}
            </p>
            <div className="pointer-events-none flex items-end gap-6 border-t border-subtle pt-3">
              <span>
                <b
                  className={cn(
                    "block text-20 font-semibold leading-6 tabular-nums",
                    library.item_count > 0 ? "text-primary" : "text-placeholder"
                  )}
                >
                  {library.item_count}
                </b>
                <span className="text-12 text-tertiary">条目</span>
              </span>
              <span>
                <b className="block text-20 font-semibold leading-6 tabular-nums text-primary">{library.field_count}</b>
                <span className="text-12 text-tertiary">字段</span>
              </span>
              <span className="ml-auto text-12 text-tertiary">更新于 {renderFormattedDate(library.updated_at, "yyyy-MM-dd")}</span>
            </div>
          </div>
        ))}
        {canManageLibraries && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex min-h-[196px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-strong bg-surface-2 text-13 text-tertiary transition-colors hover:border-accent-strong hover:text-accent-primary"
          >
            <span className="grid size-9 place-items-center rounded-full bg-layer-1">
              <Plus className="size-4" />
            </span>
            {t("requirement_libraries.create")}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHead title={`${t("requirement_libraries.title")} - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="bg-surface-1">
        <div className="flex flex-col px-7 pb-8 pt-6">
          <div className="mb-4 flex flex-wrap items-start gap-4">
            <div className="min-w-0">
              <h1 className="text-20 font-semibold text-primary">{t("requirement_libraries.title")}</h1>
              <p className="mt-1 text-13 text-secondary">按需求类型沉淀的标准需求条目，产品可以从这里整批导入。</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex h-8 w-56 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-placeholder focus-within:border-accent-strong">
                <SearchIcon className="size-3.5 shrink-0" />
                <input
                  className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
                  placeholder={t("requirement_libraries.list.search_placeholder")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Escape" && setSearchQuery("")}
                />
                {searchQuery && (
                  <button type="button" className="grid place-items-center hover:text-primary" onClick={() => setSearchQuery("")}>
                    <CloseIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
              {canManageLibraries && (
                <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="size-3.5" />
                  {t("requirement_libraries.create")}
                </Button>
              )}
            </div>
          </div>

          {typeOptions.length > 0 && (
            <div className="mb-[18px] flex flex-wrap gap-1.5">
              {[{ id: null, name: "全部", count: libraries.length }, ...typeOptions].map((option) => {
                const isActive = (option.id ?? null) === (requirementTypeFilter ?? null);
                return (
                  <button
                    key={option.id ?? "all"}
                    type="button"
                    onClick={() => setTypeFilter(option.id)}
                    className={cn(
                      "inline-flex h-[30px] items-center gap-1.5 rounded-[15px] border px-3 text-13 transition-colors",
                      isActive
                        ? "border-[var(--text-color-primary)] bg-[var(--text-color-primary)] text-[var(--background-color-surface-1)]"
                        : "border-subtle bg-surface-1 text-secondary hover:text-primary"
                    )}
                  >
                    {option.name}
                    <span className={cn("text-12 font-medium", isActive ? "opacity-70" : "text-tertiary")}>{option.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {renderBody()}
        </div>
      </ContentWrapper>

      <AlertModalCore
        handleClose={() => setLibraryToDelete(null)}
        handleSubmit={handleDelete}
        isSubmitting={isMutating}
        isOpen={Boolean(libraryToDelete)}
        title={t("requirement_libraries.list.delete_title")}
        content={
          <>
            {t("requirement_libraries.list.delete_description_prefix")}
            <span className="font-medium text-primary">{libraryToDelete?.name}</span>
            {t("requirement_libraries.list.delete_description_suffix")}
            {/* AlertModalCore 已经把 content 包在 <p> 里，这里只能用 span 换行 */}
            {libraryToDelete && libraryToDelete.item_count > 0 && (
              <span className="mt-2 block text-danger-primary">
                {t("requirement_libraries.list.delete_cascade_notice", { count: libraryToDelete.item_count })}
              </span>
            )}
          </>
        }
      />
    </>
  );
});
