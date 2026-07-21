import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { AlertCircle, Eye, Globe2, LockKeyhole, PackageOpen, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProduct } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { Avatar, AvatarGroup, CustomMenu, Loader } from "@plane/ui";
import { calculateTimeAgo, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { DeleteProductModal } from "./delete-modal";
import { ProductModal } from "./modal";
import { useProductsContext } from "./context";

const ProductPeople = ({ product, type }: { product: TProduct; type: "owner" | "reviewers" }) => {
  if (type === "owner") {
    return (
      <div className="flex items-center gap-2">
        <Avatar
          size="sm"
          name={product.owner_detail?.display_name}
          src={getFileURL(product.owner_detail?.avatar_url ?? "")}
          showTooltip={false}
        />
        <span className="max-w-32 truncate text-12 text-primary">{product.owner_detail?.display_name ?? "-"}</span>
      </div>
    );
  }
  if (!product.reviewer_details.length) return <span className="text-placeholder">-</span>;
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
  const filteredProducts = normalizedSearch
    ? products.filter((product) => product.name.toLocaleLowerCase().includes(normalizedSearch))
    : products;

  return (
    <>
      <PageHead title={t("workspace_products.title")} />
      <div className="h-full overflow-auto bg-surface-1">
        {isLoading ? (
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(280px,1.7fr)_180px_150px_110px_130px_52px] gap-4 border-b border-subtle bg-layer-1 px-5 py-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Loader.Item key={index} height="14px" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, row) => (
              <div
                key={row}
                className="grid grid-cols-[minmax(280px,1.7fr)_180px_150px_110px_130px_52px] items-center gap-4 border-b border-subtle px-5 py-3"
              >
                <Loader.Item height="34px" />
                <Loader.Item height="24px" />
                <Loader.Item height="24px" />
                <Loader.Item height="24px" />
                <Loader.Item height="16px" />
                <Loader.Item height="24px" />
              </div>
            ))}
          </div>
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
          <div className="min-w-[920px]">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-layer-1">
                <tr className="border-b border-subtle text-11 font-medium text-secondary">
                  <th className="w-[38%] px-5 py-2.5">{t("workspace_products.fields.name")}</th>
                  <th className="w-[18%] px-4 py-2.5">{t("workspace_products.fields.owner")}</th>
                  <th className="w-[15%] px-4 py-2.5">{t("workspace_products.fields.reviewers")}</th>
                  <th className="w-[12%] px-4 py-2.5">{t("workspace_products.fields.visibility")}</th>
                  <th className="w-[13%] px-4 py-2.5">{t("workspace_products.fields.updated_at")}</th>
                  <th className="w-12 px-3 py-2.5">
                    <span className="sr-only">{t("workspace_products.fields.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="group border-b border-subtle hover:bg-layer-transparent-hover">
                    <td className="px-5 py-3 align-middle">
                      <Link to={`/${slug}/products/${product.id}/dashboard`} className="block max-w-full text-left">
                        <span className="block truncate text-13 font-medium text-primary group-hover:text-accent-primary">
                          {product.name}
                        </span>
                        <span className="mt-0.5 block truncate text-11 text-secondary">
                          {product.description_html
                            ? stripAndTruncateHTML(product.description_html, 110)
                            : t("workspace_products.fields.no_description")}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <ProductPeople product={product} type="owner" />
                    </td>
                    <td className="px-4 py-3">
                      <ProductPeople product={product} type="reviewers" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-layer-2 px-2 py-1 text-11 text-secondary">
                        {product.network === 0 ? <LockKeyhole className="size-3" /> : <Globe2 className="size-3" />}
                        {t(
                          product.network === 0
                            ? "workspace_products.visibility.private"
                            : "workspace_products.visibility.public"
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-11 text-secondary">{calculateTimeAgo(product.updated_at)}</td>
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <CustomMenu ellipsis placement="bottom-end">
                        <CustomMenu.MenuItem onClick={() => openProductModal("view", product)}>
                          <Eye className="size-3.5" /> {t("workspace_products.actions.view")}
                        </CustomMenu.MenuItem>
                        {canManage(product) && (
                          <>
                            <CustomMenu.MenuItem onClick={() => openProductModal("edit", product)}>
                              <Pencil className="size-3.5" /> {t("workspace_products.actions.edit")}
                            </CustomMenu.MenuItem>
                            <CustomMenu.MenuItem onClick={() => setProductToDelete(product)}>
                              <Trash2 className="size-3.5" /> {t("workspace_products.actions.delete")}
                            </CustomMenu.MenuItem>
                          </>
                        )}
                      </CustomMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ProductModal />
      <DeleteProductModal />
    </>
  );
});
