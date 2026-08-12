import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { Pagination } from "antd";
import { AlertCircle, Eye, Globe2, LockKeyhole, PackageOpen, Pencil, Settings, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProduct } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { Avatar, AvatarGroup, ContentWrapper, ERowVariant, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { DeleteProductModal } from "./delete-modal";
import { ProductModal } from "./modal";
import { useProductsContext } from "./context";

const ProductPeople = ({ product, type }: { product: TProduct; type: "owner" | "reviewers" }) => {
  if (type === "owner") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Avatar
          size="sm"
          name={product.owner_detail?.display_name}
          src={getFileURL(product.owner_detail?.avatar_url ?? "")}
          showTooltip={false}
        />
        <span className="truncate text-xs text-primary">{product.owner_detail?.display_name ?? "-"}</span>
      </div>
    );
  }
  if (!product.reviewer_details.length) return <span className="text-secondary">-</span>;
  return (
    <AvatarGroup showTooltip>
      {product.reviewer_details.map((reviewer) => (
        <Avatar key={reviewer.id} size="sm" name={reviewer.display_name} src={getFileURL(reviewer.avatar_url ?? "")} />
      ))}
    </AvatarGroup>
  );
};

export const ProductsRoot = observer(function ProductsRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { products, searchQuery, isLoading, error, fetchProducts, openProductModal, setProductToDelete } =
    useProductsContext();
  const slug = workspaceSlug?.toString() ?? "";
  const workspaceInfo = workspaceInfoBySlug(slug);
  const isWorkspaceAdmin = workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(slug);
  const canCreate = workspaceInfo?.role === EUserWorkspaceRoles.MEMBER || isWorkspaceAdmin;
  const canManage = (product: TProduct) => isWorkspaceAdmin || product.owner === currentUser?.id;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredProducts = useMemo(
    () =>
      normalizedSearch
        ? products.filter((product) => product.name.toLocaleLowerCase().includes(normalizedSearch))
        : products,
    [normalizedSearch, products]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredProducts.length, normalizedSearch]);

  const total = filteredProducts.length;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(currentPage * pageSize, total);
  const currentPageProducts = useMemo(
    () => filteredProducts.slice(startIndex, startIndex + pageSize),
    [filteredProducts, startIndex, pageSize]
  );
  const handlePaginationChange = useCallback((page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  }, []);

  return (
    <>
      <PageHead title={t("workspace_products.title")} />
      {isLoading ? (
        <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
          <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
            <div className="min-h-0 flex-1 overflow-auto vertical-scrollbar scrollbar-lg p-4">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, row) => (
                  <Loader.Item key={row} height="40px" width="100%" />
                ))}
              </div>
            </div>
          </div>
        </ContentWrapper>
      ) : error ? (
        <div className="flex h-full min-h-80 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t("workspace_products.error.title")}</h2>
            <p className="mt-1 text-12 text-secondary">{t("workspace_products.error.description")}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void fetchProducts().catch(() => undefined)}>
              {t("retry")}
            </Button>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex h-full min-h-80 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <PackageOpen className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">
              {normalizedSearch ? t("workspace_products.empty.search_title") : t("workspace_products.empty.title")}
            </h2>
            <p className="mt-1 text-12 leading-5 text-secondary">
              {normalizedSearch
                ? t("workspace_products.empty.search_description")
                : t("workspace_products.empty.description")}
            </p>
            {!normalizedSearch && canCreate && (
              <Button className="mt-4" variant="primary" onClick={() => openProductModal("create")}>
                {t("workspace_products.create_product")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
          <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
            <div className="min-h-0 flex-1 overflow-auto vertical-scrollbar scrollbar-lg">
              <table className="w-full min-w-[920px] table-fixed text-sm">
                <thead className="border-b border-subtle bg-layer-1">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-secondary">
                      {t("workspace_products.fields.name")}
                    </th>
                    <th className="hidden w-40 px-4 py-3 text-left font-medium text-secondary sm:table-cell">
                      {t("workspace_products.fields.owner")}
                    </th>
                    <th className="hidden w-36 px-4 py-3 text-left font-medium text-secondary md:table-cell">
                      {t("workspace_products.fields.reviewers")}
                    </th>
                    <th className="hidden w-28 px-4 py-3 text-left font-medium text-secondary lg:table-cell">
                      {t("workspace_products.fields.visibility")}
                    </th>
                    <th className="hidden w-36 px-4 py-3 text-left font-medium text-secondary lg:table-cell">
                      {t("workspace_products.fields.updated_at")}
                    </th>
                    <th className="w-40 px-4 py-3 text-left font-medium text-secondary">
                      {t("workspace_products.fields.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentPageProducts.map((product) => {
                    const manageable = canManage(product);
                    const settingsPath = `/${slug}/settings/products/${product.id}`;

                    return (
                      <tr key={product.id} className="hover:bg-layer-1-hover">
                        <td className="px-4 py-3">
                          <Link
                            to={`/${slug}/products/${product.id}/dashboard`}
                            className="flex min-w-0 items-center gap-1.5 text-primary"
                          >
                            <span className="grid size-4 shrink-0 place-items-center">
                              {product.logo_props?.in_use ? (
                                <Logo logo={product.logo_props} size={14} />
                              ) : (
                                <PackageOpen className="size-3.5 text-secondary" />
                              )}
                            </span>
                            <p className="min-w-0 truncate text-sm font-medium text-primary">{product.name}</p>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <ProductPeople product={product} type="owner" />
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <ProductPeople product={product} type="reviewers" />
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                            {product.network === 0 ? (
                              <LockKeyhole className="size-3 text-secondary" />
                            ) : (
                              <Globe2 className="size-3 text-secondary" />
                            )}
                            {t(
                              product.network === 0
                                ? "workspace_products.visibility.private"
                                : "workspace_products.visibility.public"
                            )}
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-secondary lg:table-cell">
                          {product.updated_at ? renderFormattedDate(product.updated_at) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-start gap-2">
                            <Tooltip
                              tooltipContent={
                                <div className="text-xs text-primary">{t("workspace_products.actions.view")}</div>
                              }
                              position="top"
                            >
                              <button
                                type="button"
                                className="grid h-6 w-6 place-items-center rounded text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary"
                                aria-label={t("workspace_products.actions.view")}
                                onClick={() => openProductModal("view", product)}
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            </Tooltip>
                            <Tooltip
                              tooltipContent={
                                <div className="text-xs text-primary">
                                  {manageable
                                    ? t("workspace_products.actions.edit")
                                    : t("workspace_products.actions.no_permission_edit")}
                                </div>
                              }
                              position="top"
                            >
                              <button
                                type="button"
                                disabled={!manageable}
                                className={cn(
                                  "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                                  manageable
                                    ? "hover:bg-layer-1-hover hover:text-primary"
                                    : "cursor-not-allowed opacity-50"
                                )}
                                aria-label={t("workspace_products.actions.edit")}
                                onClick={() => manageable && openProductModal("edit", product)}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </Tooltip>
                            <Tooltip
                              tooltipContent={
                                <div className="text-xs text-primary">
                                  {manageable
                                    ? t("workspace_products.actions.delete")
                                    : t("workspace_products.actions.no_permission_delete")}
                                </div>
                              }
                              position="top"
                            >
                              <button
                                type="button"
                                disabled={!manageable}
                                className={cn(
                                  "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
                                  manageable
                                    ? "hover:bg-layer-1-hover hover:text-primary"
                                    : "cursor-not-allowed opacity-50"
                                )}
                                aria-label={t("workspace_products.actions.delete")}
                                onClick={() => manageable && setProductToDelete(product)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Tooltip>
                            <Tooltip
                              tooltipContent={<div className="text-xs text-primary">{t("settings")}</div>}
                              position="top"
                            >
                              <Link
                                to={settingsPath}
                                className="flex items-center justify-center rounded p-1 text-placeholder hover:bg-layer-1-hover hover:text-primary"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </Link>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-secondary">
                  {total > 0 ? `第 ${startIndex + 1}-${endIndex} 条，共 ${total} 条` : ""}
                </span>
              </div>
              <Pagination
                simple
                current={currentPage}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                pageSizeOptions={["10", "20", "50", "100"]}
                onChange={handlePaginationChange}
                onShowSizeChange={handlePaginationChange}
                size="small"
              />
            </div>
          </div>
        </ContentWrapper>
      )}
      <ProductModal />
      <DeleteProductModal />
    </>
  );
});
