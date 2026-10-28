import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowUpDown, Pencil, Tags } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TProductCategory,
  TProductCategoryInUseError,
  TProductCategoryModule,
  TProductCategoryModuleInUseError,
} from "@plane/types";
import { PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import type { TProductCategoriesStore } from "@/hooks/store/use-product-categories";
import { CountPill } from "./count-pill";
import { DeleteBlockedModal, type TDeleteBlocked } from "./delete-blocked-modal";
import { getProductCategoryErrorMessage } from "./helpers";
import { ModuleBulkAddModal } from "./module-bulk-add-modal";
import { NameFormModal } from "./name-form-modal";
import { ProductCategoryModuleTable } from "./product-category-module-table";

type Props = {
  workspaceSlug: string;
  category: TProductCategory;
  store: TProductCategoriesStore;
  canManage: boolean;
  /** 进 / 出「调整顺序」时通知页面，页面据此锁住左栏和创建按钮 */
  onSortingChange: (sorting: boolean) => void;
};

/**
 * 产品分类页右侧：分类名 + 在用标准库 + 编辑 / 删除；一级模块表（添加、调整顺序、行内编辑 / 删除）。
 * 模块的增删改排都会被后端同步到所有用该分类的库。调用方按分类 id 给 key。
 */
export function ProductCategoryDetail({ workspaceSlug, category, store, canManage, onSortingChange }: Props) {
  const { t } = useTranslation();
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [isAddingModules, setIsAddingModules] = useState(false);
  const [moduleToEdit, setModuleToEdit] = useState<TProductCategoryModule | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<TProductCategoryModule | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [blocked, setBlocked] = useState<TDeleteBlocked | null>(null);
  const [sortDraft, setSortDraft] = useState<TProductCategoryModule[] | null>(null);
  const [isSavingSort, setIsSavingSort] = useState(false);

  const libraryCount = category.libraries.length;
  const sorting = sortDraft !== null;

  // 卸载（换分类、分类被删）时别把页面留在「排序中」
  useEffect(() => () => onSortingChange(false), [onSortingChange]);

  const startSort = () => {
    setSortDraft(category.modules);
    onSortingChange(true);
  };
  const endSort = () => {
    setSortDraft(null);
    onSortingChange(false);
  };

  const saveSort = async () => {
    if (!sortDraft) return;
    setIsSavingSort(true);
    try {
      await store.reorderModules(
        category.id,
        sortDraft.map((module) => module.id)
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.order_saved") });
      endSort();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("product_categories.toast.reorder_failed") });
    } finally {
      setIsSavingSort(false);
    }
  };

  const handleDeleteCategory = async () => {
    setIsSubmittingDelete(true);
    try {
      await store.deleteCategory(category.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.deleted") });
    } catch (error) {
      const payload = error as Partial<TProductCategoryInUseError> | undefined;
      if (payload?.code === "PRODUCT_CATEGORY_IN_USE") {
        setBlocked({
          name: category.name,
          description: t("product_categories.blocked.category_description"),
          libraries: payload.libraries ?? [],
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: getProductCategoryErrorMessage(error, t) });
      }
    } finally {
      setIsSubmittingDelete(false);
      setIsDeletingCategory(false);
    }
  };

  const handleDeleteModule = async () => {
    if (!moduleToDelete) return;
    setIsSubmittingDelete(true);
    try {
      await store.deleteModule(category.id, moduleToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.deleted") });
    } catch (error) {
      const payload = error as Partial<TProductCategoryModuleInUseError> | undefined;
      if (payload?.code === "PRODUCT_CATEGORY_MODULE_IN_USE") {
        setBlocked({
          name: moduleToDelete.name,
          description: t("product_categories.blocked.module_description"),
          libraries: (payload.libraries ?? []).map((library) => ({
            id: library.id,
            name: library.name,
            summary: [
              library.child_count > 0
                ? t("product_categories.blocked.child_count", { count: library.child_count })
                : null,
              library.item_count > 0
                ? t("product_categories.blocked.item_count", { count: library.item_count })
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: getProductCategoryErrorMessage(error, t) });
      }
    } finally {
      setIsSubmittingDelete(false);
      setModuleToDelete(null);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-4 px-6 pt-5",
          libraryCount > 0 ? "pb-0" : "pb-5"
        )}
      >
        <div className="min-w-0">
          <h2 className="truncate text-18 leading-[26px] font-semibold text-primary">{category.name}</h2>
          <div className="mt-0.5 flex items-center text-13 text-tertiary">
            <span>{t("product_categories.meta_modules", { count: category.modules.length })}</span>
            <span className="mx-2.5 h-3 border-l border-strong" />
            <span>
              {libraryCount > 0
                ? t("product_categories.meta_libraries", { count: libraryCount })
                : t("product_categories.meta_no_libraries")}
            </span>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="xl"
              className="px-3"
              onClick={() => setIsEditingCategory(true)}
              disabled={sorting}
            >
              {t("product_categories.edit")}
            </Button>
            <Button
              variant="secondary"
              size="xl"
              className="px-3 text-danger-primary"
              onClick={() => setIsDeletingCategory(true)}
              disabled={sorting}
            >
              {t("product_categories.delete")}
            </Button>
          </div>
        )}
      </div>

      {libraryCount > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pt-3.5 pb-[18px]">
          <span className="mr-1 text-13 text-tertiary">{t("product_categories.in_use_libraries")}</span>
          {category.libraries.map((library) => (
            <Link
              key={library.id}
              to={`/${workspaceSlug}/templates/libraries/${library.id}`}
              className="inline-flex h-7 max-w-60 items-center gap-1.5 rounded-md border border-subtle-1 bg-surface-1 pr-2.5 pl-2 text-13 text-primary transition-colors hover:bg-layer-transparent-hover"
            >
              <TypeIcon
                iconProps={library.requirement_type_detail?.logo_props?.icon}
                className="size-3.5 rounded-none"
                iconClassName="size-3.5"
              />
              <span className="truncate">{library.name}</span>
            </Link>
          ))}
        </div>
      )}

      {sorting ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-accent-subtle bg-accent-subtle px-6 py-3">
          <ArrowUpDown className="size-4 shrink-0 text-accent-primary" />
          <span className="min-w-0 flex-1 text-13 text-primary">
            {libraryCount > 0
              ? t("product_categories.sort_hint_sync", { count: libraryCount })
              : t("product_categories.sort_hint")}
          </span>
          <Button variant="secondary" size="xl" className="px-3" onClick={endSort} disabled={isSavingSort}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="xl" className="px-3" onClick={() => void saveSort()} loading={isSavingSort}>
            {t("product_categories.save_order")}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-subtle px-6 py-3.5">
          <div className="flex h-8 items-center gap-2">
            <span className="text-[15px] font-semibold text-primary">{t("product_categories.modules_title")}</span>
            <CountPill count={category.modules.length} />
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {category.modules.length > 1 && (
                <Button variant="secondary" size="xl" className="px-3" onClick={startSort}>
                  {t("product_categories.adjust_order")}
                </Button>
              )}
              <Button variant="primary" size="xl" className="px-3" onClick={() => setIsAddingModules(true)}>
                {t("product_categories.add_module")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
        <ProductCategoryModuleTable
          modules={sortDraft ?? category.modules}
          canManage={canManage}
          sorting={sorting}
          onSortChange={setSortDraft}
          onEdit={setModuleToEdit}
          onDelete={setModuleToDelete}
        />
      </div>

      <NameFormModal
        isOpen={isEditingCategory}
        title={t("product_categories.form.edit_category")}
        icon={<Tags className="size-4" />}
        label={t("product_categories.form.category_name")}
        initialValue={category.name}
        maxLength={255}
        submitLabel={t("product_categories.form.submit_save")}
        onSubmit={async (name) => {
          await store.renameCategory(category.id, name);
          setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.saved") });
        }}
        onClose={() => setIsEditingCategory(false)}
      />
      <NameFormModal
        isOpen={moduleToEdit !== null}
        title={t("product_categories.form.edit_module")}
        icon={<Pencil className="size-4" />}
        label={t("product_categories.form.module_name")}
        initialValue={moduleToEdit?.name ?? ""}
        maxLength={PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH}
        showCounter
        contextTag={category.name}
        footerNote={libraryCount > 0 ? t("product_categories.form.sync_rename", { count: libraryCount }) : undefined}
        submitLabel={t("product_categories.form.submit_save")}
        onSubmit={async (name) => {
          if (!moduleToEdit) return;
          await store.renameModule(category.id, moduleToEdit.id, name);
          setToast({ type: TOAST_TYPE.SUCCESS, title: t("product_categories.toast.saved") });
        }}
        onClose={() => setModuleToEdit(null)}
      />
      <ModuleBulkAddModal
        isOpen={isAddingModules}
        category={category}
        onSubmit={async (names) => {
          const response = await store.bulkCreateModules(category.id, names);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title:
              response.skipped.length > 0
                ? t("product_categories.toast.modules_partially_added", {
                    added: response.created.length,
                    skipped: response.skipped.length,
                  })
                : t("product_categories.toast.modules_added", { count: response.created.length }),
          });
          return response;
        }}
        onClose={() => setIsAddingModules(false)}
      />
      <AlertModalCore
        isOpen={isDeletingCategory}
        handleClose={() => setIsDeletingCategory(false)}
        handleSubmit={() => void handleDeleteCategory()}
        isSubmitting={isSubmittingDelete}
        title={t("product_categories.delete_category.title", { name: category.name })}
        content={t("product_categories.delete_category.content")}
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
      <AlertModalCore
        isOpen={moduleToDelete !== null}
        handleClose={() => setModuleToDelete(null)}
        handleSubmit={() => void handleDeleteModule()}
        isSubmitting={isSubmittingDelete}
        title={t("product_categories.delete_module.title", { name: moduleToDelete?.name ?? "" })}
        content={
          libraryCount > 0
            ? t("product_categories.delete_module.content", { count: libraryCount })
            : t("product_categories.delete_module.content_unused")
        }
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
      <DeleteBlockedModal
        workspaceSlug={workspaceSlug}
        blocked={blocked}
        categoryLibraries={category.libraries}
        onClose={() => setBlocked(null)}
      />
    </div>
  );
}
