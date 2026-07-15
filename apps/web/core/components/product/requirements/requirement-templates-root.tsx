import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { Pagination } from "antd";
import { Eye, FileSliders, Package, Pencil, Power, Search, Trash2 } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Breadcrumbs, Header, Input } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import type { TProductDetailOutletContext } from "@/components/product/product-detail-layout";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";
import { useUserPermissions } from "@/hooks/store/user";
import type { TRequirementTemplateSummary } from "@/services/requirement-structure.service";

type TStatusFilter = "all" | "active" | "inactive";
type TSort = "updated_desc" | "updated_asc" | "name_asc";

const PAGE_SIZE = 20;

export function RequirementTemplatesRoot() {
  const { productId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const { error: productError, isLoading: isProductLoading, product } = useOutletContext<TProductDetailOutletContext>();
  const { allowPermissions } = useUserPermissions();
  const { deleteTemplate, error, fetchTemplates, isLoading, isMutating, templates, updateTemplateStatus } =
    useRequirementTemplates(slug, id);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TStatusFilter>("all");
  const [sort, setSort] = useState<TSort>("updated_desc");
  const [page, setPage] = useState(1);
  const [deletingTemplate, setDeletingTemplate] = useState<TRequirementTemplateSummary>();

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  useEffect(() => {
    if (slug && id) void fetchTemplates().catch(() => undefined);
  }, [fetchTemplates, id, slug]);

  useEffect(() => setPage(1), [searchQuery, sort, statusFilter]);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const filtered = templates.filter((template) => {
      if (statusFilter === "active" && !template.is_active) return false;
      if (statusFilter === "inactive" && template.is_active) return false;
      return !query || `${template.name} ${template.description}`.toLocaleLowerCase().includes(query);
    });
    return [...filtered].sort((left, right) => {
      if (sort === "name_asc") return left.name.localeCompare(right.name, "zh-CN");
      const difference = new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
      return sort === "updated_asc" ? difference : -difference;
    });
  }, [searchQuery, sort, statusFilter, templates]);

  const visibleTemplates = filteredTemplates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const basePath = slug && id ? `/${slug}/products/${id}/requirement-templates` : "#";

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
    if (page > lastPage) setPage(lastPage);
  }, [filteredTemplates.length, page]);

  const toggleTemplate = async (template: TRequirementTemplateSummary) => {
    try {
      await updateTemplateStatus(template.id, template.revision, !template.is_active);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: template.is_active ? "模板已停用" : "模板已启用",
        message: template.is_active ? "新建需求时将不再显示该模板。" : "新建结构化需求时可以选择该模板。",
      });
    } catch (mutationError: any) {
      if (mutationError?.code === "REQUIREMENT_TEMPLATE_STALE") await fetchTemplates().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "状态更新失败",
        message: mutationError?.error ?? "请刷新后重试。",
      });
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={!!deletingTemplate}
        title="删除需求模板"
        content={`删除“${deletingTemplate?.name ?? ""}”后将无法继续用于新需求，已经导入该模板的需求不会受到影响。`}
        isSubmitting={isMutating}
        handleClose={() => setDeletingTemplate(undefined)}
        handleSubmit={async () => {
          if (!deletingTemplate) return;
          try {
            await deleteTemplate(deletingTemplate.id);
            setDeletingTemplate(undefined);
            setToast({ type: TOAST_TYPE.SUCCESS, title: "模板已删除", message: "已有需求数据未受影响。" });
          } catch (mutationError: any) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "删除失败",
              message: mutationError?.error ?? "请稍后重试。",
            });
          }
        }}
      />

      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label="产品管理"
                      href={slug ? `/${slug}/products` : undefined}
                      icon={<Package className="size-4 text-tertiary" />}
                    />
                  }
                />
                {product && <Breadcrumbs.Item component={<BreadcrumbLink label={product.name} />} />}
                <Breadcrumbs.Item component={<BreadcrumbLink label="需求模板" />} />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              {canManage && (
                <Link href={`${basePath}/new`}>
                  <Button variant="primary" size="lg">
                    创建需求模板
                  </Button>
                </Link>
              )}
            </Header.RightItem>
          </Header>
        }
      />

      <ContentWrapper>
        <PageHead title={product ? `${product.name} - 需求模板` : "需求模板"} />
        {isProductLoading || isLoading ? (
          <div className="h-full animate-pulse rounded border border-subtle bg-surface-1 p-4">
            <div className="mb-4 h-9 rounded bg-layer-1" />
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="mb-2 h-14 rounded bg-layer-1" />
            ))}
          </div>
        ) : productError || !product || error ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-15 font-medium text-primary">需求模板加载失败</p>
              <p className="mt-1 text-13 text-secondary">请检查网络后重新加载。</p>
              <Button variant="secondary" size="lg" className="mt-4" onClick={() => void fetchTemplates()}>
                重新加载
              </Button>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1">
                <FileSliders className="size-5 text-secondary" />
              </span>
              <h1 className="mt-4 text-16 font-semibold text-primary">还没有需求模板</h1>
              <p className="mt-1 text-13 leading-5 text-secondary">
                将常用的结构化字段保存为模板，创建研发需求时即可直接复用。
              </p>
              {canManage && (
                <Link href={`${basePath}/new`}>
                  <Button variant="primary" size="lg" className="mt-4">
                    创建第一个需求模板
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-subtle bg-surface-1">
            <div className="flex flex-wrap items-center gap-2 border-b border-subtle p-3">
              <div className="relative min-w-56 flex-1 md:max-w-96">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-placeholder" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索模板名称或描述"
                  className="h-9 pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TStatusFilter)}
                className="h-9 rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none"
                aria-label="筛选模板状态"
              >
                <option value="all">全部状态</option>
                <option value="active">已启用</option>
                <option value="inactive">已停用</option>
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as TSort)}
                className="h-9 rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none"
                aria-label="模板排序"
              >
                <option value="updated_desc">最近更新</option>
                <option value="updated_asc">最早更新</option>
                <option value="name_asc">按名称</option>
              </select>
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <p className="text-14 font-medium text-primary">没有匹配的需求模板</p>
                  <p className="mt-1 text-12 text-secondary">尝试调整关键词或状态筛选。</p>
                </div>
              </div>
            ) : (
              <>
                <div className="vertical-scrollbar min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[860px] text-12">
                    <thead className="sticky top-0 z-10 border-b border-subtle bg-layer-1">
                      <tr className="text-left text-secondary">
                        <th className="px-4 py-3 font-medium">模板名称</th>
                        <th className="px-4 py-3 font-medium">字段数</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">修订</th>
                        <th className="px-4 py-3 font-medium">更新时间</th>
                        <th className="w-32 px-4 py-3 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {visibleTemplates.map((template) => (
                        <tr key={template.id} className="transition-colors hover:bg-layer-1-hover">
                          <td className="max-w-lg px-4 py-3">
                            <Link href={`${basePath}/${template.id}`} className="block min-w-0">
                              <span className="block truncate text-13 font-medium text-primary">{template.name}</span>
                              <span className="mt-0.5 block truncate text-11 text-tertiary">
                                {template.description || "暂无描述"}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-secondary">{template.field_count}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-11 font-medium ${
                                template.is_active
                                  ? "bg-success-subtle text-success-primary"
                                  : "bg-layer-2 text-secondary"
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  template.is_active ? "bg-success-primary" : "bg-placeholder"
                                }`}
                              />
                              {template.is_active ? "已启用" : "已停用"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-secondary">R{template.revision}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-secondary">
                            {renderFormattedDate(template.updated_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`${basePath}/${template.id}`}
                                className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-2 hover:text-primary"
                                aria-label={canManage ? "编辑需求模板" : "查看需求模板"}
                              >
                                {canManage ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
                              </Link>
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => void toggleTemplate(template)}
                                    className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-2 hover:text-primary disabled:opacity-50"
                                    aria-label={template.is_active ? "停用需求模板" : "启用需求模板"}
                                  >
                                    <Power className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => setDeletingTemplate(template)}
                                    className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger-primary disabled:opacity-50"
                                    aria-label="删除需求模板"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredTemplates.length > PAGE_SIZE && (
                  <div className="flex shrink-0 justify-end border-t border-subtle px-4 py-3">
                    <Pagination
                      current={page}
                      pageSize={PAGE_SIZE}
                      total={filteredTemplates.length}
                      showSizeChanger={false}
                      onChange={setPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ContentWrapper>
    </>
  );
}
