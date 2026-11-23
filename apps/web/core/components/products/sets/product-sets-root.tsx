import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Pagination } from "antd";
import { AlertCircle, Layers } from "lucide-react";
import {
  PERMISSION_KEYS,
  PRODUCT_SETTINGS_DELETE_PERMISSION_KEY,
  PRODUCT_SETTINGS_EDIT_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductSet } from "@plane/types";
import { AlertModalCore, Avatar, ContentWrapper, ERowVariant, Loader } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import type { TProductSetRequestError } from "@/hooks/store/use-product-sets";
import { useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { hasProductPermission } from "../permissions";
import { ProductSetModal } from "./product-set-modal";

const I18N = "workspace_product_sets";
/** 「产品」列最多直接列出的开发编号个数，其余收成 +N */
const MAX_PRODUCT_CHIPS = 3;
const TEXT_BUTTON = "text-13 font-medium text-accent-primary hover:underline";
const TH = "px-4 py-3 text-left font-medium text-secondary";

function ProductChips({ products }: { products: TProductSet["products"] }) {
  if (products.length === 0) return <span className="text-tertiary">-</span>;
  const hidden = products.length - MAX_PRODUCT_CHIPS;
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      {products.slice(0, MAX_PRODUCT_CHIPS).map((product) => (
        <span
          key={product.id}
          title={product.name}
          className="inline-flex h-[22px] shrink-0 items-center rounded-md border border-subtle px-2 text-12 text-primary tabular-nums"
        >
          {product.identifier}
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-layer-1 px-2 text-12 text-secondary">
          +{hidden}
        </span>
      )}
    </div>
  );
}

/** 产品管理页的「产品集」页签：列表 + 创建 / 编辑 / 删除。搜索词与产品页签共用页头的搜索框。 */
export const ProductSetsRoot = observer(function ProductSetsRoot() {
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { workspaceSlug, sets, searchQuery, openProductSetModal } = useProductsContext();
  const { productSets, isLoading, hasError, fetchProductSets, deleteProductSet } = sets;
  const canCreate = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PRODUCT_CREATE], workspaceSlug);

  // ProductsProvider 在列表与详情间一直挂着，需求 / 用例 / 缺陷数在详情里变了它不知道：每次进列表重拉一次
  useEffect(() => {
    void fetchProductSets().catch(() => undefined);
  }, [fetchProductSets]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredSets = useMemo(
    () =>
      productSets.filter(
        (productSet) =>
          !normalizedSearch ||
          [productSet.name, productSet.identifier].some((text) => text.toLocaleLowerCase().includes(normalizedSearch))
      ),
    [normalizedSearch, productSets]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSets.length]);
  const pageRows = filteredSets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const [setToDelete, setSetToDelete] = useState<TProductSet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    if (!setToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProductSet(setToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast.deleted`) });
      setSetToDelete(null);
    } catch (requestError) {
      const code = (requestError as TProductSetRequestError | undefined)?.code;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t(code === "PRODUCT_SET_HAS_PRODUCTS" ? `${I18N}.errors.product_set_has_products` : `${I18N}.toast.failed`),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const centered = (children: React.ReactNode) => (
    <div className="flex h-full min-h-80 items-center justify-center p-6">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <PageHead title={t(`${I18N}.title`)} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
            <div className="space-y-3 rounded border border-subtle bg-surface-1 p-4">
              {Array.from({ length: 6 }).map((_, row) => (
                <Loader.Item key={row} height="40px" width="100%" />
              ))}
            </div>
          </ContentWrapper>
        ) : hasError ? (
          centered(
            <>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</h2>
              <Button className="mt-4" variant="secondary" onClick={() => void fetchProductSets().catch(() => undefined)}>
                {t("retry")}
              </Button>
            </>
          )
        ) : filteredSets.length === 0 ? (
          centered(
            <>
              <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                <Layers className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">
                {t(normalizedSearch ? `${I18N}.empty.search_title` : `${I18N}.empty.title`)}
              </h2>
              {!normalizedSearch && canCreate && (
                <Button className="mt-4" variant="primary" onClick={() => openProductSetModal()}>
                  {t(`${I18N}.create`)}
                </Button>
              )}
            </>
          )
        ) : (
          <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
            <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
              <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[1120px] table-fixed text-sm">
                  <thead className="border-b border-subtle bg-layer-1">
                    <tr>
                      <th className={TH}>{t(`${I18N}.fields.name`)}</th>
                      <th className={`${TH} w-28`}>{t(`${I18N}.fields.identifier`)}</th>
                      <th className={`${TH} w-80`}>{t(`${I18N}.fields.products`)}</th>
                      <th className={`${TH} w-20 !text-right`}>{t(`${I18N}.fields.requirements`)}</th>
                      <th className={`${TH} w-20 !text-right`}>{t(`${I18N}.fields.cases`)}</th>
                      <th className={`${TH} w-28 !text-right`}>{t(`${I18N}.fields.open_defects`)}</th>
                      <th className={`${TH} w-36`}>{t(`${I18N}.fields.owner`)}</th>
                      <th className={`${TH} w-32`}>{t(`${I18N}.fields.updated_at`)}</th>
                      <th className={`${TH} w-28`}>{t(`${I18N}.fields.actions`)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((productSet) => {
                      const editable = hasProductPermission(productSet, PRODUCT_SETTINGS_EDIT_PERMISSION_KEY);
                      const deletable = hasProductPermission(productSet, PRODUCT_SETTINGS_DELETE_PERMISSION_KEY);
                      return (
                        <tr key={productSet.id} className="border-b border-subtle last:border-b-0 hover:bg-layer-1-hover">
                          <td className="px-4 py-3">
                            <Link
                              to={`/${workspaceSlug}/products/${productSet.id}/overview`}
                              className="block truncate text-sm font-medium text-primary hover:underline"
                            >
                              {productSet.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-13 text-secondary tabular-nums">{productSet.identifier}</td>
                          <td className="px-4 py-3">
                            <ProductChips products={productSet.products} />
                          </td>
                          <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                            {productSet.requirement_count}
                          </td>
                          <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                            {productSet.case_count}
                          </td>
                          <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                            {productSet.open_defect_count}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar
                                size="sm"
                                name={productSet.owner_detail?.display_name}
                                src={getFileURL(productSet.owner_detail?.avatar_url ?? "")}
                                showTooltip={false}
                              />
                              <span className="truncate text-13 text-primary">
                                {productSet.owner_detail?.display_name ?? "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-13 whitespace-nowrap text-secondary">
                            {productSet.updated_at ? renderFormattedDate(productSet.updated_at) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-4">
                              {editable && (
                                <button type="button" className={TEXT_BUTTON} onClick={() => openProductSetModal(productSet)}>
                                  {t(`${I18N}.actions.edit`)}
                                </button>
                              )}
                              {deletable && (
                                <button
                                  type="button"
                                  className="text-13 font-medium text-danger-primary hover:underline"
                                  onClick={() => setSetToDelete(productSet)}
                                >
                                  {t(`${I18N}.actions.delete`)}
                                </button>
                              )}
                              {!editable && !deletable && <span className="text-tertiary">-</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                <span className="text-sm text-secondary">{t(`${I18N}.total`, { count: filteredSets.length })}</span>
                <Pagination
                  simple
                  current={currentPage}
                  pageSize={pageSize}
                  total={filteredSets.length}
                  showSizeChanger
                  pageSizeOptions={["10", "20", "50", "100"]}
                  onChange={(page, size) => {
                    setCurrentPage(page);
                    setPageSize(size);
                  }}
                  size="small"
                />
              </div>
            </div>
          </ContentWrapper>
        )}
      </div>
      <ProductSetModal />
      <AlertModalCore
        isOpen={Boolean(setToDelete)}
        handleClose={() => !isDeleting && setSetToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={t(`${I18N}.delete.title`)}
        content={t(`${I18N}.delete.description`, { name: setToDelete?.name ?? "" })}
        primaryButtonText={{ default: t(`${I18N}.actions.delete`), loading: t(`${I18N}.delete.deleting`) }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
});
