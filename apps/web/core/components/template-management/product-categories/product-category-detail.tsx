import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowUpDown, FlaskConical, Pencil, Tags } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TProductCategory,
  TProductCategoryInUseError,
  TProductCategoryLibraryKind,
  TProductCategoryModule,
  TProductCategoryModuleInUseError,
} from "@plane/types";
import { PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { TypeIcon } from "@/components/common/type-icon-picker";
import type { TProductCategoriesStore } from "@/hooks/store/use-product-categories";
import { TemplatePageTabs } from "../template-page-header";
import { DeleteBlockedModal, type TDeleteBlocked } from "./delete-blocked-modal";
import { getProductCategoryErrorMessage, getProductCategoryLibraryPath, getProductCategoryModules } from "./helpers";
import { ModuleBulkAddModal } from "./module-bulk-add-modal";
import { NameFormModal } from "./name-form-modal";
import { ProductCategoryModuleTable } from "./product-category-module-table";

const MODULE_KINDS: TProductCategoryLibraryKind[] = ["requirement", "case"];

type Props = {
  workspaceSlug: string;
  category: TProductCategory;
  store: TProductCategoriesStore;
  canManage: boolean;
  /** 当前页签：需求一级模块 / 用例一级模块。由页面持有，换分类时停在同一个页签 */
  kind: TProductCategoryLibraryKind;
  onKindChange: (kind: TProductCategoryLibraryKind) => void;
  /** 进 / 出「调整顺序」时通知页面，页面据此锁住左栏和创建按钮 */
  onSortingChange: (sorting: boolean) => void;
};

/**
 * 产品分类页右侧：分类名 + 编辑 / 删除；「需求一级模块 | 用例一级模块」两个页签，各有自己的在用库与
 * 模块表（添加、调整顺序、行内编辑 / 删除）。
 * 需求清单的增删改排由后端同步到用该分类的标准需求库，用例清单同步到模板用例库。调用方按分类 id 给 key。
 */
export function ProductCategoryDetail({
  workspaceSlug,
  category,
  store,
  canManage,
  kind,
  onKindChange,
  onSortingChange,
}: Props) {
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

  const modules = getProductCategoryModules(category, kind);
  // 同步范围按清单算：需求清单只跟标准需求库，用例清单只跟模板用例库
  const libraries = category.libraries.filter((library) => library.kind === kind);
  const libraryCount = libraries.length;
  const sorting = sortDraft !== null;

  // 卸载（换分类、分类被删）时别把页面留在「排序中」
  useEffect(() => () => onSortingChange(false), [onSortingChange]);

  const startSort = () => {
    setSortDraft(modules);
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
        sortDraft.map((module) => module.id),
        kind
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
            kind: library.kind,
            summary: [
              library.child_count > 0
                ? t("product_categories.blocked.child_count", { count: library.child_count })
                : null,
              library.item_count > 0
                ? t(library.kind === "case" ? "product_categories.blocked.case_count" : "product_categories.blocked.item_count", {
                    count: library.item_count,
                  })
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
      <div className="flex shrink-0 items-center justify-between gap-4 px-7 pt-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="truncate text-20 leading-7 font-semibold text-primary">{category.name}</h2>
          <span className="shrink-0 text-13 text-tertiary">
            {category.libraries.length > 0
              ? t("product_categories.meta_libraries", { count: category.libraries.length })
              : t("product_categories.meta_no_libraries")}
          </span>
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

      {/* 页签行：左边两份清单，右边是当前清单的操作；调整顺序期间不能切页签 */}
      <TemplatePageTabs
        className="mx-7 mt-4 px-0"
        ariaLabel={t("product_categories.modules_title")}
        tabs={MODULE_KINDS.map((key) => ({
          key,
          label: t(`product_categories.module_kind.${key}`),
          count: getProductCategoryModules(category, key).length,
        }))}
        activeKey={kind}
        onChange={onKindChange}
        disabled={sorting}
      >
        {canManage && !sorting && (
          <>
            {modules.length > 1 && (
              <Button variant="secondary" size="xl" className="px-3" onClick={startSort}>
                {t("product_categories.adjust_order")}
              </Button>
            )}
            <Button variant="secondary" size="xl" className="px-3" onClick={() => setIsAddingModules(true)}>
              {t("product_categories.add_module")}
            </Button>
          </>
        )}
      </TemplatePageTabs>

      {sorting ? (
        <div className="mx-7 mt-4 mb-3 flex shrink-0 items-center gap-3 rounded-lg bg-accent-subtle px-4 py-2.5">
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
      ) : libraryCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-7 pt-4 pb-3.5">
          <span className="mr-1 text-13 text-tertiary">{t("product_categories.in_use_libraries")}</span>
          {libraries.map((library) => (
            <Link
              key={library.id}
              to={getProductCategoryLibraryPath(workspaceSlug, library)}
              className="inline-flex h-7 max-w-60 items-center gap-1.5 rounded-md border border-subtle-1 bg-surface-1 pr-2.5 pl-2 text-13 text-primary transition-colors hover:bg-layer-transparent-hover"
            >
              {library.kind === "case" ? (
                <FlaskConical className="size-3.5 shrink-0 text-tertiary" strokeWidth={1.75} />
              ) : (
                <TypeIcon
                  iconProps={library.requirement_type_detail?.logo_props?.icon}
                  className="size-3.5 rounded-none"
                  iconClassName="size-3.5"
                />
              )}
              <span className="truncate">{library.name}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="h-4 shrink-0" />
      )}

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-7 pb-6">
        <div className="overflow-hidden rounded-lg border border-subtle">
          <ProductCategoryModuleTable
            modules={sortDraft ?? modules}
            kind={kind}
            canManage={canManage}
            sorting={sorting}
            onSortChange={setSortDraft}
            onEdit={setModuleToEdit}
            onDelete={setModuleToDelete}
          />
        </div>
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
        kind={kind}
        onSubmit={async (names) => {
          const response = await store.bulkCreateModules(category.id, names, kind);
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
