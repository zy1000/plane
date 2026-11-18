import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { AlertCircle, Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementLibrary } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "../permissions";
import { ProductCategoryTag } from "../product-categories/product-category-tag";
import { TemplateLibraryTable } from "../template-library-table";
import { TemplatePageHeader, TemplatePageSearch, TemplatePageTabs } from "../template-page-header";
import { useRequirementLibrariesContext } from "./context";

/** 按需求类型给类型标签上色：同一类型同一色，类型多了循环用 */
const TYPE_TONES = [
  "bg-[#E6EFFA] text-[#1E63A6]",
  "bg-[#FDF1DC] text-[#93590B]",
  "bg-[#EFEBFB] text-[#5B3DB0]",
  "bg-[#E1F3F1] text-[#13786E]",
  "bg-[#FCEEE2] text-[#C25A12]",
];

/**
 * 标准需求库列表：与测试用例库同一套列（TemplateLibraryTable）+ 按需求类型筛选的页签。
 *
 * 一个工作区通常只有几个到十几个库，不分页、不批量勾选。
 * `?requirement_type=` 仍然生效（需求类型页「N 个标准库在用」会带着它跳过来）。
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

  const findLibrary = (id: string) => libraries.find((library) => library.id === id) ?? null;

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
        <Loader className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Loader.Item key={index} height="48px" />
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
    if (filteredLibraries.length === 0) {
      const isFiltered = Boolean(normalizedSearch || requirementTypeFilter);
      return (
        <div className="flex min-h-80 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Library className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">
              {t(isFiltered ? "requirement_libraries.list.empty_filtered_title" : "requirement_libraries.empty.title")}
            </h2>
            {!isFiltered && canManageLibraries && (
              <Button className="mt-4" variant="primary" size="xl" onClick={() => setIsCreateModalOpen(true)}>
                新建需求库
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <TemplateLibraryTable
        rows={filteredLibraries.map((library) => ({
          id: library.id,
          name: library.name,
          description: library.description ?? "",
          href: `/${workspaceSlug}/templates/libraries/${library.id}`,
          tag: (
            <>
              <span
                className={cn(
                  "inline-flex h-[22px] min-w-0 items-center truncate rounded-md px-2 text-12 font-medium",
                  toneByType.get(library.requirement_type_id) ?? TYPE_TONES[0]
                )}
              >
                {library.requirement_type_detail?.name}
              </span>
              {library.product_category_detail && <ProductCategoryTag name={library.product_category_detail.name} />}
            </>
          ),
          counts: [library.item_count, library.field_count],
          updatedAt: library.updated_at,
        }))}
        columnLabels={{ tag: "需求类型", counts: ["条目数", "字段数"] }}
        onEdit={canManageLibraries ? (id) => setLibraryToEdit(findLibrary(id)) : undefined}
        onDelete={canManageLibraries ? (id) => setLibraryToDelete(findLibrary(id)) : undefined}
      />
    );
  };

  const tabs = [
    { key: "all", label: "全部", count: libraries.length },
    ...typeOptions.map((option) => ({ key: option.id, label: option.name, count: option.count })),
  ];

  return (
    <>
      <PageHead title={`${t("requirement_libraries.title")} - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="flex min-h-0 flex-col bg-surface-1">
        <TemplatePageHeader
          title={t("requirement_libraries.title")}
          count={isLoading ? undefined : libraries.length}
          bordered={typeOptions.length === 0}
        >
          <TemplatePageSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("requirement_libraries.list.search_placeholder")}
          />
          {canManageLibraries && (
            <Button variant="primary" size="xl" className="px-3" onClick={() => setIsCreateModalOpen(true)}>
              新建需求库
            </Button>
          )}
        </TemplatePageHeader>
        {typeOptions.length > 0 && (
          <TemplatePageTabs
            ariaLabel="按需求类型筛选"
            tabs={tabs}
            activeKey={requirementTypeFilter ?? "all"}
            onChange={(key) => setTypeFilter(key === "all" ? null : key)}
          />
        )}
        <div className="px-7 py-6">{renderBody()}</div>
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
