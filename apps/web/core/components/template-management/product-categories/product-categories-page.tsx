import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { AlertCircle, Tags } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductCategory } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductCategories } from "@/hooks/store/use-product-categories";
import { useTemplatePermissions } from "../permissions";
import { NameFormModal } from "./name-form-modal";
import { ProductCategoryDetail } from "./product-category-detail";
import { ProductCategoryList } from "./product-category-list";

/**
 * 模板中心「产品分类」：左分类列表、右分类详情（在用的库 + 一级模块表）。
 *
 * 读写口径跟标准需求库一致（requirement_library.view / manage）；无管理权限时只读。
 * 新建 / 编辑走弹窗表单，排序走显式的「调整顺序」模式（保存才提交），排序时锁住另一侧。
 * 选中分类走 `?category=`，库详情页的分类标签会带着它跳过来。
 */
export const ProductCategoriesPage = observer(function ProductCategoriesPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { canManageLibraries: canManage } = useTemplatePermissions(workspaceSlug);
  const store = useProductCategories(workspaceSlug);
  const { categories, isLoading, error, fetchCategories } = store;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [categorySortDraft, setCategorySortDraft] = useState<TProductCategory[] | null>(null);
  const [isSavingCategorySort, setIsSavingCategorySort] = useState(false);
  const [isSortingModules, setIsSortingModules] = useState(false);

  const isSortingCategories = categorySortDraft !== null;
  const selectedId = searchParams.get("category");
  const selected = categories.find((category) => category.id === selectedId) ?? categories[0] ?? null;

  const selectCategory = (categoryId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("category", categoryId);
    setSearchParams(next, { replace: true });
  };

  const handleCreate = async (name: string) => {
    const created = await store.createCategory(name);
    selectCategory(created.id);
    setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.created") });
  };

  const saveCategorySort = async () => {
    if (!categorySortDraft) return;
    setIsSavingCategorySort(true);
    try {
      await store.reorderCategories(categorySortDraft.map((category) => category.id));
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.order_saved") });
      setCategorySortDraft(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("product_categories.toast.reorder_failed") });
    } finally {
      setIsSavingCategorySort(false);
    }
  };

  // 给 detail 的卸载清理用，必须稳定
  const handleModuleSortingChange = useCallback((sorting: boolean) => setIsSortingModules(sorting), []);

  const renderBody = () => {
    if (isLoading && categories.length === 0) {
      return (
        <Loader className="flex min-h-0 flex-1 gap-4">
          <Loader.Item height="420px" width="248px" />
          <Loader.Item height="420px" width="100%" className="flex-1" />
        </Loader>
      );
    }
    if (error && categories.length === 0) {
      return (
        <div className="flex min-h-80 flex-1 items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t("product_categories.error_title")}</h2>
            <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
            <Button
              className="mt-4"
              variant="secondary"
              size="xl"
              onClick={() => void fetchCategories().catch(() => undefined)}
            >
              {t("retry")}
            </Button>
          </div>
        </div>
      );
    }
    if (categories.length === 0) {
      return (
        <div className="flex min-h-80 flex-1 items-center justify-center rounded-[10px] border border-subtle p-6 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Tags className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t("product_categories.empty.title")}</h2>
            {canManage && (
              <Button className="mt-4" variant="primary" size="xl" onClick={() => setIsCreating(true)}>
                {t("product_categories.create")}
              </Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <section className="flex min-h-[420px] flex-1 overflow-hidden rounded-xl border border-subtle-1">
        <div
          className={cn(
            "w-[248px] shrink-0 border-r border-subtle bg-surface-1 transition-opacity",
            isSortingModules && "pointer-events-none opacity-50"
          )}
        >
          <ProductCategoryList
            categories={categories}
            selectedId={selected?.id ?? null}
            onSelect={selectCategory}
            canManage={canManage}
            sortDraft={categorySortDraft}
            onStartSort={() => setCategorySortDraft(categories)}
            onSortChange={setCategorySortDraft}
            onCancelSort={() => setCategorySortDraft(null)}
            onSaveSort={() => void saveCategorySort()}
            isSavingSort={isSavingCategorySort}
          />
        </div>
        {selected && (
          <div
            className={cn(
              "flex min-w-0 flex-1 transition-opacity",
              isSortingCategories && "pointer-events-none opacity-50"
            )}
          >
            <ProductCategoryDetail
              key={selected.id}
              workspaceSlug={workspaceSlug}
              category={selected}
              store={store}
              canManage={canManage}
              onSortingChange={handleModuleSortingChange}
            />
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHead title={`${t("product_categories.title")} - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="bg-surface-1">
        <div className="flex h-full min-h-0 flex-col gap-5 px-7 pt-[22px] pb-6">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-20 leading-7 font-semibold text-primary">{t("product_categories.title")}</h1>
              <p className="mt-1 text-13 text-tertiary">{t("product_categories.description")}</p>
            </div>
            {canManage && (
              <Button
                variant="primary"
                size="xl"
                className="shrink-0 px-3"
                onClick={() => setIsCreating(true)}
                disabled={isSortingCategories || isSortingModules}
              >
                {t("product_categories.create")}
              </Button>
            )}
          </header>
          {renderBody()}
        </div>
      </ContentWrapper>
      <NameFormModal
        isOpen={isCreating}
        title={t("product_categories.form.create_category")}
        icon={<Tags className="size-4" />}
        label={t("product_categories.form.category_name")}
        maxLength={255}
        submitLabel={t("product_categories.form.submit_create")}
        onSubmit={handleCreate}
        onClose={() => setIsCreating(false)}
      />
    </>
  );
});
