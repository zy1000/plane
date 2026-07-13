import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pagination } from "antd";
import { ArrowDown, ArrowUp, ArrowUpDown, Package } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Avatar, Breadcrumbs, Header } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import { useProducts } from "@/hooks/store/use-products";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { CreateProductModal } from "./create-product-modal";
import { ProductSearch } from "./search-products";

type TSortKey = "name" | "created_at";
type TSortDirection = "asc" | "desc";

export const ProductPageRoot = observer(function ProductPageRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const { createProduct, error, fetchProducts, isLoading, products } = useProducts(slug);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<TSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<TSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  useEffect(() => {
    void fetchProducts().catch(() => undefined);
  }, [fetchProducts]);

  useEffect(() => setCurrentPage(1), [searchQuery, sortDirection, sortKey]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? products.filter((product) => product.name.toLocaleLowerCase().includes(normalizedQuery))
      : products;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return factor * a.name.localeCompare(b.name);
      return factor * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }, [products, searchQuery, sortDirection, sortKey]);

  const currentProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(currentPage * pageSize, filteredProducts.length);

  const handleSort = (key: TSortKey) => {
    if (sortKey === key) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortIcon = (key: TSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-placeholder" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 产品管理` : "产品管理";

  return (
    <>
      {slug && (
        <CreateProductModal
          isOpen={isCreateModalOpen}
          workspaceSlug={slug}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={createProduct}
        />
      )}
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={<BreadcrumbLink label="产品管理" icon={<Package className="size-4 text-tertiary" />} />}
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <ProductSearch searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} />
              {canCreate && (
                <Button variant="primary" size="lg" onClick={() => setIsCreateModalOpen(true)}>
                  创建产品
                </Button>
              )}
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper>
        <PageHead title={pageTitle} />
        {isLoading ? (
          <div className="h-full animate-pulse rounded border border-subtle bg-surface-1 p-4">
            <div className="mb-4 h-9 rounded bg-layer-1" />
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="mb-2 h-14 rounded bg-layer-1" />
            ))}
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <p className="text-15 font-medium text-primary">产品列表加载失败</p>
              <p className="mt-1 text-13 text-secondary">请检查网络后重试。</p>
              <Button variant="secondary" size="lg" className="mt-4" onClick={() => void fetchProducts()}>
                重新加载
              </Button>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="max-w-sm text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1">
                <Package className="size-5 text-secondary" />
              </span>
              <h2 className="mt-4 text-16 font-semibold text-primary">还没有产品</h2>
              <p className="mt-1 text-13 leading-5 text-secondary">创建产品后，可以为需求和后续交付建立清晰的归属。</p>
              {canCreate && (
                <Button variant="primary" size="lg" className="mt-4" onClick={() => setIsCreateModalOpen(true)}>
                  创建第一个产品
                </Button>
              )}
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-15 font-medium text-primary">没有匹配的产品</p>
              <p className="mt-1 text-13 text-secondary">尝试使用其他关键词。</p>
            </div>
          </div>
        ) : (
          <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
            <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-subtle bg-layer-1">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-secondary">
                      <button
                        type="button"
                        className="flex items-center gap-1 transition-colors hover:text-primary"
                        onClick={() => handleSort("name")}
                      >
                        产品名称
                        {sortIcon("name")}
                      </button>
                    </th>
                    <th className="hidden px-4 py-3 text-left font-medium text-secondary sm:table-cell">负责人</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3 text-left font-medium text-secondary">访问级别</th>
                    <th className="hidden px-4 py-3 text-left font-medium text-secondary lg:table-cell">
                      <button
                        type="button"
                        className="flex items-center gap-1 transition-colors hover:text-primary"
                        onClick={() => handleSort("created_at")}
                      >
                        创建时间
                        {sortIcon("created_at")}
                      </button>
                    </th>
                    <th className="hidden px-4 py-3 text-left font-medium text-secondary md:table-cell">更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-layer-1-hover">
                      <td className="px-4 py-3">
                        <Link
                          href={slug ? `/${slug}/products/${product.id}/settings` : "#"}
                          className="flex min-w-0 items-center gap-1.5 text-primary"
                        >
                          <span className="grid size-4 flex-shrink-0 place-items-center">
                            <Package className="size-3.5 text-secondary" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium text-primary">{product.name}</span>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {product.owner_detail ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar
                              name={product.owner_detail.display_name}
                              src={getFileURL(product.owner_detail.avatar_url)}
                              showTooltip={false}
                            />
                            <span className="truncate text-xs text-primary">{product.owner_detail.display_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-placeholder">未分配</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                          <ProjectNetworkIcon iconKey={product.network === 2 ? "Globe2" : "Lock"} />
                          {product.network === 2 ? "公开" : "私密"}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-secondary lg:table-cell">
                        {renderFormattedDate(product.created_at)}
                      </td>
                      <td className="hidden px-4 py-3 text-secondary md:table-cell">
                        {renderFormattedDate(product.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
              <span className="text-sm text-secondary">
                第 {startIndex + 1}-{endIndex} 条，共 {filteredProducts.length} 条
              </span>
              <Pagination
                simple
                current={currentPage}
                pageSize={pageSize}
                total={filteredProducts.length}
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
        )}
      </ContentWrapper>
    </>
  );
});
